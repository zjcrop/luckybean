package com.luckybean.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Point;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import android.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://app.luckybean.local/";
    private static final int FILE_CHOOSER_REQUEST = 2101;
    private static final int MEDIA_PERMISSION_REQUEST = 2102;
    private static final int SAVE_FILE_REQUEST = 2103;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;
    private PermissionRequest pendingWebPermission;
    private byte[] pendingExportBytes;
    private String pendingExportMime;
    private TextRecognizer chineseTextRecognizer;
    private TextRecognizer latinTextRecognizer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 9, 9));
        getWindow().setNavigationBarColor(Color.rgb(8, 9, 9));
        enterImmersiveMode();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(8, 9, 9));
        setContentView(webView);

        chineseTextRecognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        latinTextRecognizer = TextRecognition.getClient(new TextRecognizerOptions.Builder().build());
        configureWebView();
        if (savedInstanceState == null) {
            webView.loadUrl(APP_ORIGIN + "index.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setUserAgentString(settings.getUserAgentString() + " LuckyBeanAndroid/1.23D");

        webView.addJavascriptInterface(new NativeFileBridge(), "LuckyBeanNative");

        webView.setWebViewClient(new LocalAssetClient());
        webView.setWebChromeClient(new LuckyBeanChromeClient());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            Toast.makeText(this, "Android 版暂不直接保存 Blob 下载；请使用应用内复制或数据导出。", Toast.LENGTH_LONG).show()
        );
    }

    private final class LocalAssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"app.luckybean.local".equals(uri.getHost())) return null;

            String path = uri.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            path = path.replace("..", "");
            String assetPath = path.startsWith("/") ? path.substring(1) : path;
            assetPath = "web-cache/" + assetPath;
            try {
                InputStream input = getAssets().open(assetPath);
                Map<String, String> headers = new HashMap<>();
                headers.put("Access-Control-Allow-Origin", APP_ORIGIN.substring(0, APP_ORIGIN.length() - 1));
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                return new WebResourceResponse(mimeType(path), "UTF-8", 200, "OK", headers, input);
            } catch (IOException error) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.singletonMap("Cache-Control", "no-store"),
                    new java.io.ByteArrayInputStream("Not Found".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if ("app.luckybean.local".equals(uri.getHost())) return false;
            String scheme = uri.getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    Toast.makeText(MainActivity.this, "无法打开该链接", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                Toast.makeText(MainActivity.this, "无法打开该链接", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
    }

    private void dispatchBrewService(String action, String payload, boolean foreground) {
        Intent intent = new Intent(MainActivity.this, BrewTimerService.class).setAction(action);
        if (payload != null) intent.putExtra(BrewTimerService.EXTRA_PAYLOAD, payload);
        if (foreground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
        else startService(intent);
    }

    private final class NativeFileBridge {
        @JavascriptInterface
        public void recognizeImage(String requestId, String imageId, String imageRole, String dataUrl) {
            Bitmap bitmap = null;
            try {
                String encoded = dataUrl == null ? "" : dataUrl;
                int separator = encoded.indexOf(',');
                if (separator >= 0) encoded = encoded.substring(separator + 1);
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) throw new IllegalArgumentException("无法读取照片数据");

                InputImage input = InputImage.fromBitmap(bitmap, 0);
                Task<Text> chineseTask = chineseTextRecognizer.process(input);
                Task<Text> latinTask = latinTextRecognizer.process(input);
                Bitmap decodedBitmap = bitmap;
                Tasks.whenAllComplete(chineseTask, latinTask).addOnCompleteListener(ignored -> {
                    try {
                        LinkedHashMap<String, JSONObject> uniqueLines = new LinkedHashMap<>();
                        if (chineseTask.isSuccessful()) appendRecognizedLines(uniqueLines, chineseTask.getResult(), imageId, imageRole);
                        if (latinTask.isSuccessful()) appendRecognizedLines(uniqueLines, latinTask.getResult(), imageId, imageRole);
                        if (uniqueLines.isEmpty()) {
                            Exception failure = chineseTask.getException() != null ? chineseTask.getException() : latinTask.getException();
                            throw new IllegalStateException(failure == null ? "未识别到清晰文字" : failure.getMessage(), failure);
                        }
                        JSONObject payload = new JSONObject();
                        payload.put("engine", "android-mlkit-bundled-16.0.1");
                        payload.put("blocks", new JSONArray(uniqueLines.values()));
                        StringBuilder fullText = new StringBuilder();
                        for (JSONObject line : uniqueLines.values()) {
                            if (fullText.length() > 0) fullText.append('\n');
                            fullText.append(line.optString("text"));
                        }
                        payload.put("fullText", fullText.toString());
                        resolveRecognition(requestId, payload);
                    } catch (Exception error) {
                        rejectRecognition(requestId, error.getMessage());
                    } finally {
                        decodedBitmap.recycle();
                    }
                });
            } catch (Exception error) {
                if (bitmap != null) bitmap.recycle();
                rejectRecognition(requestId, error.getMessage());
            }
        }

        @JavascriptInterface
        public void saveFile(String base64, String filename, String mimeType) {
            runOnUiThread(() -> {
                try {
                    pendingExportBytes = Base64.decode(base64, Base64.DEFAULT);
                    pendingExportMime = (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(pendingExportMime);
                    intent.putExtra(Intent.EXTRA_TITLE, sanitizeFilename(filename));
                    startActivityForResult(intent, SAVE_FILE_REQUEST);
                } catch (Exception error) {
                    pendingExportBytes = null;
                    pendingExportMime = null;
                    Toast.makeText(MainActivity.this, "准备导出文件失败", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void prepareBrewExecution(String payload) {
            runOnUiThread(() -> dispatchBrewService(BrewTimerService.ACTION_PREPARE, payload, false));
        }

        @JavascriptInterface
        public void startBrewExecution(String payload) {
            runOnUiThread(() -> dispatchBrewService(BrewTimerService.ACTION_START, payload, true));
        }

        @JavascriptInterface
        public void pauseBrewExecution() {
            runOnUiThread(() -> dispatchBrewService(BrewTimerService.ACTION_PAUSE, null, false));
        }

        @JavascriptInterface
        public void resumeBrewExecution() {
            runOnUiThread(() -> dispatchBrewService(BrewTimerService.ACTION_RESUME, null, false));
        }

        @JavascriptInterface
        public void cancelBrewExecution() {
            runOnUiThread(() -> dispatchBrewService(BrewTimerService.ACTION_CANCEL, null, false));
        }

        @JavascriptInterface
        public void setBrewScreenAwake(boolean enabled) {
            runOnUiThread(() -> {
                if (enabled) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }

    private static void appendRecognizedLines(Map<String, JSONObject> target, Text result,
                                              String imageId, String imageRole) throws JSONException {
        if (result == null) return;
        for (Text.TextBlock block : result.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                String value = line.getText() == null ? "" : line.getText().replaceAll("\\s+", " ").trim();
                if (value.isEmpty()) continue;
                String key = value.toLowerCase(Locale.ROOT).replaceAll("[\\s，,。.;；:：/_\\-·•]+", "");
                if (key.isEmpty() || target.containsKey(key)) continue;
                JSONObject item = new JSONObject();
                item.put("text", value);
                item.put("confidence", 0.86);
                item.put("imageId", imageId == null ? "" : imageId);
                item.put("imageRole", imageRole == null ? "" : imageRole);
                item.put("polygon", polygon(line));
                target.put(key, item);
            }
        }
    }

    private static JSONArray polygon(Text.Line line) throws JSONException {
        JSONArray points = new JSONArray();
        Point[] corners = line.getCornerPoints();
        if (corners != null && corners.length > 0) {
            for (Point corner : corners) points.put(new JSONArray().put(corner.x).put(corner.y));
            return points;
        }
        Rect rect = line.getBoundingBox();
        if (rect != null) {
            points.put(new JSONArray().put(rect.left).put(rect.top));
            points.put(new JSONArray().put(rect.right).put(rect.top));
            points.put(new JSONArray().put(rect.right).put(rect.bottom));
            points.put(new JSONArray().put(rect.left).put(rect.bottom));
        }
        return points;
    }

    private void resolveRecognition(String requestId, JSONObject payload) {
        String script = "globalThis.LuckyBeanNativeRecognition&&globalThis.LuckyBeanNativeRecognition.resolve("
            + JSONObject.quote(requestId == null ? "" : requestId) + "," + payload + ");";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private void rejectRecognition(String requestId, String message) {
        String script = "globalThis.LuckyBeanNativeRecognition&&globalThis.LuckyBeanNativeRecognition.reject("
            + JSONObject.quote(requestId == null ? "" : requestId) + ","
            + JSONObject.quote(message == null || message.isEmpty() ? "Android 本地 OCR 失败" : message) + ");";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private static String sanitizeFilename(String value) {
        String cleaned = value == null ? "luckybean-export.bin" : value.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return cleaned.isEmpty() ? "luckybean-export.bin" : cleaned;
    }

    private final class LuckyBeanChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                boolean needsCamera = false;
                boolean needsAudio = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) needsCamera = true;
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) needsAudio = true;
                }
                if (hasMediaPermissions(needsCamera, needsAudio)) {
                    request.grant(request.getResources());
                    return;
                }
                pendingWebPermission = request;
                requestPermissions(requiredPermissions(needsCamera, needsAudio), MEDIA_PERMISSION_REQUEST);
            });
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;

            Intent contentIntent;
            try {
                contentIntent = params.createIntent();
            } catch (Exception error) {
                contentIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
                contentIntent.setType("*/*");
            }

            Intent chooser = Intent.createChooser(contentIntent, "选择文件或照片");
            if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
                Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                android.content.ContentValues values = new android.content.ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, "luckybean-qr-" + System.currentTimeMillis() + ".jpg");
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                cameraOutputUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (cameraOutputUri != null) {
                    camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
                    camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                }
            }
            startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
            return true;
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            android.util.Log.d("LuckyBeanWeb", message.message() + " @" + message.lineNumber());
            return true;
        }
    }

    private boolean hasMediaPermissions(boolean camera, boolean audio) {
        return (!camera || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
            && (!audio || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
    }

    private String[] requiredPermissions(boolean camera, boolean audio) {
        java.util.ArrayList<String> result = new java.util.ArrayList<>();
        if (camera && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            result.add(Manifest.permission.CAMERA);
        }
        if (audio && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            result.add(Manifest.permission.RECORD_AUDIO);
        }
        return result.toArray(new String[0]);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != MEDIA_PERMISSION_REQUEST || pendingWebPermission == null) return;
        boolean granted = true;
        for (int result : grantResults) granted &= result == PackageManager.PERMISSION_GRANTED;
        if (granted) pendingWebPermission.grant(pendingWebPermission.getResources());
        else pendingWebPermission.deny();
        pendingWebPermission = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SAVE_FILE_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExportBytes != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData(), "w")) {
                    if (output == null) throw new IOException("无法打开目标文件");
                    output.write(pendingExportBytes);
                    output.flush();
                    Toast.makeText(this, "文件已保存", Toast.LENGTH_SHORT).show();
                } catch (IOException error) {
                    Toast.makeText(this, "文件保存失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
            pendingExportBytes = null;
            pendingExportMime = null;
            return;
        }
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data == null || data.getData() == null) {
                if (cameraOutputUri != null) result = new Uri[]{cameraOutputUri};
            } else {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else {
                    result = new Uri[]{data.getData()};
                }
            }
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
        cameraOutputUri = null;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (chineseTextRecognizer != null) chineseTextRecognizer.close();
        if (latinTextRecognizer != null) latinTextRecognizer.close();
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
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
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }
}
