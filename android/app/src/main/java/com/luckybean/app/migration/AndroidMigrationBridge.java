package com.luckybean.app.migration;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;

import com.luckybean.app.data.MigrationRepository;

import org.json.JSONObject;

public final class AndroidMigrationBridge {
    public interface Listener {
        void onMigrationFinished(boolean success, String responseJson);
    }

    private final MigrationRepository repository;
    private final Listener listener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public AndroidMigrationBridge(Context context, Listener listener) {
        repository = new MigrationRepository(context);
        this.listener = listener;
    }

    @JavascriptInterface
    public String begin(String manifestJson) {
        return repository.begin(manifestJson);
    }

    @JavascriptInterface
    public String writeChunk(String migrationId, String storeName, String chunkJson) {
        return repository.writeChunk(migrationId, storeName, chunkJson);
    }

    @JavascriptInterface
    public String finish(String migrationId, String reportJson) {
        String response = repository.finish(migrationId, reportJson);
        boolean success = false;
        try {
            success = new JSONObject(response).optBoolean("ok", false);
        } catch (Exception ignored) {
            // 返回值仍交给上层记录。
        }
        boolean finalSuccess = success;
        mainHandler.post(() -> listener.onMigrationFinished(finalSuccess, response));
        return response;
    }

    @JavascriptInterface
    public void fail(String code, String message) {
        String response = "{\"ok\":false,\"code\":" + JSONObject.quote(code)
            + ",\"message\":" + JSONObject.quote(message) + "}";
        mainHandler.post(() -> listener.onMigrationFinished(false, response));
    }

    public boolean isComplete() {
        return repository.isComplete();
    }
}
