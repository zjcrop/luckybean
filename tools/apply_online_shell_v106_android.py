from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

main = ROOT / 'android/app/src/main/java/com/luckybean/app/MainActivity.java'
text = main.read_text(encoding='utf-8')

text = text.replace('import android.app.Activity;\n', 'import android.app.Activity;\nimport android.app.backup.BackupManager;\n')
text = text.replace('import java.io.File;\n', 'import java.io.File;\nimport java.io.FileInputStream;\n')
text = text.replace('import java.util.Locale;\n', 'import java.util.Locale;\nimport java.nio.charset.StandardCharsets;\n')
text = text.replace('LuckyBeanAndroidOnline/1.0.1-test', 'LuckyBeanAndroidOnline/1.0.6-test')

field_marker = '    private android.view.View launchOverlay;\n'
if field_marker not in text:
    raise SystemExit('launch overlay field from v103 was not found')
if 'private final Object backupLock' not in text:
    text = text.replace(field_marker, field_marker + '''    private final Object backupLock = new Object();
    private static final long MAX_BACKUP_SNAPSHOT_BYTES = 20L * 1024L * 1024L;
    private static final String BACKUP_DIRECTORY = "luckybean-backup";
    private static final String BACKUP_FILENAME = "snapshot.json";
''')

old_start = '''        configureWebView();
        if (savedInstanceState == null) {
            loadOnlineApp();
        } else {
            webView.restoreState(savedInstanceState);
        }
'''
new_start = '''        configureWebView();
        scheduleLaunchOverlayWatchdog();
        // Always perform a real main-frame navigation. Restoring a WebView history entry can
        // skip onPageCommitVisible(), which previously left the native launch layer on screen.
        loadOnlineApp();
'''
if old_start not in text:
    raise SystemExit('WebView restoreState startup block was not found')
text = text.replace(old_start, new_start, 1)

text = text.replace(
    'webView.loadUrl(APP_URL + "?source=android-online-shell");',
    'webView.loadUrl(APP_URL + "?source=android-online-shell&shell=100106");'
)

old_commit = '''            if (launchOverlay != null) {
                launchOverlay.animate().alpha(0f).setDuration(180).withEndAction(() -> {
                    android.view.View overlay = launchOverlay;
                    launchOverlay = null;
                    if (overlay != null && overlay.getParent() instanceof android.view.ViewGroup parent) parent.removeView(overlay);
                }).start();
            }
'''
if old_commit not in text:
    raise SystemExit('v103 launch overlay dismissal block was not found')
text = text.replace(old_commit, '            dismissLaunchOverlay();\n', 1)

old_finished = '''        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isTrusted(Uri.parse(url))) installNativeBridge();
        }
'''
new_finished = '''        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            dismissLaunchOverlay();
            if (isTrusted(Uri.parse(url))) installNativeBridge();
        }
'''
if old_finished not in text:
    raise SystemExit('onPageFinished block was not found')
text = text.replace(old_finished, new_finished, 1)

text = text.replace(
    '            if (request.isForMainFrame()) showOfflinePage();',
    '            if (request.isForMainFrame()) { dismissLaunchOverlay(); showOfflinePage(); }'
)

method_marker = '    private void openExternal(Uri uri) {\n'
if method_marker not in text:
    raise SystemExit('openExternal method marker was not found')
startup_methods = '''    private void scheduleLaunchOverlayWatchdog() {
        if (webView == null) return;
        webView.postDelayed(this::dismissLaunchOverlay, 3200L);
    }

    private void dismissLaunchOverlay() {
        android.view.View overlay = launchOverlay;
        if (overlay == null) return;
        launchOverlay = null;
        overlay.animate().cancel();
        overlay.animate().alpha(0f).setDuration(160L).withEndAction(() -> {
            if (overlay.getParent() instanceof android.view.ViewGroup parent) parent.removeView(overlay);
        }).start();
    }

    private File backupSnapshotFile() {
        File directory = new File(getFilesDir(), BACKUP_DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) return null;
        return new File(directory, BACKUP_FILENAME);
    }

    private String readBackupSnapshotFile() {
        synchronized (backupLock) {
            File file = backupSnapshotFile();
            if (file == null || !file.isFile() || file.length() <= 0 || file.length() > MAX_BACKUP_SNAPSHOT_BYTES) return "";
            try (FileInputStream input = new FileInputStream(file);
                 ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(file.length(), 1024 * 1024))) {
                byte[] buffer = new byte[32 * 1024];
                int read;
                long total = 0;
                while ((read = input.read(buffer)) >= 0) {
                    total += read;
                    if (total > MAX_BACKUP_SNAPSHOT_BYTES) return "";
                    output.write(buffer, 0, read);
                }
                return output.toString(StandardCharsets.UTF_8);
            } catch (IOException error) {
                android.util.Log.w("LuckyBeanBackup", "Unable to read native backup snapshot", error);
                return "";
            }
        }
    }

    private void writeBackupSnapshotFile(String payload) {
        if (payload == null) return;
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        if (bytes.length == 0 || bytes.length > MAX_BACKUP_SNAPSHOT_BYTES) {
            deliverNativeError("自动备份大小无效或超过20MB");
            return;
        }
        new Thread(() -> {
            synchronized (backupLock) {
                File target = backupSnapshotFile();
                if (target == null) {
                    deliverNativeError("无法创建自动备份目录");
                    return;
                }
                File temporary = new File(target.getParentFile(), BACKUP_FILENAME + ".tmp");
                try (FileOutputStream output = new FileOutputStream(temporary, false)) {
                    output.write(bytes);
                    output.flush();
                    output.getFD().sync();
                } catch (IOException error) {
                    temporary.delete();
                    deliverNativeError("自动备份写入失败：" + error.getMessage());
                    return;
                }
                if (target.exists() && !target.delete()) {
                    temporary.delete();
                    deliverNativeError("无法替换旧自动备份");
                    return;
                }
                if (!temporary.renameTo(target)) {
                    temporary.delete();
                    deliverNativeError("自动备份原子替换失败");
                    return;
                }
                new BackupManager(MainActivity.this).dataChanged();
            }
        }, "LuckyBeanBackupSnapshot").start();
    }

'''
if 'private void scheduleLaunchOverlayWatchdog()' not in text:
    text = text.replace(method_marker, startup_methods + method_marker, 1)

