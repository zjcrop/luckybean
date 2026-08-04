package com.luckybean.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.exifinterface.media.ExifInterface;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private static final String APP_URL = "https://zjcrop.github.io/BrewIon/luckybean/";
    private static final String TRUSTED_HOST = "zjcrop.github.io";
    private static final String TRUSTED_PATH_PREFIX = "/BrewIon/luckybean/";

    private static final int FILE_CHOOSER_REQUEST = 2101;
    private static final int WEB_MEDIA_PERMISSION_REQUEST = 2102;
    private static final int NATIVE_CAMERA_REQUEST = 2103;
    private static final int NATIVE_CAMERA_PERMISSION_REQUEST = 2104;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri fileChooserCameraUri;
    private Uri nativeCameraUri;
    private PermissionRequest pendingWebPermission;
    private boolean pendingNativeCapture;

    private TextToSpeech textToSpeech;
    private boolean ttsReady;
    private PendingSpeech pendingSpeech;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 9, 9));
        getWindow().setNavigationBarColor(Color.rgb(8, 9, 9));

        textToSpeech = new TextToSpeech(this, this);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(8, 9, 9));
        setContentView(webView);

        configureWebView();
        if (savedInstanceState == null) {
            loadOnlineApp();
        } else {
            webView.restoreState(savedInstanceState);
        }
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
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " LuckyBeanAndroidOnline/1.0.1-test");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.addJavascriptInterface(new NativeBridge(), "LuckyBeanAndroid");
        webView.addJavascriptInterface(new NativeOcrBridge(this, webView), "LuckyBeanOcrAndroid");
        webView.setWebViewClient(new OnlineAppClient());
        webView.setWebChromeClient(new LuckyBeanChromeClient());
    }

    private void loadOnlineApp() {
        if (!hasNetwork()) {
            showOfflinePage();
            return;
        }
        webView.loadUrl(APP_URL + "?source=android-online-shell");
    }

    private boolean hasNetwork() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void showOfflinePage() {
        String html = "<!doctype html><html lang='zh-CN'><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<style>body{margin:0;background:#080909;color:#fff;font-family:sans-serif;display:grid;place-items:center;min-height:100vh}"
            + ".box{max-width:320px;text-align:center;padding:24px}button{border:0;border-radius:10px;padding:12px 22px;font-size:16px}</style></head>"
            + "<body><div class='box'><h2>需要网络连接</h2><p>富贵盒子在线版必须联网并完成云端账户验证后使用。</p>"
            + "<button onclick=\"LuckyBeanAndroid.reload()\">重新连接</button></div></body></html>";
        webView.loadDataWithBaseURL("https://offline.luckybean.local/", html, "text/html", "UTF-8", null);
    }

    private boolean isTrusted(Uri uri) {
        if (uri == null) return false;
        if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
        if (!TRUSTED_HOST.equalsIgnoreCase(uri.getHost())) return false;
        String path = uri.getPath();
        return path != null && path.startsWith(TRUSTED_PATH_PREFIX);
    }

    private final class OnlineAppClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isTrusted(uri)) return false;
            String scheme = uri.getScheme();
            if ("about".equals(scheme) || "data".equals(scheme)) return false;
            if ("http".equals(scheme) || "https".equals(scheme)) {
                openExternal(uri);
                return true;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                Toast.makeText(MainActivity.this, "无法打开该链接", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isTrusted(Uri.parse(url))) installNativeBridge();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame()) showOfflinePage();
        }
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "无法打开外部链接", Toast.LENGTH_SHORT).show();
        }
    }

    private void installNativeBridge() {
        webView.evaluateJavascript(NATIVE_BRIDGE_SCRIPT, null);
    }

    private final class LuckyBeanChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                if (!isTrusted(request.getOrigin())) {
                    request.deny();
                    return;
                }
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
                requestPermissions(requiredPermissions(needsCamera, needsAudio), WEB_MEDIA_PERMISSION_REQUEST);
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
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                try {
                    fileChooserCameraUri = createCameraUri("file-input-");
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,
                        new Intent[]{buildCameraIntent(fileChooserCameraUri)});
                } catch (IOException ignored) {
                    fileChooserCameraUri = null;
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

    private final class NativeBridge {
        @JavascriptInterface
        public void capturePhoto() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    pendingNativeCapture = true;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, NATIVE_CAMERA_PERMISSION_REQUEST);
                    return;
                }
                launchNativeCamera();
            });
        }

        @JavascriptInterface
        public void speak(String text, String language, double rate, double pitch) {
            if (text == null || text.trim().isEmpty()) return;
            runOnUiThread(() -> speakNative(text, language, (float) rate, (float) pitch));
        }

        @JavascriptInterface
        public void stopSpeech() {
            runOnUiThread(() -> {
                if (textToSpeech != null) textToSpeech.stop();
            });
        }

        @JavascriptInterface
        public void shareText(String text) {
            if (text == null || text.trim().isEmpty()) return;
            runOnUiThread(() -> {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("text/plain");
                share.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(share, "分享富贵盒子内容"));
            });
        }

        @JavascriptInterface
        public void reload() {
            runOnUiThread(MainActivity.this::loadOnlineApp);
        }
    }

    private void launchNativeCamera() {
        try {
            nativeCameraUri = createCameraUri("bean-label-");
            startActivityForResult(buildCameraIntent(nativeCameraUri), NATIVE_CAMERA_REQUEST);
        } catch (Exception error) {
            deliverNativeError("无法启动系统相机：" + error.getMessage());
        }
    }

    private Uri createCameraUri(String prefix) throws IOException {
        File directory = new File(getCacheDir(), "camera");
        if (!directory.exists() && !directory.mkdirs()) throw new IOException("无法创建相机缓存目录");
        File file = File.createTempFile(prefix, ".jpg", directory);
        return FileProvider.getUriForFile(this, BuildConfig.APPLICATION_ID + ".fileprovider", file);
    }

    private Intent buildCameraIntent(Uri outputUri) {
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        camera.putExtra(MediaStore.EXTRA_OUTPUT, outputUri);
        camera.setClipData(ClipData.newRawUri("LuckyBean camera", outputUri));
        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        List<android.content.pm.ResolveInfo> handlers = getPackageManager().queryIntentActivities(camera, PackageManager.MATCH_DEFAULT_ONLY);
        for (android.content.pm.ResolveInfo handler : handlers) {
            grantUriPermission(handler.activityInfo.packageName, outputUri,
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        return camera;
    }

    private void deliverNativeImage(Uri uri) {
        new Thread(() -> {
            try {
                byte[] jpeg = prepareImage(uri, 2048, 88);
                String base64 = Base64.encodeToString(jpeg, Base64.NO_WRAP);
                String javascript = "window.__LuckyBeanNativeDeliverImage && window.__LuckyBeanNativeDeliverImage('"
                    + base64 + "','image/jpeg','coffee-bag-" + System.currentTimeMillis() + ".jpg');";
                runOnUiThread(() -> webView.evaluateJavascript(javascript, null));
            } catch (Exception error) {
                deliverNativeError("照片处理失败：" + error.getMessage());
            }
        }, "LuckyBeanCameraEncode").start();
    }

    private byte[] prepareImage(Uri uri, int maxSide, int quality) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(input, null, bounds);
        }
        int sample = 1;
        while (Math.max(bounds.outWidth / sample, bounds.outHeight / sample) > maxSide * 2) sample *= 2;

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap bitmap;
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            bitmap = BitmapFactory.decodeStream(input, null, options);
        }
        if (bitmap == null) throw new IOException("无法读取照片");

        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input != null) orientation = new ExifInterface(input).getAttributeInt(
                ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        }
        Bitmap rotated = rotateForExif(bitmap, orientation);
        if (rotated != bitmap) bitmap.recycle();

        int width = rotated.getWidth();
        int height = rotated.getHeight();
        Bitmap scaled = rotated;
        int largest = Math.max(width, height);
        if (largest > maxSide) {
            float ratio = maxSide / (float) largest;
            scaled = Bitmap.createScaledBitmap(rotated, Math.round(width * ratio), Math.round(height * ratio), true);
            if (scaled != rotated) rotated.recycle();
        }

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, output);
        scaled.recycle();
        return output.toByteArray();
    }

    private static Bitmap rotateForExif(Bitmap bitmap, int orientation) {
        Matrix matrix = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f);
            case ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f);
            case ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f);
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f);
            case ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f);
            default -> { return bitmap; }
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
    }

    private void deliverNativeError(String message) {
        String safe = message == null ? "原生功能执行失败" : message
            .replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
        runOnUiThread(() -> webView.evaluateJavascript(
            "window.__LuckyBeanNativeError && window.__LuckyBeanNativeError('" + safe + "');", null));
    }

    private void speakNative(String text, String language, float rate, float pitch) {
        PendingSpeech speech = new PendingSpeech(text, language, rate, pitch);
        if (!ttsReady || textToSpeech == null) {
            pendingSpeech = speech;
            return;
        }
        Locale locale = Locale.SIMPLIFIED_CHINESE;
        if (language != null && !language.isBlank()) locale = Locale.forLanguageTag(language);
        textToSpeech.setLanguage(locale);
        textToSpeech.setSpeechRate(Math.max(0.5f, Math.min(rate, 2.0f)));
        textToSpeech.setPitch(Math.max(0.5f, Math.min(pitch, 2.0f)));
        textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "luckybean-" + System.currentTimeMillis());
    }

    @Override
    public void onInit(int status) {
        ttsReady = status == TextToSpeech.SUCCESS;
        if (ttsReady && pendingSpeech != null) {
            PendingSpeech speech = pendingSpeech;
            pendingSpeech = null;
            runOnUiThread(() -> speakNative(speech.text, speech.language, speech.rate, speech.pitch));
        }
    }

    private boolean hasMediaPermissions(boolean camera, boolean audio) {
        return (!camera || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
            && (!audio || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
    }

    private String[] requiredPermissions(boolean camera, boolean audio) {
        ArrayList<String> result = new ArrayList<>();
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
        if (requestCode == NATIVE_CAMERA_PERMISSION_REQUEST) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted && pendingNativeCapture) launchNativeCamera();
            else deliverNativeError("未获得相机权限");
            pendingNativeCapture = false;
            return;
        }
        if (requestCode != WEB_MEDIA_PERMISSION_REQUEST || pendingWebPermission == null) return;
        boolean granted = true;
        for (int result : grantResults) granted &= result == PackageManager.PERMISSION_GRANTED;
        if (granted) pendingWebPermission.grant(pendingWebPermission.getResources());
        else pendingWebPermission.deny();
        pendingWebPermission = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == NATIVE_CAMERA_REQUEST) {
            if (resultCode == RESULT_OK && nativeCameraUri != null) deliverNativeImage(nativeCameraUri);
            else deliverNativeError("拍照已取消");
            nativeCameraUri = null;
            return;
        }
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data == null || data.getData() == null) {
                if (fileChooserCameraUri != null) result = new Uri[]{fileChooserCameraUri};
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
        fileChooserCameraUri = null;
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
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
        }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.removeJavascriptInterface("LuckyBeanAndroid");
            webView.removeJavascriptInterface("LuckyBeanOcrAndroid");
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    private record PendingSpeech(String text, String language, float rate, float pitch) {}

    private static final String NATIVE_BRIDGE_SCRIPT = """
        (() => {
          if (window.__luckyBeanNativeBridgeInstalled || !window.LuckyBeanAndroid) return;
          window.__luckyBeanNativeBridgeInstalled = true;
          window.__LUCKYBEAN_ANDROID__ = true;
          const native = window.LuckyBeanAndroid;
          const nativeOcr = window.LuckyBeanOcrAndroid;
          const ocrPending = new Map();
          const detailEvent = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

          window.LuckyBeanPlatform = Object.assign(window.LuckyBeanPlatform || {}, {
            camera: {
              capture: () => { native.capturePhoto(); return Promise.resolve({ pending: true }); }
            },
            tts: {
              speak: payload => {
                const value = typeof payload === 'string' ? { text: payload } : (payload || {});
                native.speak(String(value.text || ''), String(value.language || value.lang || 'zh-CN'), Number(value.rate || 1), Number(value.pitch || 1));
                return Promise.resolve({ ok: true });
              },
              stop: () => { native.stopSpeech(); return Promise.resolve({ ok: true }); }
            },
            share: {
              open: payload => {
                native.shareText(typeof payload === 'string' ? payload : String(payload?.text || payload?.url || ''));
                return Promise.resolve({ ok: true });
              }
            }
          });

          if (!window.SpeechSynthesisUtterance) {
            window.SpeechSynthesisUtterance = function(text) {
              this.text = String(text || ''); this.lang = 'zh-CN'; this.rate = 1; this.pitch = 1;
            };
          }
          const nativeSynth = {
            speaking: false, pending: false, paused: false,
            speak(utterance) {
              native.speak(String(utterance?.text || ''), String(utterance?.lang || 'zh-CN'), Number(utterance?.rate || 1), Number(utterance?.pitch || 1));
            },
            cancel() { native.stopSpeech(); },
            pause() { native.stopSpeech(); },
            resume() {},
            getVoices() { return []; },
            addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
          };
          try {
            Object.defineProperty(window, 'speechSynthesis', { value: nativeSynth, configurable: true });
          } catch (_) {
            try {
              window.speechSynthesis.speak = nativeSynth.speak;
              window.speechSynthesis.cancel = nativeSynth.cancel;
            } catch (_) {}
          }


          window.__LuckyBeanNativeOcrResult = (requestId, ok, payload) => {
            const pending = ocrPending.get(String(requestId || ''));
            if (!pending) return;
            ocrPending.delete(String(requestId || ''));
            if (ok) pending.resolve(payload || { engine: 'android-mlkit-chinese', results: [] });
            else pending.reject(new Error(String(payload || '原生 OCR 识别失败')));
          };

          if (nativeOcr && typeof nativeOcr.recognizeCoffeeBag === 'function') {
            window.LuckyBeanRecognitionBridge = {
              recognizeCoffeeBag(payload) {
                const requestId = `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                return new Promise((resolve, reject) => {
                  ocrPending.set(requestId, { resolve, reject });
                  window.dispatchEvent(new CustomEvent('luckybean:ocr-progress', {
                    detail: { status: '正在使用 Android 原生中文 OCR', progress: 12 }
                  }));
                  try {
                    nativeOcr.recognizeCoffeeBag(requestId, JSON.stringify(payload || {}));
                  } catch (error) {
                    ocrPending.delete(requestId);
                    reject(error);
                  }
                });
              }
            };
            document.documentElement.dataset.webOcr = 'android-mlkit-chinese-16.0.1';
          }

          const enforceCloudOnly = () => {
            for (const id of ['guestBtn', 'testBtn']) {
              const node = document.getElementById(id);
              if (node) { node.hidden = true; node.style.display = 'none'; node.setAttribute('aria-hidden', 'true'); }
            }
          };
          enforceCloudOnly();
          new MutationObserver(enforceCloudOnly).observe(document.documentElement, { childList: true, subtree: true });

          window.addEventListener('click', event => {
            const button = event.target?.closest?.('#bagCameraBtn');
            if (!button || button.disabled) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            native.capturePhoto();
          }, true);

          window.__LuckyBeanNativeDeliverImage = (base64, mime, name) => {
            const input = document.querySelector('#bagCameraInput');
            if (!input) {
              window.__LuckyBeanNativeError('拍袋录入窗口已经关闭');
              return false;
            }
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            const file = new File([bytes], name || `coffee-bag-${Date.now()}.jpg`, { type: mime || 'image/jpeg' });
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            detailEvent('luckybean:native-camera', { ok: true, name: file.name, size: file.size });
            return true;
          };

          window.__LuckyBeanNativeError = message => {
            console.error('[LuckyBean Native]', message);
            const toast = document.getElementById('toast');
            if (toast) {
              toast.textContent = String(message || '原生功能执行失败');
              toast.className = 'toast show error';
              setTimeout(() => { toast.className = 'toast'; }, 3600);
            } else {
              alert(String(message || '原生功能执行失败'));
            }
            detailEvent('luckybean:native-error', { message: String(message || '') });
          };
        })();
        """;
}
