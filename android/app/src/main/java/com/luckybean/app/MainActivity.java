package com.luckybean.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.luckybean.app.migration.MigrationCoordinator;
import com.luckybean.app.nativebridge.NativeCommandRouter;

import org.json.JSONObject;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String EXTENSION_LOCATION = "resource://android/assets/luckybean-extension/";
    private static final String EXTENSION_ID = "core-v2@luckybean.local";
    private static final String CORE_ENTRY = "core-v2/index.html";
    private static final String NATIVE_APP = "luckybean";
    private static final String LEGACY_ORIGIN = "https://app.luckybean.local/";

    private static GeckoRuntime runtime;

    private FrameLayout root;
    private MigrationCoordinator migrationCoordinator;
    private GeckoView geckoView;
    private GeckoSession geckoSession;
    private NativeCommandRouter commandRouter;
    private String trustedExtensionBase = "";
    private boolean canGoBack;
    private WebView legacyWebView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 9, 9));
        getWindow().setNavigationBarColor(Color.rgb(8, 9, 9));

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(8, 9, 9));
        setContentView(root);

        migrationCoordinator = new MigrationCoordinator(this, root, (verified, reportJson) -> {
            if (verified) startGecko();
            else {
                Toast.makeText(this, "旧数据未能安全迁移，已进入兼容模式。原数据未删除。", Toast.LENGTH_LONG).show();
                startLegacyFallback(reportJson);
            }
        });
        migrationCoordinator.start();
    }

    private void startGecko() {
        commandRouter = new NativeCommandRouter(this);
        geckoView = new GeckoView(this);
        root.addView(geckoView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        geckoSession = new GeckoSession();
        geckoSession.setContentDelegate(new GeckoSession.ContentDelegate() {});
        geckoSession.setNavigationDelegate(new AppNavigationDelegate());
        if (runtime == null) runtime = GeckoRuntime.create(this);
        geckoSession.open(runtime);
        geckoView.setSession(geckoSession);

        runtime.getWebExtensionController()
            .ensureBuiltIn(EXTENSION_LOCATION, EXTENSION_ID)
            .accept(this::attachTrustedExtension, error -> {
                Toast.makeText(this, "固定内核资源初始化失败，进入兼容模式。", Toast.LENGTH_LONG).show();
                stopGecko();
                startLegacyFallback(error.getMessage());
            });
    }

    private void attachTrustedExtension(WebExtension extension) {
        trustedExtensionBase = extension.metaData.baseUrl;
        extension.setMessageDelegate(new WebExtension.MessageDelegate() {
            @Nullable
            @Override
            public GeckoResult<Object> onMessage(
                @NonNull String nativeApp,
                @NonNull Object message,
                @NonNull WebExtension.MessageSender sender
            ) {
                if (!isTrustedMessage(nativeApp, sender) || !(message instanceof JSONObject)) {
                    return GeckoResult.fromValue(errorResponse(
                        "UNTRUSTED_NATIVE_MESSAGE",
                        "原生消息来源未通过校验"
                    ));
                }
                return commandRouter.handle((JSONObject) message);
            }
        }, NATIVE_APP);
        geckoSession.loadUri(trustedExtensionBase + CORE_ENTRY);
    }

    private boolean isTrustedMessage(String nativeApp, WebExtension.MessageSender sender) {
        return NATIVE_APP.equals(nativeApp)
            && sender.environmentType == WebExtension.MessageSender.ENV_TYPE_EXTENSION
            && sender.isTopLevel()
            && sender.webExtension != null
            && EXTENSION_ID.equals(sender.webExtension.id)
            && sender.url != null
            && !trustedExtensionBase.isBlank()
            && sender.url.startsWith(trustedExtensionBase + "core-v2/");
    }

    private final class AppNavigationDelegate implements GeckoSession.NavigationDelegate {
        @Override
        public GeckoResult<AllowOrDeny> onLoadRequest(
            @NonNull GeckoSession session,
            @NonNull LoadRequest request
        ) {
            String uri = request.uri;
            if (uri == null) return GeckoResult.deny();
            if (!trustedExtensionBase.isBlank() && uri.startsWith(trustedExtensionBase)) {
                return GeckoResult.allow();
            }
            if (uri.startsWith("about:blank")) return GeckoResult.allow();
            if (uri.startsWith("http://") || uri.startsWith("https://")) {
                if (request.hasUserGesture) openExternal(Uri.parse(uri));
                return GeckoResult.deny();
            }
            return GeckoResult.deny();
        }

        @Override
        public void onCanGoBack(@NonNull GeckoSession session, boolean value) {
            canGoBack = value;
        }
    }

    private void startLegacyFallback(String reason) {
        if (legacyWebView != null) return;
        legacyWebView = new WebView(this);
        root.addView(legacyWebView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        WebSettings settings = legacyWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " LuckyBeanAndroid/2.0-legacy-fallback");
        legacyWebView.setWebViewClient(new LegacyAssetClient());
        legacyWebView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            Toast.makeText(this, "兼容模式不执行 Blob 下载，请先导出迁移备份。", Toast.LENGTH_LONG).show()
        );
        legacyWebView.loadUrl(LEGACY_ORIGIN + "index.html");
        android.util.Log.e("LuckyBeanMigration", "Legacy fallback: " + reason);
    }

    private final class LegacyAssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"app.luckybean.local".equals(uri.getHost())) return null;
            String path = uri.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            if (path.contains("..")) return response(403, "Forbidden", "text/plain", "Forbidden");
            if ("/native-bridge.js".equals(path)) {
                return response(200, "OK", "text/javascript",
                    "globalThis.__LUCKYBEAN_ANDROID__=true;globalThis.__LUCKYBEAN_NATIVE_ENGINE__='legacy-webview';");
            }
            String assetPath = "luckybean-extension" + path;
            try {
                InputStream input = getAssets().open(assetPath);
                return new WebResourceResponse(
                    mimeType(path), "UTF-8", 200, "OK",
                    Collections.singletonMap("Cache-Control", "no-store"), input
                );
            } catch (IOException error) {
                return response(404, "Not Found", "text/plain", "Not Found");
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if ("app.luckybean.local".equals(uri.getHost())) return false;
            openExternal(uri);
            return true;
        }
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "无法打开外部链接", Toast.LENGTH_SHORT).show();
        }
    }

    private void stopGecko() {
        if (geckoSession != null) {
            geckoSession.close();
            geckoSession = null;
        }
        if (geckoView != null) {
            root.removeView(geckoView);
            geckoView = null;
        }
        if (commandRouter != null) {
            commandRouter.destroy();
            commandRouter = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (commandRouter != null) commandRouter.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (geckoSession != null && canGoBack) {
            geckoSession.goBack();
        } else if (legacyWebView != null && legacyWebView.canGoBack()) {
            legacyWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (migrationCoordinator != null) migrationCoordinator.destroy();
        stopGecko();
        if (legacyWebView != null) {
            legacyWebView.stopLoading();
            legacyWebView.loadUrl("about:blank");
            legacyWebView.setWebViewClient(null);
            legacyWebView.destroy();
            legacyWebView = null;
        }
        super.onDestroy();
    }

    private static JSONObject errorResponse(String code, String message) {
        try {
            return new JSONObject().put("ok", false).put("code", code).put("message", message);
        } catch (Exception impossible) {
            return new JSONObject();
        }
    }

    private static WebResourceResponse response(int status, String reason, String mime, String body) {
        return new WebResourceResponse(
            mime, "UTF-8", status, reason,
            Collections.singletonMap("Cache-Control", "no-store"),
            new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8))
        );
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }
}
