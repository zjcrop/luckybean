package com.luckybean.app;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

import com.luckybean.app.storage.RoomStoreBridge;
import org.json.JSONArray;
import org.json.JSONObject;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;
import org.mozilla.geckoview.WebExtensionController;

/** Gecko front end; native OCR, files and foreground timer are shared with the upgrade host. */
public final class GeckoActivity extends MainActivity {
    private static final String EXTENSION_ID = "local-runtime@luckybean";
    private static GeckoRuntime runtime;
    private GeckoSession session;
    private WebExtension.Port port;
    private String baseUrl;
    private boolean loaded;
    volatile boolean localAppReady;
    volatile String startupFailure;
    private NativeFileBridge nativeBridge;
    private RoomStoreBridge roomBridge;
    private GeckoSession.PermissionDelegate.Callback permissionCallback;
    private final java.util.concurrent.ExecutorService nativeExecutor = java.util.concurrent.Executors.newSingleThreadExecutor();

    @Override
    protected void initializeEngine(Bundle state) {
        nativeBridge = new NativeFileBridge();
        roomBridge = new RoomStoreBridge(this, this::dispatchJavascriptCallback);
        GeckoView view = new GeckoView(this);
        setContentView(view);
        if (runtime == null) runtime = GeckoRuntime.create(getApplicationContext());
        session = new GeckoSession();
        session.getSettings().setUserAgentOverride("Mozilla/5.0 Gecko/20100101 Firefox/157.0 LuckyBeanAndroid/" + BuildConfig.VERSION_NAME);
        session.setPromptDelegate(new GeckoSession.PromptDelegate() {
            @Override
            public GeckoResult<PromptResponse> onFilePrompt(GeckoSession source, FilePrompt prompt) {
                GeckoResult<PromptResponse> result = new GeckoResult<>();
                openNativeFileChooser(prompt.capture != FilePrompt.Capture.NONE,
                    prompt.type == FilePrompt.Type.MULTIPLE, prompt.mimeTypes == null ? new String[0] : prompt.mimeTypes,
                    uris -> result.complete(uris == null ? prompt.dismiss() : prompt.confirm(getApplicationContext(), uris)));
                return result;
            }
        });
        session.setPermissionDelegate(new GeckoPermissions());
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override
            public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession source, LoadRequest request) {
                if (baseUrl != null && request.uri.startsWith(baseUrl + "web-cache/")) return GeckoResult.fromValue(AllowOrDeny.ALLOW);
                if ("about:blank".equals(request.uri)) return GeckoResult.fromValue(AllowOrDeny.ALLOW);
                Uri uri = Uri.parse(request.uri);
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception error) { Toast.makeText(GeckoActivity.this, "无法打开该链接", Toast.LENGTH_SHORT).show(); }
                }
                return GeckoResult.fromValue(AllowOrDeny.DENY);
            }
        });
        session.open(runtime);
        view.setSession(session);
        WebExtensionController controller = runtime.getWebExtensionController();
        controller.setAddonManagerDelegate(new WebExtensionController.AddonManagerDelegate() {
            @Override public void onReady(WebExtension extension) { loadExtension(extension); }
        });
        controller.ensureBuiltIn("resource://android/assets/gecko/", EXTENSION_ID).accept(
            this::loadExtension, error -> showEngineFailure(error));
    }

    private void loadExtension(WebExtension extension) {
        if (loaded || isFinishing() || !EXTENSION_ID.equals(extension.id) || extension.metaData == null
                || extension.metaData.baseUrl == null || extension.metaData.baseUrl.isEmpty()) return;
        loaded = true;
        baseUrl = extension.metaData.baseUrl;
        WebExtension.MessageDelegate delegate = new WebExtension.MessageDelegate() {
            @Override public void onConnect(WebExtension.Port connection) {
                if (!connection.sender.isTopLevel() || !connection.sender.url.startsWith(baseUrl + "web-cache/")) {
                    connection.disconnect();
                    return;
                }
                port = connection;
                connection.setDelegate(new WebExtension.PortDelegate() {
                    @Override public void onPortMessage(Object message, WebExtension.Port source) {
                        if (source != port || !(message instanceof JSONObject)) return;
                        receive((JSONObject) message, source);
                    }
                    @Override public void onDisconnect(WebExtension.Port source) { if (source == port) port = null; }
                });
            }
        };
        extension.setMessageDelegate(delegate, "luckybean");
        session.getWebExtensionController().setMessageDelegate(extension, delegate, "luckybean");
        session.loadUri(baseUrl + "web-cache/index.html");
    }

    private void receive(JSONObject request, WebExtension.Port source) {
        if ("ready".equals(request.optString("type"))) {
            localAppReady = true;
            Log.i("LuckyBeanGecko", "Local app ready with Room bridge");
            return;
        }
        if ("pageError".equals(request.optString("type"))) {
            startupFailure = request.optString("message");
            Log.e("LuckyBeanGecko", "Page error: " + startupFailure);
            return;
        }
        String id = request.optString("id");
        if ("store".equals(request.optString("type"))) {
            roomBridge.request(id, request.optString("json"));
            return;
        }
        if (!"native".equals(request.optString("type"))) return;
        JSONArray args = request.optJSONArray("args");
        if (args == null) args = new JSONArray();
        final JSONArray values = args;
        nativeExecutor.execute(() -> {
            Object result = null;
            String error = null;
            try {
                switch (request.optString("method")) {
                    case "bindImageSource": result = nativeBridge.bindImageSource(values.getString(0), values.getBoolean(1)); break;
                    case "recognizeImage": nativeBridge.recognizeImage(values.getString(0), values.getString(1), values.getString(2), values.getString(3)); break;
                    case "saveFile": nativeBridge.saveFile(values.getString(0), values.getString(1), values.getString(2)); break;
                    case "prepareBrewExecution": nativeBridge.prepareBrewExecution(values.getString(0)); break;
                    case "startBrewExecution": nativeBridge.startBrewExecution(values.getString(0)); break;
                    case "announceBrewPreparation": nativeBridge.announceBrewPreparation(values.getString(0)); break;
                    case "pauseBrewExecution": nativeBridge.pauseBrewExecution(); break;
                    case "resumeBrewExecution": nativeBridge.resumeBrewExecution(); break;
                    case "cancelBrewExecution": nativeBridge.cancelBrewExecution(); break;
                    case "setBrewScreenAwake": nativeBridge.setBrewScreenAwake(values.getBoolean(0)); break;
                    case "switchEngine": nativeBridge.switchEngine(values.getString(0)); break;
                    case "exitApp": nativeBridge.exitApp(); break;
                    default: throw new IllegalArgumentException("不支持的原生操作");
                }
            } catch (Exception failure) { error = failure.getMessage(); }
            final Object value = result;
            final String failure = error;
            runOnUiThread(() -> {
                if (source != port) return;
                try { source.postMessage(new JSONObject().put("type", "result").put("id", id)
                    .put("value", value == null ? JSONObject.NULL : value).put("error", failure == null ? JSONObject.NULL : failure)); }
                catch (Exception ignored) { Log.w("LuckyBeanGecko", "Native result delivery failed"); }
            });
        });
    }

    @Override
    protected void dispatchJavascriptCallback(String callback, String requestId, Object value) {
        runOnUiThread(() -> {
            if (port == null) return;
            try { port.postMessage(new JSONObject().put("type", "callback").put("callback", callback)
                .put("id", requestId).put("value", value == null ? JSONObject.NULL : value)); }
            catch (Exception ignored) { Log.w("LuckyBeanGecko", "Native callback delivery failed"); }
        });
    }

    @Override protected void handleSystemBack() {
        if (port == null) { showEngineFailure(new IllegalStateException("原生连接尚未就绪")); return; }
        try { port.postMessage(new JSONObject().put("type", "back")); }
        catch (Exception ignored) { finish(); }
    }

    private void showEngineFailure(Throwable error) {
        startupFailure = error.getMessage();
        Log.e("LuckyBeanGecko", "Engine startup failed", error);
        new AlertDialog.Builder(this).setTitle("GeckoView 启动未完成")
            .setMessage("本机 Room 数据保留，可以切回 WebView 继续使用。")
            .setPositiveButton("切回 WebView", (dialog, which) -> nativeBridge.switchEngine("webview"))
            .setNegativeButton("退出", (dialog, which) -> finish()).show();
    }

    private final class GeckoPermissions implements GeckoSession.PermissionDelegate {
        @Override public void onAndroidPermissionsRequest(GeckoSession source, String[] permissions, Callback callback) {
            java.util.ArrayList<String> missing = new java.util.ArrayList<>();
            for (String permission : permissions == null ? new String[0] : permissions) {
                if (!Manifest.permission.CAMERA.equals(permission) && !Manifest.permission.RECORD_AUDIO.equals(permission)) { callback.reject(); return; }
                if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) missing.add(permission);
            }
            if (missing.isEmpty()) { callback.grant(); return; }
            if (permissionCallback != null) { callback.reject(); return; }
            permissionCallback = callback;
            requestPermissions(missing.toArray(new String[0]), 3102);
        }
        @Override public void onMediaPermissionRequest(GeckoSession source, String uri, MediaSource[] video,
                                                       MediaSource[] audio, MediaCallback callback) {
            if (baseUrl == null || !uri.startsWith(baseUrl + "web-cache/")) { callback.reject(); return; }
            new AlertDialog.Builder(GeckoActivity.this).setTitle("使用相机或麦克风")
                .setMessage("允许当前操作使用设备进行扫码或媒体采集？")
                .setPositiveButton("允许", (dialog, which) -> callback.grant(
                    video == null || video.length == 0 ? null : video[0], audio == null || audio.length == 0 ? null : audio[0]))
                .setNegativeButton("取消", (dialog, which) -> callback.reject())
                .setOnCancelListener(dialog -> callback.reject()).show();
        }
        @Override public GeckoResult<Integer> onContentPermissionRequest(GeckoSession source, ContentPermission permission) {
            boolean trusted = baseUrl != null && permission.uri.startsWith(baseUrl);
            boolean local = permission.permission == PERMISSION_PERSISTENT_STORAGE || permission.permission == PERMISSION_AUTOPLAY_INAUDIBLE;
            return GeckoResult.fromValue(trusted && local ? ContentPermission.VALUE_ALLOW : ContentPermission.VALUE_DENY);
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != 3102 || permissionCallback == null) return;
        boolean granted = results.length == permissions.length && results.length > 0;
        for (int result : results) granted &= result == PackageManager.PERMISSION_GRANTED;
        if (granted) permissionCallback.grant(); else permissionCallback.reject();
        permissionCallback = null;
    }

    @Override protected void onDestroy() {
        if (permissionCallback != null) permissionCallback.reject();
        if (port != null) port.disconnect();
        if (session != null) session.close();
        nativeExecutor.shutdown();
        super.onDestroy();
    }
}
