package com.luckybean.app.sync;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.luckybean.app.data.CanonicalJson;
import com.luckybean.app.data.LuckyBeanDao;
import com.luckybean.app.data.LuckyBeanDatabase;
import com.luckybean.app.data.NativeRecord;

import org.json.JSONObject;

import java.time.Instant;

public final class CloudSyncWorker extends Worker {
    public CloudSyncWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            LuckyBeanDao dao = LuckyBeanDatabase.get(getApplicationContext()).dao();
            int pending = dao.count("syncOutbox");

            JSONObject status = new JSONObject()
                .put("checkedAt", Instant.now().toString())
                .put("pending", pending)
                .put("state", pending == 0 ? "idle" : "awaiting-cloud-adapter")
                .put("destructive", false);
            String canonical = CanonicalJson.stringify(status);

            NativeRecord record = new NativeRecord();
            record.storeName = "schemaMetadata";
            record.recordId = "sync.worker.last";
            record.json = canonical;
            record.updatedAt = Instant.now().toString();
            record.source = "workmanager";
            record.contentHash = CanonicalJson.sha256(canonical);
            dao.put(record);

            // Core v2 alpha 不会在未配置正式云端协议时消费或删除 outbox。
            // 现有 Supabase 同步继续作为显式在线扩展，后续适配器通过相同 outbox 协议接入。
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        }
    }
}
