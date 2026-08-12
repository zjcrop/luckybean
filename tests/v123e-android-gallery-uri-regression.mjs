import assert from 'node:assert/strict';
import fs from 'node:fs';

const activity = fs.readFileSync(new URL('../android/app/src/main/java/com/luckybean/app/MainActivity.java', import.meta.url), 'utf8');

assert.match(activity, /boolean captureOnly = params\.isCaptureEnabled\(\)/, 'camera/gallery routing must use FileChooserParams capture mode');
assert.match(activity, /if \(captureOnly && getPackageManager\(\)\.hasSystemFeature\(PackageManager\.FEATURE_CAMERA_ANY\)\)/, 'camera output URI must only be created for capture mode');
assert.doesNotMatch(activity, /chooser\.putExtra\(Intent\.EXTRA_INITIAL_INTENTS/, 'gallery chooser must not inject a camera intent');

const clipIndex = activity.indexOf('ClipData clip = data == null ? null : data.getClipData();');
const singleIndex = activity.indexOf('Uri single = data == null ? null : data.getData();');
const cameraIndex = activity.indexOf('else if (cameraOutputUri != null)');
assert.ok(clipIndex >= 0 && singleIndex > clipIndex && cameraIndex > singleIndex,
  'activity result must prefer ClipData, then single gallery URI, then cameraOutputUri');

assert.match(activity, /takePersistableUriPermission/, 'gallery content URIs should retain read permission where supported');
assert.match(activity, /cleanupUnusedCameraOutput\(/, 'unused MediaStore camera placeholders must be cleaned up');
assert.match(activity, /rememberRecognitionSources\(result\)/, 'resolved gallery URIs must still feed the native OCR binding queue');

console.log('LuckyBean Android gallery URI routing regression checks passed');
