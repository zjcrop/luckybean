package com.luckybean.app.backup;

import android.content.Context;
import android.net.Uri;

import com.luckybean.app.BuildConfig;
import com.luckybean.app.data.CanonicalJson;
import com.luckybean.app.data.LuckyBeanDao;
import com.luckybean.app.data.LuckyBeanDatabase;
import com.luckybean.app.data.MigrationRecord;
import com.luckybean.app.data.MigrationState;
import com.luckybean.app.data.NativeRecord;

import org.json.JSONArray;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoResult;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

public final class BackupArchiveService {
    private static final String FORMAT = "luckybean-backup-v1";
    private static final int FORMAT_VERSION = 1;
    private static final long MAX_ARCHIVE_BYTES = 1024L * 1024L * 1024L;
    private static final long MAX_ENTRY_BYTES = 256L * 1024L * 1024L;
    private static final Set<String> STORES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        "beans", "brewSessions", "sensoryRecords", "inventoryEvents", "settings",
        "customCodes", "codebookCache", "syncMetadata", "shareDrafts",
        "attachments", "syncOutbox", "syncTombstones", "schemaMetadata"
    )));

    private final Context context;
    private final LuckyBeanDatabase database;
    private final LuckyBeanDao dao;

    public BackupArchiveService(Context context) {
        this.context = context.getApplicationContext();
        database = LuckyBeanDatabase.get(context);
        dao = database.dao();
    }

    public void exportTo(Uri destination, GeckoResult<Object> result) {
        try {
            JSONObject response = writeArchive(destination);
            result.complete(response);
        } catch (Exception error) {
            result.completeExceptionally(error);
        }
    }

    public void importFrom(Uri source, GeckoResult<Object> result) {
        try {
            JSONObject response = restoreArchive(source);
            result.complete(response);
        } catch (Exception error) {
            result.completeExceptionally(error);
        }
    }

    private JSONObject writeArchive(Uri destination) throws Exception {
        String createdAt = Instant.now().toString();
        Map<String, byte[]> databaseFiles = new HashMap<>();
        JSONObject counts = new JSONObject();
        JSONObject checksums = new JSONObject();

        List<String> orderedStores = new ArrayList<>(STORES);
        Collections.sort(orderedStores);
        for (String store : orderedStores) {
            List<NativeRecord> records = dao.all(store);
            StringBuilder jsonl = new StringBuilder();
            for (NativeRecord record : records) {
                JSONObject wrapper = new JSONObject();
                wrapper.put("id", record.recordId);
                wrapper.put("value", new JSONObject(record.json));
                jsonl.append(CanonicalJson.stringify(wrapper)).append('\n');
            }
            byte[] bytes = jsonl.toString().getBytes(StandardCharsets.UTF_8);
            String path = "database/" + store + ".jsonl";
            databaseFiles.put(path, bytes);
            counts.put(store, records.size());
            checksums.put(path, sha256(bytes));
        }

        File attachmentsRoot = new File(context.getFilesDir(), "attachments");
        List<FileEntry> attachments = collectFiles(attachmentsRoot, "attachments/");
        JSONArray attachmentManifest = new JSONArray();
        for (FileEntry attachment : attachments) {
            JSONObject item = new JSONObject();
            item.put("path", attachment.archivePath);
            item.put("bytes", attachment.file.length());
            item.put("sha256", sha256(attachment.file));
            attachmentManifest.put(item);
            checksums.put(attachment.archivePath, item.getString("sha256"));
        }

        JSONObject manifest = new JSONObject();
        manifest.put("format", FORMAT);
        manifest.put("formatVersion", FORMAT_VERSION);
        manifest.put("appVersion", BuildConfig.VERSION_NAME);
        manifest.put("coreVersion", "2.0.0-alpha.1");
        manifest.put("schemaVersion", 3);
        manifest.put("syncProtocolVersion", 2);
        manifest.put("createdAt", createdAt);
        manifest.put("encrypted", false);
        manifest.put("counts", counts);
        manifest.put("checksums", checksums);
        manifest.put("attachments", attachmentManifest);

        byte[] manifestBytes = manifest.toString(2).getBytes(StandardCharsets.UTF_8);
        byte[] checksumBytes = checksums.toString(2).getBytes(StandardCharsets.UTF_8);

        try (OutputStream raw = context.getContentResolver().openOutputStream(destination, "wt");
             ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(require(raw, "无法打开备份目标")))) {
            putBytes(zip, "manifest.json", manifestBytes);
            for (Map.Entry<String, byte[]> entry : databaseFiles.entrySet()) {
                putBytes(zip, entry.getKey(), entry.getValue());
            }
            for (FileEntry attachment : attachments) putFile(zip, attachment.archivePath, attachment.file);
            putBytes(zip, "checksums.json", checksumBytes);
        }

        return new JSONObject()
            .put("saved", true)
            .put("uri", destination.toString())
            .put("createdAt", createdAt)
            .put("recordCount", sumCounts(counts))
            .put("attachmentCount", attachments.size())
            .put("format", FORMAT);
    }

    private JSONObject restoreArchive(Uri source) throws Exception {
        String restoreId = "restore-" + UUID.randomUUID();
        File importRoot = new File(context.getFilesDir(), "backup-imports/" + restoreId);
        File extractedRoot = new File(importRoot, "extracted");
        File sourceCopy = new File(importRoot, "source.luckybean");
        if (!extractedRoot.mkdirs()) throw new IllegalStateException("无法建立备份导入目录");

        copySource(source, sourceCopy);
        extractSafely(sourceCopy, extractedRoot);

        File manifestFile = new File(extractedRoot, "manifest.json");
        JSONObject manifest = new JSONObject(readUtf8(manifestFile));
        if (!FORMAT.equals(manifest.optString("format")) || manifest.optInt("formatVersion") != FORMAT_VERSION) {
            throw new IllegalArgumentException("备份格式或版本不受支持");
        }
        JSONObject expectedChecksums = manifest.getJSONObject("checksums");
        JSONArray errors = verifyExtracted(extractedRoot, expectedChecksums);
        if (errors.length() > 0) throw new IllegalStateException("备份校验失败：" + errors);

        MigrationState state = new MigrationState();
        state.migrationId = restoreId;
        state.sourceDatabase = "luckybean-archive";
        state.sourceVersion = manifest.optInt("schemaVersion", 0);
        state.targetSchemaVersion = 3;
        state.status = "staging";
        state.startedAt = Instant.now().toString();
        state.snapshotPath = sourceCopy.getAbsolutePath();
        state.reportJson = manifest.toString();
        dao.putMigrationState(state);
        dao.clearStaging(restoreId);

        int stagedCount = stageDatabaseFiles(restoreId, extractedRoot, manifest);
        JSONObject promotion = promoteSafely(restoreId);
        JSONObject attachmentResult = promoteAttachments(extractedRoot, restoreId);

        state = dao.migrationState(restoreId);
        if (state == null) state = new MigrationState();
        state.migrationId = restoreId;
        state.status = "complete";
        state.completedAt = Instant.now().toString();
        state.snapshotPath = sourceCopy.getAbsolutePath();
        state.reportJson = new JSONObject()
            .put("manifest", manifest)
            .put("database", promotion)
            .put("attachments", attachmentResult)
            .toString();
        dao.putMigrationState(state);
        dao.clearStaging(restoreId);

        return new JSONObject()
            .put("restored", true)
            .put("restoreId", restoreId)
            .put("sourceArchive", sourceCopy.getAbsolutePath())
            .put("stagedRecords", stagedCount)
            .put("database", promotion)
            .put("attachments", attachmentResult);
    }

    private int stageDatabaseFiles(String restoreId, File extractedRoot, JSONObject manifest) throws Exception {
        JSONObject expectedCounts = manifest.getJSONObject("counts");
        int total = 0;
        for (String store : STORES) {
            File file = new File(extractedRoot, "database/" + store + ".jsonl");
            int count = 0;
            List<MigrationRecord> batch = new ArrayList<>();
            if (file.isFile()) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.isBlank()) continue;
                        JSONObject wrapper = new JSONObject(line);
                        String id = wrapper.getString("id");
                        String canonical = CanonicalJson.stringify(wrapper.get("value"));
                        MigrationRecord record = new MigrationRecord();
                        record.migrationId = restoreId;
                        record.storeName = store;
                        record.recordId = id;
                        record.json = canonical;
                        record.contentHash = CanonicalJson.sha256(canonical);
                        batch.add(record);
                        count++;
                        if (batch.size() >= 200) {
                            dao.stageAll(batch);
                            batch.clear();
                        }
                    }
                }
            }
            if (!batch.isEmpty()) dao.stageAll(batch);
            int expected = expectedCounts.optInt(store, 0);
            if (count != expected) throw new IllegalStateException(store + " 记录数量不一致");
            total += count;
        }
        return total;
    }

    private JSONObject promoteSafely(String restoreId) throws Exception {
        List<MigrationRecord> staged = dao.staged(restoreId);
        List<NativeRecord> writes = new ArrayList<>();
        List<NativeRecord> conflicts = new ArrayList<>();
        int inserted = 0;
        int replaced = 0;
        int identical = 0;
        int preservedLocal = 0;
        String now = Instant.now().toString();

        for (MigrationRecord imported : staged) {
            NativeRecord local = dao.get(imported.storeName, imported.recordId);
            if (local == null) {
                writes.add(toNative(imported, now, "backup-restore:" + restoreId));
                inserted++;
                continue;
            }
            if (local.contentHash.equals(imported.contentHash)) {
                identical++;
                continue;
            }

            JSONObject localJson = new JSONObject(local.json);
            JSONObject importedJson = new JSONObject(imported.json);
            int localRevision = Math.max(0, localJson.optInt("revision", 0));
            int importedRevision = Math.max(0, importedJson.optInt("revision", 0));
            String localTime = localJson.optString("updatedAt", "");
            String importedTime = importedJson.optString("updatedAt", "");
            boolean importedWins = importedRevision > localRevision
                || (importedRevision == localRevision && importedTime.compareTo(localTime) > 0);

            NativeRecord conflict = new NativeRecord();
            conflict.storeName = "syncMetadata";
            conflict.recordId = "restore.conflict." + restoreId + "." + imported.storeName + "." + imported.recordId;
            JSONObject conflictJson = new JSONObject()
                .put("id", conflict.recordId)
                .put("restoreId", restoreId)
                .put("store", imported.storeName)
                .put("recordId", imported.recordId)
                .put("winner", importedWins ? "imported" : "local")
                .put("local", localJson)
                .put("imported", importedJson)
                .put("createdAt", now);
            conflict.json = CanonicalJson.stringify(conflictJson);
            conflict.updatedAt = now;
            conflict.source = "backup-conflict";
            conflict.contentHash = CanonicalJson.sha256(conflict.json);
            conflicts.add(conflict);

            if (importedWins) {
                writes.add(toNative(imported, now, "backup-restore:" + restoreId));
                replaced++;
            } else {
                preservedLocal++;
            }
        }

        database.runInTransaction(() -> {
            if (!writes.isEmpty()) dao.putAll(writes);
            if (!conflicts.isEmpty()) dao.putAll(conflicts);
        });

        return new JSONObject()
            .put("inserted", inserted)
            .put("replaced", replaced)
            .put("identical", identical)
            .put("preservedLocal", preservedLocal)
            .put("conflicts", conflicts.size());
    }

    private JSONObject promoteAttachments(File extractedRoot, String restoreId) throws Exception {
        File sourceRoot = new File(extractedRoot, "attachments");
        File targetRoot = new File(context.getFilesDir(), "attachments");
        if (!targetRoot.exists() && !targetRoot.mkdirs()) throw new IllegalStateException("无法建立附件目录");
        List<FileEntry> files = collectFiles(sourceRoot, "attachments/");
        int inserted = 0;
        int identical = 0;
        int renamed = 0;

        for (FileEntry entry : files) {
            String relative = entry.archivePath.substring("attachments/".length());
            File target = safeChild(targetRoot, relative);
            if (!target.getParentFile().exists() && !target.getParentFile().mkdirs()) {
                throw new IllegalStateException("无法建立附件子目录");
            }
            if (!target.exists()) {
                Files.copy(entry.file.toPath(), target.toPath(), StandardCopyOption.COPY_ATTRIBUTES);
                inserted++;
            } else if (sha256(target).equals(sha256(entry.file))) {
                identical++;
            } else {
                File conflict = new File(target.getParentFile(), target.getName() + "." + restoreId + ".conflict");
                Files.copy(entry.file.toPath(), conflict.toPath(), StandardCopyOption.REPLACE_EXISTING);
                renamed++;
            }
        }

        return new JSONObject()
            .put("inserted", inserted)
            .put("identical", identical)
            .put("renamedConflicts", renamed);
    }

    private JSONArray verifyExtracted(File root, JSONObject checksums) throws Exception {
        JSONArray errors = new JSONArray();
        for (String path : iterable(checksums.keys())) {
            File file = safeChild(root, path);
            if (!file.isFile()) {
                errors.put(path + " 缺失");
                continue;
            }
            String actual = sha256(file);
            if (!actual.equals(checksums.getString(path))) errors.put(path + " SHA-256 不一致");
        }
        return errors;
    }

    private void copySource(Uri source, File target) throws Exception {
        long total = 0;
        try (InputStream input = require(context.getContentResolver().openInputStream(source), "无法读取备份文件");
             OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                total += read;
                if (total > MAX_ARCHIVE_BYTES) throw new IllegalArgumentException("备份文件超过 1 GB 限制");
                output.write(buffer, 0, read);
            }
        }
    }

    private void extractSafely(File archive, File targetRoot) throws Exception {
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(new FileInputStream(archive)))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                File target = safeChild(targetRoot, entry.getName());
                if (!target.getParentFile().exists() && !target.getParentFile().mkdirs()) {
                    throw new IllegalStateException("无法建立备份目录");
                }
                long entryBytes = 0;
                try (OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = zip.read(buffer)) >= 0) {
                        entryBytes += read;
                        total += read;
                        if (entryBytes > MAX_ENTRY_BYTES) throw new IllegalArgumentException("备份条目超过 256 MB 限制");
                        if (total > MAX_ARCHIVE_BYTES) throw new IllegalArgumentException("解压内容超过 1 GB 限制");
                        output.write(buffer, 0, read);
                    }
                }
            }
        }
    }

    private static NativeRecord toNative(MigrationRecord source, String now, String origin) {
        NativeRecord record = new NativeRecord();
        record.storeName = source.storeName;
        record.recordId = source.recordId;
        record.json = source.json;
        record.updatedAt = now;
        record.source = origin;
        record.contentHash = source.contentHash;
        return record;
    }

    private static List<FileEntry> collectFiles(File root, String prefix) throws Exception {
        if (!root.isDirectory()) return Collections.emptyList();
        List<FileEntry> output = new ArrayList<>();
        collectFilesRecursive(root, root, prefix, output);
        output.sort(Comparator.comparing(item -> item.archivePath));
        return output;
    }

    private static void collectFilesRecursive(File root, File current, String prefix, List<FileEntry> output) throws Exception {
        File[] children = current.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (Files.isSymbolicLink(child.toPath())) continue;
            if (child.isDirectory()) collectFilesRecursive(root, child, prefix, output);
            else if (child.isFile()) {
                String relative = root.toPath().relativize(child.toPath()).toString().replace(File.separatorChar, '/');
                output.add(new FileEntry(child, prefix + relative));
            }
        }
    }

    private static File safeChild(File root, String relative) throws Exception {
        if (relative == null || relative.isBlank() || relative.startsWith("/") || relative.contains("\\")) {
            throw new IllegalArgumentException("非法备份路径");
        }
        File child = new File(root, relative);
        String rootPath = root.getCanonicalPath() + File.separator;
        String childPath = child.getCanonicalPath();
        if (!childPath.startsWith(rootPath)) throw new IllegalArgumentException("备份路径越界");
        return child;
    }

    private static void putBytes(ZipOutputStream zip, String path, byte[] bytes) throws Exception {
        ZipEntry entry = new ZipEntry(path);
        entry.setTime(0L);
        zip.putNextEntry(entry);
        zip.write(bytes);
        zip.closeEntry();
    }

    private static void putFile(ZipOutputStream zip, String path, File file) throws Exception {
        ZipEntry entry = new ZipEntry(path);
        entry.setTime(0L);
        zip.putNextEntry(entry);
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) zip.write(buffer, 0, read);
        }
        zip.closeEntry();
    }

    private static String readUtf8(File file) throws Exception {
        if (!file.isFile()) throw new IllegalArgumentException("备份缺少 manifest.json");
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) digest.update(buffer, 0, read);
        }
        return hex(digest.digest());
    }

    private static String sha256(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return hex(digest.digest(bytes));
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }

    private static int sumCounts(JSONObject counts) {
        int result = 0;
        for (String key : iterable(counts.keys())) result += counts.optInt(key, 0);
        return result;
    }

    private static <T> T require(T value, String message) {
        if (value == null) throw new IllegalStateException(message);
        return value;
    }

    private static Iterable<String> iterable(java.util.Iterator<String> iterator) {
        return () -> iterator;
    }

    private static final class FileEntry {
        final File file;
        final String archivePath;

        FileEntry(File file, String archivePath) {
            this.file = file;
            this.archivePath = archivePath;
        }
    }
}
