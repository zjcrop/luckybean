package com.luckybean.app;

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
 * Serves a deliberately small set of startup and stability-critical files from the APK.
 * The rest of LuckyBean remains online and is updated from the single Web project.
 */
public final class LocalWebAssetCache {
    private static final String TRUSTED_HOST = "zjcrop.github.io";
    private static final String PREFIX = "/BrewIon/luckybean/";
    private static final Map<String, String> FILES;

    static {
        Map<String, String> files = new LinkedHashMap<>();
        files.put("public/app-logo.webp", "image/webp");
        files.put("public/splash-art-red.webp", "image/webp");
        files.put("public/splash-art-light.webp", "image/webp");
        files.put("public/settings-mascot.webp", "image/webp");
        files.put("src/app.js", "text/javascript");
        files.put("src/v095-sensory-bootstrap.js", "text/javascript");
        files.put("src/v095-sensory-pro.js", "text/javascript");
        files.put("src/v095-sensory-flow-guard.js", "text/javascript");
        files.put("src/v099f-cloud-sync.js", "text/javascript");
        files.put("src/v099p-settings-rebuild.js", "text/javascript");
        FILES = Collections.unmodifiableMap(files);
    }

    private LocalWebAssetCache() {}

    public static WebResourceResponse open(Context context, Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return null;
        if (!TRUSTED_HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith(PREFIX)) return null;
        String relative = path.substring(PREFIX.length());
        String mime = FILES.get(relative);
        if (mime == null) return null;
        try {
            InputStream input = context.getAssets().open("web-cache/" + relative);
            String encoding = mime.startsWith("text/") ? "UTF-8" : null;
            WebResourceResponse response = new WebResourceResponse(mime, encoding, input);
            response.setStatusCodeAndReasonPhrase(200, "OK");
            response.setResponseHeaders(Map.of(
                "Cache-Control", "no-store",
                "X-LuckyBean-Asset", "apk-cache"
            ));
            return response;
        } catch (IOException error) {
            android.util.Log.w("LuckyBeanAssets", "Local asset unavailable: " + relative, error);
            return null;
        }
    }
}
