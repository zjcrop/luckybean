from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Package the complete public static directory rather than four hand-picked images.
gradle = ROOT / 'android/app/build.gradle'
text = gradle.read_text(encoding='utf-8')
for line in [
    "        include 'public/app-logo.webp'\n",
    "        include 'public/splash-art-red.webp'\n",
    "        include 'public/splash-art-light.webp'\n",
    "        include 'public/settings-mascot.webp'\n",
]:
    text = text.replace(line, '')
needle = "    from(rootProject.projectDir.parentFile) {\n"
if "        include 'public/**'" not in text:
    if needle not in text:
        raise SystemExit('missing online shell Copy source block')
    text = text.replace(needle, needle + "        include 'public/**'\n", 1)
if "include 'src/codebook.js'" not in text:
    text = text.replace("        include 'src/app.js'\n", "        include 'src/app.js'\n        include 'src/codebook.js'\n", 1)
gradle.write_text(text, encoding='utf-8')

cache = ROOT / 'android/app/src/main/java/com/luckybean/app/LocalWebAssetCache.java'
cache.write_text(r'''package com.luckybean.app;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * APK-local cache for startup-critical JavaScript and every file under public/.
 * HTML and ordinary business modules remain online; illustrations and fixed media do not.
 */
public final class LocalWebAssetCache {
    private static final String TRUSTED_HOST = "zjcrop.github.io";
    private static final String PREFIX = "/BrewIon/luckybean/";
    private static final Map<String, String> CRITICAL_FILES;

    static {
        Map<String, String> files = new LinkedHashMap<>();
        files.put("src/app.js", "text/javascript");
        files.put("src/codebook.js", "text/javascript");
        files.put("src/v095-sensory-bootstrap.js", "text/javascript");
        files.put("src/v095-sensory-pro.js", "text/javascript");
        files.put("src/v095-sensory-flow-guard.js", "text/javascript");
        files.put("src/v099f-cloud-sync.js", "text/javascript");
        files.put("src/v099p-settings-rebuild.js", "text/javascript");
        CRITICAL_FILES = Collections.unmodifiableMap(files);
    }

    private LocalWebAssetCache() {}

    private static boolean safeRelativePath(String relative) {
        return relative != null
            && !relative.isBlank()
            && !relative.startsWith("/")
            && !relative.contains("..")
            && !relative.contains("\\")
            && relative.length() < 320;
    }

    private static String publicMime(String relative) {
        String lower = relative.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".avif")) return "image/avif";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "text/javascript";
        if (lower.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private static boolean textMime(String mime) {
        return mime.startsWith("text/")
            || "application/json".equals(mime)
            || "image/svg+xml".equals(mime)
            || "text/javascript".equals(mime);
    }

    public static WebResourceResponse open(Context context, Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return null;
        if (!TRUSTED_HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith(PREFIX)) return null;
        String relative = path.substring(PREFIX.length());
        if (!safeRelativePath(relative)) return null;

        String mime = CRITICAL_FILES.get(relative);
        if (mime == null && relative.startsWith("public/")) mime = publicMime(relative);
        if (mime == null) return null;

        try {
            InputStream input = context.getAssets().open("web-cache/" + relative);
            WebResourceResponse response = new WebResourceResponse(mime, textMime(mime) ? "UTF-8" : null, input);
            response.setStatusCodeAndReasonPhrase(200, "OK");
            response.setResponseHeaders(Map.of(
                "Cache-Control", "public, max-age=31536000, immutable",
                "X-LuckyBean-Asset", "apk-cache-v105"
            ));
            return response;
        } catch (IOException error) {
            android.util.Log.w("LuckyBeanAssets", "Local asset unavailable: " + relative, error);
            return null;
        }
    }
}
''', encoding='utf-8')

if "include 'public/**'" not in gradle.read_text(encoding='utf-8'):
    raise SystemExit('public directory was not added to generated APK assets')
if 'relative.startsWith("public/")' not in cache.read_text(encoding='utf-8'):
    raise SystemExit('public directory is not served from APK cache')

print('Applied LuckyBean v1.0.5 complete public illustration cache.')
