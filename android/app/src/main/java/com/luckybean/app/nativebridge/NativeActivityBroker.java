package com.luckybean.app.nativebridge;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.luckybean.app.camera.CameraCaptureActivity;

import org.json.JSONArray;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoResult;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class NativeActivityBroker {
    private static final int REQUEST_SAVE_TEXT = 3201;
    private static final int REQUEST_OPEN_TEXT = 3202;
    private static final int REQUEST_OCR_IMAGE = 3203;
    private static final int REQUEST_CAMERA_CAPTURE = 3204;
    private static final int MAX_TEXT_BYTES = 25 * 1024 * 1024;

    private final Activity activity;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<Integer, GeckoResult<Object>> pending = new HashMap<>();
    private String pendingText = "";

    public NativeActivityBroker(Activity activity) {
        this.activity = activity;
    }

    public GeckoResult<Object> saveText(String suggestedName, String mimeType, String text) {
        if (pending.containsKey(REQUEST_SAVE_TEXT)) return busy("已有文件保存操作正在进行");
        GeckoResult<Object> result = new GeckoResult<>();
        pending.put(REQUEST_SAVE_TEXT, result);
        pendingText = text;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType == null || mimeType.isBlank() ? "application/octet-stream" : mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, suggestedName == null || suggestedName.isBlank() ? "luckybean-export.json" : suggestedName);
        activity.startActivityForResult(intent, REQUEST_SAVE_TEXT);
        return result;
    }

    public GeckoResult<Object> openText(JSONArray mimeTypes) {
        if (pending.containsKey(REQUEST_OPEN_TEXT)) return busy("已有文件读取操作正在进行");
        GeckoResult<Object> result = new GeckoResult<>();
        pending.put(REQUEST_OPEN_TEXT, result);
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        if (mimeTypes != null && mimeTypes.length() > 0) {
            String[] types = new String[mimeTypes.length()];
            for (int i = 0; i < mimeTypes.length(); i++) types[i] = mimeTypes.optString(i, "*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, types);
        }
        activity.startActivityForResult(intent, REQUEST_OPEN_TEXT);
        return result;
    }

    public GeckoResult<Object> pickImageForOcr() {
        if (pending.containsKey(REQUEST_OCR_IMAGE)) return busy("已有 OCR 操作正在进行");
        GeckoResult<Object> result = new GeckoResult<>();
        pending.put(REQUEST_OCR_IMAGE, result);
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        activity.startActivityForResult(intent, REQUEST_OCR_IMAGE);
        return result;
    }

    public GeckoResult<Object> captureImage() {
        if (pending.containsKey(REQUEST_CAMERA_CAPTURE)) return busy("相机正在使用");
        GeckoResult<Object> result = new GeckoResult<>();
        pending.put(REQUEST_CAMERA_CAPTURE, result);
        activity.startActivityForResult(new Intent(activity, CameraCaptureActivity.class), REQUEST_CAMERA_CAPTURE);
        return result;
    }

    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        GeckoResult<Object> result = pending.remove(requestCode);
        if (result == null) return;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            pendingText = "";
            result.completeExceptionally(new IllegalStateException("用户取消了操作"));
            return;
        }
        Uri uri = data.getData();
        if (requestCode == REQUEST_SAVE_TEXT) {
            String text = pendingText;
            pendingText = "";
            io.execute(() -> writeText(uri, text, result));
        } else if (requestCode == REQUEST_OPEN_TEXT) {
            io.execute(() -> readText(uri, result));
        } else if (requestCode == REQUEST_OCR_IMAGE) {
            recognize(uri, result);
        } else if (requestCode == REQUEST_CAMERA_CAPTURE) {
            try {
                result.complete(new JSONObject()
                    .put("uri", uri.toString())
                    .put("source", "camera")
                    .put("persisted", true));
            } catch (Exception error) {
                result.completeExceptionally(error);
            }
        }
    }

    public void destroy() {
        for (GeckoResult<Object> result : pending.values()) {
            result.completeExceptionally(new IllegalStateException("Activity 已关闭"));
        }
        pending.clear();
        pendingText = "";
        io.shutdownNow();
    }

    private void writeText(Uri uri, String text, GeckoResult<Object> result) {
        try (OutputStream output = activity.getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IllegalStateException("无法打开目标文件");
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            output.write(bytes);
            output.flush();
            result.complete(new JSONObject()
                .put("uri", uri.toString())
                .put("bytes", bytes.length)
                .put("saved", true));
        } catch (Exception error) {
            result.completeExceptionally(error);
        }
    }

    private void readText(Uri uri, GeckoResult<Object> result) {
        try (InputStream input = activity.getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IllegalStateException("无法读取文件");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                total += read;
                if (total > MAX_TEXT_BYTES) throw new IllegalStateException("文件超过 25 MB 限制");
                output.write(buffer, 0, read);
            }
            result.complete(new JSONObject()
                .put("uri", uri.toString())
                .put("name", displayName(uri))
                .put("bytes", total)
                .put("text", output.toString(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            result.completeExceptionally(error);
        }
    }

    private void recognize(Uri uri, GeckoResult<Object> result) {
        try {
            InputImage image = InputImage.fromFilePath(activity, uri);
            TextRecognizer latin = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            TextRecognizer chinese = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
            latin.process(image)
                .continueWithTask(task -> {
                    String latinText = task.isSuccessful() && task.getResult() != null ? task.getResult().getText() : "";
                    return chinese.process(image).continueWith(chineseTask -> {
                        String chineseText = chineseTask.isSuccessful() && chineseTask.getResult() != null
                            ? chineseTask.getResult().getText() : "";
                        JSONObject value = new JSONObject();
                        value.put("uri", uri.toString());
                        value.put("latinText", latinText);
                        value.put("chineseText", chineseText);
                        value.put("text", mergeText(chineseText, latinText));
                        value.put("engine", "mlkit-bundled-v2");
                        return value;
                    });
                })
                .addOnSuccessListener(result::complete)
                .addOnFailureListener(result::completeExceptionally)
                .addOnCompleteListener(task -> {
                    latin.close();
                    chinese.close();
                });
        } catch (Exception error) {
            result.completeExceptionally(error);
        }
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = activity.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {}
        return "imported-file";
    }

    private static String mergeText(String first, String second) {
        String a = first == null ? "" : first.trim();
        String b = second == null ? "" : second.trim();
        if (a.isEmpty()) return b;
        if (b.isEmpty() || a.equals(b)) return a;
        return a + "\n" + b;
    }

    private static GeckoResult<Object> busy(String message) {
        return GeckoResult.fromException(new IllegalStateException(message));
    }
}
