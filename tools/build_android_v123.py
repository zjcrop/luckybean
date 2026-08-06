from pathlib import Path

VERSION_NAME = '1.2.3-brewprofiles-integration-test'
VERSION_CODE = '100123'

gradle = Path('android/app/build.gradle')
text = gradle.read_text(encoding='utf-8')
required = [
    'versionCode 100101',
    "versionName '1.0.1-online-test'",
    "implementation 'androidx.exifinterface:exifinterface:1.3.7'",
]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit('unexpected Android Gradle baseline: ' + ', '.join(missing))
text = text.replace('versionCode 100101', f'versionCode {VERSION_CODE}', 1)
text = text.replace("versionName '1.0.1-online-test'", f"versionName '{VERSION_NAME}'", 1)
text = text.replace(
    "implementation 'androidx.exifinterface:exifinterface:1.3.7'",
    "implementation 'androidx.exifinterface:exifinterface:1.3.7'\n    implementation 'androidx.webkit:webkit:1.12.1'",
    1,
)
text = text.replace(
    "include 'public/**'\n        include 'src/**'\n        include 'styles.css'",
    "include 'index.html'\n        include 'manifest.webmanifest'\n        include 'sw.js'\n        include 'public/**'\n        include 'src/**'\n        include 'styles.css'",
    1,
)
gradle.write_text(text, encoding='utf-8')

java = Path('android/app/src/main/java/com/luckybean/app/MainActivity.java')
text = java.read_text(encoding='utf-8')
checks = [
    'private static final String APP_URL = "https://zjcrop.github.io/BrewIon/luckybean/";',
    'private WebView webView;',
    'settings.setUserAgentString(settings.getUserAgentString() + " LuckyBeanAndroidOnline/1.0.1-test");',
    'webView.setWebViewClient(new OnlineAppClient());',
    'private void loadOnlineApp() {',
]
missing = [item for item in checks if item not in text]
if missing:
    raise SystemExit('unexpected Android MainActivity baseline: ' + ', '.join(missing))
text = text.replace(
    'import android.webkit.WebResourceRequest;\n',
    'import android.webkit.WebResourceRequest;\nimport android.webkit.WebResourceResponse;\n',
    1,
)
text = text.replace(
    'import androidx.exifinterface.media.ExifInterface;\n',
    'import androidx.exifinterface.media.ExifInterface;\nimport androidx.webkit.WebViewAssetLoader;\n',
    1,
)
text = text.replace(
    'private static final String APP_URL = "https://zjcrop.github.io/BrewIon/luckybean/";\n    private static final String TRUSTED_HOST = "zjcrop.github.io";\n    private static final String TRUSTED_PATH_PREFIX = "/BrewIon/luckybean/";',
    'private static final String APP_URL = "https://appassets.androidplatform.net/assets/web-cache/index.html";\n    private static final String TRUSTED_HOST = "appassets.androidplatform.net";\n    private static final String TRUSTED_PATH_PREFIX = "/assets/web-cache/";',
    1,
)
text = text.replace(
    'private WebView webView;\n',
    'private WebView webView;\n    private WebViewAssetLoader assetLoader;\n',
    1,
)
text = text.replace(
    'settings.setUserAgentString(settings.getUserAgentString() + " LuckyBeanAndroidOnline/1.0.1-test");',
    'settings.setUserAgentString(settings.getUserAgentString() + " LuckyBeanAndroidLocalFirst/1.2.3-test");',
    1,
)
text = text.replace(
    'webView.addJavascriptInterface(new NativeOcrBridge(this, webView), "LuckyBeanOcrAndroid");\n        webView.setWebViewClient(new OnlineAppClient());',
    'webView.addJavascriptInterface(new NativeOcrBridge(this, webView), "LuckyBeanOcrAndroid");\n        assetLoader = new WebViewAssetLoader.Builder()\n            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))\n            .build();\n        webView.setWebViewClient(new OnlineAppClient());',
    1,
)
old_load = '''    private void loadOnlineApp() {
        if (!hasNetwork()) {
            showOfflinePage();
            return;
        }
        webView.loadUrl(APP_URL + "?source=android-online-shell");
    }
'''
new_load = '''    private void loadOnlineApp() {
        webView.loadUrl(APP_URL + "?source=android-local-first-v123");
    }
'''
if old_load not in text:
    raise SystemExit('loadOnlineApp source block not found')
text = text.replace(old_load, new_load, 1)
marker = '    private final class OnlineAppClient extends WebViewClient {\n'
replacement = '''    private final class OnlineAppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            WebResourceResponse response = assetLoader.shouldInterceptRequest(request.getUrl());
            return response != null ? response : super.shouldInterceptRequest(view, request);
        }

'''
if marker not in text:
    raise SystemExit('OnlineAppClient marker not found')
text = text.replace(marker, replacement, 1)
text = text.replace(
    '富贵盒子在线版必须联网并完成云端账户验证后使用。',
    '本地应用资源载入失败，请重新打开应用。',
    1,
)
java.write_text(text, encoding='utf-8')
