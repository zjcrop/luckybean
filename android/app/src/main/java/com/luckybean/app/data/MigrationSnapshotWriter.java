package com.luckybean.app.data;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.Closeable;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

public final class MigrationSnapshotWriter implements Closeable {
    private final File snapshotFile;
    private final File reportFile;
    private final FileOutputStream stream;
    private final BufferedWriter writer;
    private boolean closed;

    public MigrationSnapshotWriter(Context context, String migrationId) throws IOException {
        File directory = new File(context.getFilesDir(), "migration-snapshots");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("无法建立迁移快照目录");
        }
        String safeId = migrationId.replaceAll("[^A-Za-z0-9._-]", "_");
        snapshotFile = new File(directory, safeId + ".jsonl");
        reportFile = new File(directory, safeId + ".report.json");
        stream = new FileOutputStream(snapshotFile, false);
        writer = new BufferedWriter(new OutputStreamWriter(stream, StandardCharsets.UTF_8));
    }

    public synchronized void append(String storeName, String recordId, String canonicalJson)
        throws IOException, JSONException {
        ensureOpen();
        JSONObject wrapper = new JSONObject();
        wrapper.put("store", storeName);
        wrapper.put("id", recordId);
        wrapper.put("value", new JSONObject(canonicalJson));
        writer.write(CanonicalJson.stringify(wrapper));
        writer.newLine();
    }

    public synchronized void flushDurably() throws IOException {
        ensureOpen();
        writer.flush();
        stream.getFD().sync();
    }

    public synchronized void writeReport(String reportJson) throws IOException {
        try (FileOutputStream output = new FileOutputStream(reportFile, false)) {
            output.write(reportJson.getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
    }

    public String snapshotPath() {
        return snapshotFile.getAbsolutePath();
    }

    public String reportPath() {
        return reportFile.getAbsolutePath();
    }

    private void ensureOpen() throws IOException {
        if (closed) throw new IOException("迁移快照已关闭");
    }

    @Override
    public synchronized void close() throws IOException {
        if (closed) return;
        writer.flush();
        stream.getFD().sync();
        writer.close();
        closed = true;
    }
}
