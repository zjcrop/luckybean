package com.luckybean.app.nativebridge;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import com.luckybean.app.backup.BackupArchiveService;

import org.mozilla.geckoview.GeckoResult;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class NativeBackupBroker {
    private static final int REQUEST_EXPORT_BACKUP = 3301;
    private static final int REQUEST_IMPORT_BACKUP = 3302;

    private final Activity activity;
    private final BackupArchiveService service;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<Integer, GeckoResult<Object>> pending = new HashMap<>();

    public NativeBackupBroker(Activity activity) {
        this.activity = activity;
        service = new BackupArchiveService(activity);
    }

    public GeckoResult<Object> exportArchive(String suggestedName) {
        if (pending.containsKey(REQUEST_EXPORT_BACKUP)) return busy("已有备份导出正在进行");
        GeckoResult<Object> result = new GeckoResult<>();
        pending.put(REQUEST_EXPORT_BACKUP, result);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        String name = suggestedName == null || suggestedName.trim().isEmpty()
            ? "luckybean-backup.luckybean" : suggestedName;
        if (!name.endsWith(".luckybean")) name += ".luckybean";
        intent.putExtra(Intent.EXTRA_TITLE, name);
        activity.startActivityForResult(intent, REQUEST_EXPORT_BACKUP);
        return result;
    }

    public GeckoResult<Object> importArchive() {
        if (pending.containsKey(REQUEST_IMPORT_BACKUP)) return busy("已有备份恢复正在进行");
        GeckoResult<Object> result = new GeckoResult<>();
        pending.put(REQUEST_IMPORT_BACKUP, result);
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/octet-stream"});
        activity.startActivityForResult(intent, REQUEST_IMPORT_BACKUP);
        return result;
    }

    public boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        GeckoResult<Object> result = pending.remove(requestCode);
        if (result == null) return false;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            result.completeExceptionally(new IllegalStateException("用户取消了备份操作"));
            return true;
        }
        Uri uri = data.getData();
        if (requestCode == REQUEST_EXPORT_BACKUP) io.execute(() -> service.exportTo(uri, result));
        else if (requestCode == REQUEST_IMPORT_BACKUP) io.execute(() -> service.importFrom(uri, result));
        return true;
    }

    public void destroy() {
        for (GeckoResult<Object> result : pending.values()) {
            result.completeExceptionally(new IllegalStateException("Activity 已关闭"));
        }
        pending.clear();
        io.shutdownNow();
    }

    private static GeckoResult<Object> busy(String message) {
        return GeckoResult.fromException(new IllegalStateException(message));
    }
}