bridge_marker = '''        @JavascriptInterface
        public void reload() {
            runOnUiThread(MainActivity.this::loadOnlineApp);
        }
'''
bridge_replacement = bridge_marker + '''
        @JavascriptInterface
        public String readBackupSnapshot() {
            return readBackupSnapshotFile();
        }

        @JavascriptInterface
        public void saveBackupSnapshot(String payload) {
            writeBackupSnapshotFile(payload);
        }
'''
if bridge_marker not in text:
    raise SystemExit('NativeBridge reload method was not found')
text = text.replace(bridge_marker, bridge_replacement, 1)
main.write_text(text, encoding='utf-8')

manifest = ROOT / 'android/app/src/main/AndroidManifest.xml'
manifest_text = manifest.read_text(encoding='utf-8')
manifest_text = manifest_text.replace(
    'android:fullBackupContent="true"',
    'android:fullBackupContent="@xml/backup_rules"\n        android:dataExtractionRules="@xml/data_extraction_rules"'
)
manifest.write_text(manifest_text, encoding='utf-8')

xml_dir = ROOT / 'android/app/src/main/res/xml'
xml_dir.mkdir(parents=True, exist_ok=True)
(xml_dir / 'backup_rules.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <include domain="file" path="luckybean-backup/" />
</full-backup-content>
''', encoding='utf-8')
(xml_dir / 'data_extraction_rules.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup disableIfNoEncryptionCapabilities="true">
        <include domain="file" path="luckybean-backup/" />
    </cloud-backup>
    <device-transfer>
        <include domain="file" path="luckybean-backup/" />
    </device-transfer>
</data-extraction-rules>
''', encoding='utf-8')

gradle = ROOT / 'android/app/build.gradle'
gradle_text = gradle.read_text(encoding='utf-8')
for include in [
    "        include 'src/brew-engine.js'\n",
    "        include 'src/db.js'\n",
    "        include 'src/v106-native-backup.js'\n",
]:
    if include.strip() not in gradle_text:
        gradle_text = gradle_text.replace("        include 'src/codebook.js'\n", "        include 'src/codebook.js'\n" + include, 1)
gradle.write_text(gradle_text, encoding='utf-8')

cache = ROOT / 'android/app/src/main/java/com/luckybean/app/LocalWebAssetCache.java'
cache_text = cache.read_text(encoding='utf-8')
entries = '''        files.put("src/brew-engine.js", "text/javascript");
        files.put("src/db.js", "text/javascript");
        files.put("src/v106-native-backup.js", "text/javascript");
'''
if 'src/v106-native-backup.js' not in cache_text:
    cache_text = cache_text.replace('        files.put("src/codebook.js", "text/javascript");\n', '        files.put("src/codebook.js", "text/javascript");\n' + entries, 1)
cache_text = cache_text.replace('apk-cache-v105', 'apk-cache-v106')
cache.write_text(cache_text, encoding='utf-8')

required = [
    'scheduleLaunchOverlayWatchdog',
    'saveBackupSnapshot',
    'readBackupSnapshot',
    'shell=100106',
]
for marker in required:
    if marker not in main.read_text(encoding='utf-8'):
        raise SystemExit(f'missing Android v106 marker: {marker}')
if 'dataExtractionRules="@xml/data_extraction_rules"' not in manifest.read_text(encoding='utf-8'):
    raise SystemExit('Android 12+ backup rules were not configured')

print('Applied LuckyBean v1.0.6 Android startup and backup fixes.')
