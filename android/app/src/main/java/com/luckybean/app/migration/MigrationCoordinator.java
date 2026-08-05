package com.luckybean.app.migration;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

public final class MigrationCoordinator {
    public interface Callback {
        void onReady(boolean migrationVerified, String reportJson);
    }

    private static final String APP_ORIGIN = "https://app.luckybean.local/";
    private static final long TIMEOUT_MS = 120_000L;

    private final Activity activity;
    private final FrameLayout root;
    private final Callback callback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView migrationView;
    private AndroidMigrationBridge bridge;
    private boolean completed;

    public MigrationCoordinator(Activity activity, FrameLayout root, Callback callback) {
        this.activity = activity;
        this.root = root;
        this.callback = callback;
    }

    public void start() {
        bridge = new AndroidMigrationBridge(activity, this::finish);
        if (bridge.isComplete()) {
            finish(true, "{\"ok\":true,\"reason\":\"already-migrated\"}");
            return;
        }

        migrationView = new WebView(activity);
        migrationView.setBackgroundColor(Color.TRANSPARENT);
        migrationView.setVisibility(View.INVISIBLE);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1, 1);
        root.addView(migrationView, params);

        WebSettings settings = migrationView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMediaPlaybackRequiresUserGesture(true);

        migrationView.setWebViewClient(new MigrationAssetClient());
        migrationView.addJavascriptInterface(bridge, "LuckyBeanMigration");
        migrationView.loadUrl(APP_ORIGIN + "migration/android-migrate.html");
        handler.postDelayed(() -> finish(false,
            "{\"ok\":false,\"code\":\"MIGRATION_TIMEOUT\",\"message\":\"旧数据迁移超时\"}"), TIMEOUT_MS);
    }

    public void destroy() {
        handler.removeCallbacksAndMessages(null);
        if (migrationView == null) return;
        migrationView.removeJavascriptInterface("LuckyBeanMigration");
        migrationView.stopLoading();
        migrationView.loadUrl("about:blank");
        migrationView.setWebViewClient(null);
        ViewGroup parent = (ViewGroup) migrationView.getParent();
        if (parent != null) parent.removeView(migrationView);
        migrationView.destroy();
        migrationView = null;
    }

    private void finish(boolean success, String responseJson) {
        if (completed) return;
        completed = true;
        destroy();
        callback.onReady(success, responseJson);
    }

    private final class MigrationAssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"app.luckybean.local".equals(uri.getHost())) return blocked();
            String path = uri.getPath();
            if (path == null || !path.startsWith("/migration/") || path.contains("..")) return blocked();
            String assetPath = path.substring(1);
            try {
                InputStream input = activity.getAssets().open(assetPath);
                return new WebResourceResponse(
                    mimeType(assetPath),
                    "UTF-8",
                    200,
                    "OK",
                    Collections.singletonMap("Cache-Control", "no-store"),
                    input
                );
            } catch (IOException error) {
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !request.getUrl().toString().startsWith(APP_ORIGIN + "migration/");
        }

        private WebResourceResponse blocked() {
            return new WebResourceResponse(
                "text/plain", "UTF-8", 403, "Forbidden",
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream("Forbidden".getBytes(StandardCharsets.UTF_8))
            );
        }

        private WebResourceResponse notFound() {
            return new WebResourceResponse(
                "text/plain", "UTF-8", 404, "Not Found",
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream("Not Found".getBytes(StandardCharsets.UTF_8))
            );
        }
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }
}
