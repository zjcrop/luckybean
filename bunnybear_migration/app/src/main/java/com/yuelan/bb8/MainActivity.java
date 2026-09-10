package com.yuelan.bb8;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final String PATCH_VERSION = "BunnyBear Cycle Calendar Patch 2.4.0";
    private static final int REQ_SAVE = 4101;
    private static final int REQ_PICK = 4102;
    private WebView webView;
    private volatile CountDownLatch fileLatch;
    private volatile String fileResult;
    private volatile String pendingWriteText;
    private ValueCallback<Uri[]> webFileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            File index = prepareMigratedWebApp();
            startWebView(index);
        } catch (Throwable t) {
            showMigrationError(t);
        }
    }

    private void startWebView(File index) {
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        webView.addJavascriptInterface(new WebdavBridge(), "NativeWebdav");
        webView.addJavascriptInterface(new FilesBridge(), "NativeFiles");
        webView.addJavascriptInterface(new BarBridge(), "NativeBar");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (webFileCallback != null) webFileCallback.onReceiveValue(null);
                webFileCallback = callback;
                Intent i = params.createIntent();
                try { startActivityForResult(i, REQ_PICK + 100); }
                catch (Throwable e) { webFileCallback = null; return false; }
                return true;
            }
        });
        WebView.setWebContentsDebuggingEnabled(true);
        webView.loadUrl(Uri.fromFile(index).toString());
    }

    private File prepareMigratedWebApp() throws Exception {
        File base = new File(getFilesDir(), "bunnybear-web-2.4.0");
        File ready = new File(base, ".bb-ready");
        File savedRoot = new File(getFilesDir(), "bunnybear-web-root.txt");
        if (ready.isFile() && savedRoot.isFile()) {
            String rel = readText(savedRoot).trim();
            File index = new File(base, rel);
            if (index.isFile()) return index;
        }

        deleteRecursively(base);
        if (!base.mkdirs() && !base.isDirectory()) throw new Exception("无法建立应用迁移目录");

        String sourcePkg = findBestInstalledSourcePackage();
        if (sourcePkg == null) {
            throw new Exception("未检测到可继承的 BunnyBear 旧版。请保留已安装的 BunnyBear v2.x，再安装此升级 APK；首次启动完成资源复制后即可独立运行。");
        }

        Context old = createPackageContext(sourcePkg, Context.CONTEXT_IGNORE_SECURITY);
        AssetManager am = old.getAssets();
        copyAssetTree(am, "", base);

        File index = findIndexHtml(base);
        if (index == null) throw new Exception("旧版 APK 的 assets 中没有找到 index.html；为避免丢失内容，已中止升级。");

        File original = new File(index.getParentFile(), "index.original.html");
        copyFile(index, original);
        String beforeSha = sha256(index);
        int beforeFiles = countFiles(base);
        List<String> imageHashesBefore = collectImageHashes(base);

        String html = readText(index);
        if (!html.contains(PATCH_VERSION)) {
            String shim = "<script id=\"bb-native-bridge-2-4\">" +
                    "window.AndroidWebdav={available:true,put:function(u,n,a,p,c){return NativeWebdav.put(u,n,a,p,c)},get:function(u,n,a,p){return NativeWebdav.get(u,n,a,p)},mkcol:function(u,a,p){return NativeWebdav.mkcol(u,a,p)}};" +
                    "window.AndroidFiles={available:true,save:function(n,m,c){return NativeFiles.save(n,m,c)},pickText:function(m){return NativeFiles.pickText(m)}};" +
                    "window.AndroidBar={apply:function(c,l){NativeBar.apply(c,l)}};" +
                    "</script>";
            String css = readBundledAsset("patch/bb_v2_4.css");
            String core = readBundledAsset("patch/bb_cycle_core.js");
            String runtime = readBundledAsset("patch/bb_runtime_patch.js");
            String headInsert = shim + "\n<style id=\"bb-v2-4-style\">\n" + css + "\n</style>\n" +
                    "<script id=\"bb-cycle-core-v2\">\n" + core + "\n</script>\n";
            String bodyInsert = "\n<script id=\"bb-runtime-v2-4\">\n" + runtime + "\n</script>\n";
            if (!html.contains("</head>") || !html.contains("</body>")) throw new Exception("旧版 index.html 结构异常；为避免破坏已中止升级。");
            html = html.replaceFirst("(?i)</head>", java.util.regex.Matcher.quoteReplacement(headInsert + "</head>"));
            html = html.replaceFirst("(?i)</body>", java.util.regex.Matcher.quoteReplacement(bodyInsert + "</body>"));
            writeText(index, html);
        }

        int afterFiles = countFiles(base);
        List<String> imageHashesAfter = collectImageHashes(base);
        if (!imageHashesBefore.equals(imageHashesAfter)) {
            throw new Exception("图片资源完整性校验失败；升级已停止，不会用替代图片覆盖原资源。");
        }
        if (afterFiles < beforeFiles + 1) throw new Exception("资源文件数量异常；升级已停止。");

        String rel = relativePath(base, index);
        writeText(savedRoot, rel);
        writeText(new File(getFilesDir(), "bunnybear-migration-manifest.txt"),
                "patch=" + PATCH_VERSION + "\n" +
                "sourcePackage=" + sourcePkg + "\n" +
                "sourceIndexSha256=" + beforeSha + "\n" +
                "patchedIndexSha256=" + sha256(index) + "\n" +
                "filesBeforePatch=" + beforeFiles + "\n" +
                "filesAfterPatch=" + afterFiles + "\n" +
                "imageCount=" + imageHashesAfter.size() + "\n" +
                String.join("\n", imageHashesAfter) + "\n");
        writeText(ready, PATCH_VERSION + "\n");
        return index;
    }

    private String findBestInstalledSourcePackage() {
        List<String> candidates = new ArrayList<>();
        for (int i = 20; i >= 1; i--) if (i != 8) candidates.add("com.yuelan.bb" + i);
        // Known latest complete build gets explicit priority.
        candidates.remove("com.yuelan.bb7");
        candidates.add(0, "com.yuelan.bb7");
        for (String pkg : candidates) {
            try {
                Context c = createPackageContext(pkg, Context.CONTEXT_IGNORE_SECURITY);
                AssetManager a = c.getAssets();
                if (assetTreeContainsIndex(a, "")) return pkg;
            } catch (Throwable ignored) { }
        }
        return null;
    }

    private boolean assetTreeContainsIndex(AssetManager am, String path) {
        try {
            String[] children = am.list(path);
            if (children == null) return false;
            for (String n : children) {
                String p = path.isEmpty() ? n : path + "/" + n;
                if ("index.html".equalsIgnoreCase(n)) {
                    try (InputStream in = am.open(p)) { return true; }
                }
                if (assetTreeContainsIndex(am, p)) return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }

    private void copyAssetTree(AssetManager am, String path, File outRoot) throws Exception {
        String[] children = am.list(path);
        if (children != null && children.length > 0) {
            File dir = path.isEmpty() ? outRoot : new File(outRoot, path);
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法建立资源目录: " + path);
            for (String child : children) {
                String p = path.isEmpty() ? child : path + "/" + child;
                copyAssetTree(am, p, outRoot);
            }
            return;
        }
        if (path.isEmpty()) return;
        File dst = new File(outRoot, path);
        File parent = dst.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) throw new Exception("无法建立目录: " + parent);
        try (InputStream in = new BufferedInputStream(am.open(path)); OutputStream out = new BufferedOutputStream(new FileOutputStream(dst))) {
            byte[] buf = new byte[32768]; int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        }
    }

    private File findIndexHtml(File root) {
        if (root.isFile()) return "index.html".equalsIgnoreCase(root.getName()) ? root : null;
        File[] list = root.listFiles();
        if (list == null) return null;
        Arrays.sort(list, Comparator.comparing(File::getName));
        for (File f : list) if (f.isFile() && "index.html".equalsIgnoreCase(f.getName())) return f;
        for (File f : list) if (f.isDirectory()) { File r = findIndexHtml(f); if (r != null) return r; }
        return null;
    }

    private String readBundledAsset(String path) throws Exception {
        try (InputStream in = getAssets().open(path)) { return readStream(in); }
    }

    private static String readText(File f) throws Exception {
        try (InputStream in = new FileInputStream(f)) { return readStream(in); }
    }

    private static String readStream(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] b = new byte[32768]; int n;
        while ((n = in.read(b)) >= 0) out.write(b, 0, n);
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private static void writeText(File f, String s) throws Exception {
        File p = f.getParentFile(); if (p != null && !p.exists()) p.mkdirs();
        try (OutputStream out = new FileOutputStream(f)) { out.write(s.getBytes(StandardCharsets.UTF_8)); }
    }

    private static void copyFile(File a, File b) throws Exception {
        try (InputStream in = new FileInputStream(a); OutputStream out = new FileOutputStream(b)) {
            byte[] buf = new byte[32768]; int n; while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        }
    }

    private static void deleteRecursively(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) { File[] a = f.listFiles(); if (a != null) for (File x : a) deleteRecursively(x); }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static int countFiles(File f) {
        if (f.isFile()) return 1;
        int n = 0; File[] a = f.listFiles(); if (a != null) for (File x : a) n += countFiles(x); return n;
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[32768]; int n; while ((n = in.read(b)) >= 0) md.update(b, 0, n);
        }
        StringBuilder s = new StringBuilder(); for (byte x : md.digest()) s.append(String.format(Locale.US, "%02x", x)); return s.toString();
    }

    private static List<String> collectImageHashes(File root) throws Exception {
        List<String> out = new ArrayList<>(); collectImageHashes(root, root, out); Collections.sort(out); return out;
    }

    private static void collectImageHashes(File root, File f, List<String> out) throws Exception {
        if (f.isDirectory()) { File[] a = f.listFiles(); if (a != null) for (File x : a) collectImageHashes(root, x, out); return; }
        String n = f.getName().toLowerCase(Locale.ROOT);
        if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp") || n.endsWith(".gif") || n.endsWith(".svg"))
            out.add(relativePath(root, f) + "=" + sha256(f));
    }

    private static String relativePath(File root, File f) {
        String rp = root.toURI().relativize(f.toURI()).getPath(); return Uri.decode(rp);
    }

    private void showMigrationError(Throwable t) {
        TextView tv = new TextView(this);
        tv.setPadding(48, 96, 48, 48);
        tv.setTextSize(17f);
        tv.setTextColor(Color.rgb(40, 36, 48));
        tv.setBackgroundColor(Color.rgb(246, 244, 251));
        tv.setText("BunnyBear 2.4.0\n\n为保证原应用内容和图片零替换，本升级包必须在旧版 BunnyBear 仍安装时首次启动。\n\n" + t.getMessage());
        setContentView(tv);
    }

    public class BarBridge {
        @JavascriptInterface public void apply(final long color, final boolean light) {
            runOnUiThread(() -> {
                Window w = getWindow(); int c = (int) color;
                w.setStatusBarColor(c); w.setNavigationBarColor(c);
                int flags = w.getDecorView().getSystemUiVisibility();
                if (light) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                else flags &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                w.getDecorView().setSystemUiVisibility(flags);
            });
        }
    }

    public class FilesBridge {
        @JavascriptInterface public String save(String name, String mime, String content) {
            CountDownLatch latch = new CountDownLatch(1); fileLatch = latch; fileResult = "cancel"; pendingWriteText = content == null ? "" : content;
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE); i.setType((mime == null || mime.isEmpty()) ? "text/plain" : mime);
                    i.putExtra(Intent.EXTRA_TITLE, name == null ? "BunnyBear.txt" : name); startActivityForResult(i, REQ_SAVE);
                } catch (Throwable e) { fileResult = "error:" + e.getMessage(); latch.countDown(); }
            });
            try { latch.await(180, TimeUnit.SECONDS); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            return fileResult;
        }

        @JavascriptInterface public String pickText(String mimeCsv) {
            CountDownLatch latch = new CountDownLatch(1); fileLatch = latch; fileResult = ""; pendingWriteText = null;
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
                    if (mimeCsv != null && !mimeCsv.trim().isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, mimeCsv.split(","));
                    startActivityForResult(i, REQ_PICK);
                } catch (Throwable e) { fileResult = ""; latch.countDown(); }
            });
            try { latch.await(180, TimeUnit.SECONDS); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            return fileResult == null ? "" : fileResult;
        }
    }

    public class WebdavBridge {
        private HttpURLConnection open(String method, String url, String user, String pass) throws Exception {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod(method); c.setConnectTimeout(15000); c.setReadTimeout(20000); c.setUseCaches(false);
            String auth = (user == null ? "" : user) + ":" + (pass == null ? "" : pass);
            c.setRequestProperty("Authorization", "Basic " + Base64.encodeToString(auth.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
            return c;
        }
        private String childUrl(String base, String name) { return base.replaceAll("/+$", "") + "/" + Uri.encode(name == null ? "" : name, "-_.~"); }

        @JavascriptInterface public String put(String base, String name, String user, String pass, String content) {
            HttpURLConnection c = null;
            try {
                c = open("PUT", childUrl(base, name), user, pass); c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] b = (content == null ? "" : content).getBytes(StandardCharsets.UTF_8); c.setFixedLengthStreamingMode(b.length);
                try (OutputStream o = c.getOutputStream()) { o.write(b); }
                int code = c.getResponseCode(); return code >= 200 && code < 300 ? "ok" : "HTTP " + code;
            } catch (Throwable e) { return "__ERR__" + e.getMessage(); } finally { if (c != null) c.disconnect(); }
        }

        @JavascriptInterface public String get(String base, String name, String user, String pass) {
            HttpURLConnection c = null;
            try {
                c = open("GET", childUrl(base, name), user, pass); int code = c.getResponseCode();
                if (code == 404) return ""; if (code < 200 || code >= 300) return "__ERR__HTTP " + code;
                return readStream(c.getInputStream());
            } catch (Throwable e) { return "__ERR__" + e.getMessage(); } finally { if (c != null) c.disconnect(); }
        }

        @JavascriptInterface public String mkcol(String url, String user, String pass) {
            HttpURLConnection c = null;
            try { c = open("MKCOL", url, user, pass); int code = c.getResponseCode(); return (code >= 200 && code < 300) || code == 405 ? "ok" : "HTTP " + code; }
            catch (Throwable e) { return "__ERR__" + e.getMessage(); } finally { if (c != null) c.disconnect(); }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK + 100) {
            if (webFileCallback != null) {
                Uri[] uris = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) uris = new Uri[]{data.getData()};
                webFileCallback.onReceiveValue(uris); webFileCallback = null;
            }
            return;
        }
        CountDownLatch latch = fileLatch;
        if (requestCode == REQ_SAVE) {
            try {
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    try (OutputStream o = getContentResolver().openOutputStream(data.getData(), "wt")) {
                        if (o == null) throw new Exception("无法打开保存位置"); o.write((pendingWriteText == null ? "" : pendingWriteText).getBytes(StandardCharsets.UTF_8));
                    }
                    fileResult = "ok";
                } else fileResult = "cancel";
            } catch (Throwable e) { fileResult = "error:" + e.getMessage(); }
            if (latch != null) latch.countDown(); return;
        }
        if (requestCode == REQ_PICK) {
            try {
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    try (InputStream in = getContentResolver().openInputStream(data.getData())) { fileResult = in == null ? "" : readStream(in); }
                } else fileResult = "";
            } catch (Throwable e) { fileResult = ""; }
            if (latch != null) latch.countDown();
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
}
