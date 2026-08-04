package com.luckybean.app.data;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class MigrationRepository {
    private final Context context;
    private final LuckyBeanDatabase database;
    private final LuckyBeanDao dao;
    private final Map<String, MigrationSnapshotWriter> snapshots = new HashMap<>();

    public MigrationRepository(Context context) {
        this.context = context.getApplicationContext();
        database = LuckyBeanDatabase.get(context);
        dao = database.dao();
    }

    public synchronized String begin(String manifestJson) {
        try {
            JSONObject manifest = new JSONObject(manifestJson);
            String migrationId = required(manifest, "migrationId");
            closeSnapshot(migrationId);
            dao.clearStaging(migrationId);

            MigrationSnapshotWriter snapshot = new MigrationSnapshotWriter(context, migrationId);
            snapshots.put(migrationId, snapshot);

            MigrationState state = new MigrationState();
            state.migrationId = migrationId;
            state.sourceDatabase = manifest.optString("sourceDatabase", "luckybean");
            state.sourceVersion = manifest.optInt("sourceVersion", 0);
            state.targetSchemaVersion = 3;
            state.status = "staging";
            state.startedAt = manifest.optString("startedAt", Instant.now().toString());
            state.snapshotPath = snapshot.snapshotPath();
            state.reportJson = manifest.toString();
            dao.putMigrationState(state);
            return success(new JSONObject().put("migrationId", migrationId));
        } catch (Exception error) {
            return failure("MIGRATION_BEGIN_FAILED", error);
        }
    }

    public synchronized String writeChunk(String migrationId, String storeName, String chunkJson) {
        try {
            if (!snapshots.containsKey(migrationId)) throw new IllegalStateException("迁移会话不存在");
            JSONArray chunk = new JSONArray(chunkJson);
            List<MigrationRecord> records = new ArrayList<>(chunk.length());
            MigrationSnapshotWriter snapshot = snapshots.get(migrationId);

            for (int i = 0; i < chunk.length(); i++) {
                JSONObject wrapper = chunk.getJSONObject(i);
                String recordId = required(wrapper, "id");
                Object value = wrapper.get("value");
                String canonical = CanonicalJson.stringify(value);

                MigrationRecord record = new MigrationRecord();
                record.migrationId = migrationId;
                record.storeName = storeName;
                record.recordId = recordId;
                record.json = canonical;
                record.contentHash = CanonicalJson.sha256(canonical);
                records.add(record);
                snapshot.append(storeName, recordId, canonical);
            }
            dao.stageAll(records);
            snapshot.flushDurably();
            return success(new JSONObject().put("accepted", records.size()));
        } catch (Exception error) {
            markFailed(migrationId, "MIGRATION_CHUNK_FAILED", error);
            return failure("MIGRATION_CHUNK_FAILED", error);
        }
    }

    public synchronized String finish(String migrationId, String reportJson) {
        try {
            JSONObject report = new JSONObject(reportJson);
            JSONObject expectedStores = report.getJSONObject("stores");
            JSONArray errors = new JSONArray();
            JSONObject actualStores = new JSONObject();

            for (String storeName : iterable(expectedStores.keys())) {
                JSONObject expected = expectedStores.getJSONObject(storeName);
                List<MigrationRecord> records = dao.stagedStore(migrationId, storeName);
                JSONArray values = new JSONArray();
                for (MigrationRecord record : records) values.put(new JSONObject(record.json));
                String canonical = CanonicalJson.stringify(values);
                int actualCount = records.size();
                String actualHash = CanonicalJson.sha256(canonical);
                int expectedCount = expected.optInt("count", -1);
                String expectedHash = expected.optString("hash", "");

                JSONObject actual = new JSONObject();
                actual.put("count", actualCount);
                actual.put("hash", actualHash);
                actual.put("countOk", actualCount == expectedCount);
                actual.put("hashOk", actualHash.equals(expectedHash));
                actualStores.put(storeName, actual);

                if (actualCount != expectedCount) errors.put(storeName + " 记录数量不一致");
                if (!actualHash.equals(expectedHash)) errors.put(storeName + " SHA-256 不一致");
            }

            JSONObject finalReport = new JSONObject(report.toString());
            finalReport.put("actualStores", actualStores);
            finalReport.put("errors", errors);
            finalReport.put("completedAt", Instant.now().toString());
            finalReport.put("ok", errors.length() == 0);

            MigrationSnapshotWriter snapshot = snapshots.get(migrationId);
            if (snapshot != null) snapshot.writeReport(finalReport.toString(2));

            if (errors.length() > 0) {
                markFailed(migrationId, "MIGRATION_VERIFY_FAILED", new IllegalStateException(errors.toString()));
                return failure("MIGRATION_VERIFY_FAILED", new IllegalStateException(errors.toString()));
            }

            List<MigrationRecord> staged = dao.staged(migrationId);
            String now = Instant.now().toString();
            List<NativeRecord> promoted = new ArrayList<>(staged.size());
            for (MigrationRecord item : staged) {
                NativeRecord record = new NativeRecord();
                record.storeName = item.storeName;
                record.recordId = item.recordId;
                record.json = item.json;
                record.updatedAt = now;
                record.source = "webview-migration:" + migrationId;
                record.contentHash = item.contentHash;
                promoted.add(record);
            }

            database.runInTransaction(() -> {
                dao.putAll(promoted);
                MigrationState state = dao.migrationState(migrationId);
                if (state == null) state = new MigrationState();
                state.migrationId = migrationId;
                state.status = "complete";
                state.completedAt = now;
                state.reportJson = finalReport.toString();
                if (snapshot != null) state.snapshotPath = snapshot.snapshotPath();
                dao.putMigrationState(state);
                dao.clearStaging(migrationId);
            });

            context.getSharedPreferences("luckybean-core-v2", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("webviewMigrationComplete", true)
                .putString("webviewMigrationId", migrationId)
                .apply();
            closeSnapshot(migrationId);
            return success(new JSONObject()
                .put("migrationId", migrationId)
                .put("records", promoted.size())
                .put("report", finalReport));
        } catch (Exception error) {
            markFailed(migrationId, "MIGRATION_FINISH_FAILED", error);
            return failure("MIGRATION_FINISH_FAILED", error);
        }
    }

    public boolean isComplete() {
        return context.getSharedPreferences("luckybean-core-v2", Context.MODE_PRIVATE)
            .getBoolean("webviewMigrationComplete", false);
    }

    private void markFailed(String migrationId, String code, Exception error) {
        if (migrationId == null || migrationId.isBlank()) return;
        try {
            MigrationState state = dao.migrationState(migrationId);
            if (state == null) state = new MigrationState();
            state.migrationId = migrationId;
            state.status = "failed";
            state.completedAt = Instant.now().toString();
            state.reportJson = new JSONObject()
                .put("code", code)
                .put("message", error.getMessage())
                .toString();
            dao.putMigrationState(state);
            closeSnapshot(migrationId);
        } catch (Exception ignored) {
            // 原始 WebView 数据仍保留；记录失败不能触发任何清库行为。
        }
    }

    private void closeSnapshot(String migrationId) throws IOException {
        MigrationSnapshotWriter writer = snapshots.remove(migrationId);
        if (writer != null) writer.close();
    }

    private static String required(JSONObject value, String key) throws JSONException {
        String result = value.getString(key).trim();
        if (result.isEmpty()) throw new JSONException("缺少字段：" + key);
        return result;
    }

    private static Iterable<String> iterable(java.util.Iterator<String> iterator) {
        return () -> iterator;
    }

    private static String success(JSONObject value) throws JSONException {
        return new JSONObject().put("ok", true).put("value", value).toString();
    }

    private static String failure(String code, Exception error) {
        try {
            return new JSONObject()
                .put("ok", false)
                .put("code", code)
                .put("message", error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage())
                .toString();
        } catch (JSONException impossible) {
            return "{\"ok\":false,\"code\":\"SERIALIZATION_FAILED\"}";
        }
    }
}
