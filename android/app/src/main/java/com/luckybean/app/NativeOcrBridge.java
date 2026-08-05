package com.luckybean.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Android-native OCR adapter for the online shell.
 *
 * The Web UI remains unchanged. recognition-bridge.js discovers the injected
 * LuckyBeanRecognitionBridge facade, which forwards images here. The bundled
 * Chinese ML Kit model avoids dynamic ESM/CDN loading inside Android WebView.
 */
public final class NativeOcrBridge {
    private static final String ENGINE = "android-mlkit-chinese-16.0.1";

    private final Activity activity;
    private final WebView webView;
    private final AtomicBoolean busy = new AtomicBoolean(false);

    public NativeOcrBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public void recognizeCoffeeBag(String requestId, String payloadJson) {
        if (requestId == null || requestId.isBlank()) return;
        if (!busy.compareAndSet(false, true)) {
            sendError(requestId, "识别任务正在运行，请勿重复点击");
            return;
        }

        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject(payloadJson == null ? "{}" : payloadJson);
                JSONArray images = payload.optJSONArray("images");
                if (images == null || images.length() == 0) {
                    finishError(requestId, "请先添加豆袋照片");
                    return;
                }
                TextRecognizer recognizer = TextRecognition.getClient(
                    new ChineseTextRecognizerOptions.Builder().build()
                );
                JSONArray results = new JSONArray();
                processImage(requestId, images, 0, results, recognizer);
            } catch (Exception error) {
                finishError(requestId, "原生 OCR 初始化失败：" + safeMessage(error));
            }
        }, "LuckyBeanNativeOcrStart").start();
    }

    private void processImage(
        String requestId,
        JSONArray images,
        int index,
        JSONArray results,
        TextRecognizer recognizer
    ) {
        if (index >= images.length()) {
            try {
                JSONObject output = new JSONObject();
                output.put("engine", ENGINE);
                output.put("results", results);
                recognizer.close();
                busy.set(false);
                sendSuccess(requestId, output);
            } catch (JSONException error) {
                recognizer.close();
                finishError(requestId, "识别结果编码失败：" + safeMessage(error));
            }
            return;
        }

        try {
            JSONObject imageObject = images.getJSONObject(index);
            String imageId = imageObject.optString("id", "image-" + index);
            String dataUrl = imageObject.optString("dataUrl", "");
            int comma = dataUrl.indexOf(',');
            String encoded = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) throw new IllegalArgumentException("第 " + (index + 1) + " 张图片无法读取");

            InputImage inputImage = InputImage.fromBitmap(bitmap, 0);
            recognizer.process(inputImage)
                .addOnSuccessListener(activity, text -> {
                    try {
                        results.put(buildImageResult(imageId, text));
                        bitmap.recycle();
                        processImage(requestId, images, index + 1, results, recognizer);
                    } catch (Exception error) {
                        bitmap.recycle();
                        recognizer.close();
                        finishError(requestId, "识别结果处理失败：" + safeMessage(error));
                    }
                })
                .addOnFailureListener(activity, error -> {
                    bitmap.recycle();
                    recognizer.close();
                    finishError(requestId, "第 " + (index + 1) + " 张图片识别失败：" + safeMessage(error));
                });
        } catch (Exception error) {
            recognizer.close();
            finishError(requestId, "图片解析失败：" + safeMessage(error));
        }
    }

    private JSONObject buildImageResult(String imageId, Text text) throws JSONException {
        JSONArray blocks = new JSONArray();
        for (Text.TextBlock block : text.getTextBlocks()) {
            if (block.getLines().isEmpty()) {
                addBlock(blocks, block.getText(), block.getBoundingBox());
                continue;
            }
            for (Text.Line line : block.getLines()) {
                addBlock(blocks, line.getText(), line.getBoundingBox());
            }
        }

        JSONObject value = new JSONObject();
        value.put("blocks", blocks);
        JSONObject result = new JSONObject();
        result.put("imageId", imageId);
        result.put("value", value);
        return result;
    }

    private void addBlock(JSONArray blocks, String rawText, Rect box) throws JSONException {
        String text = rawText == null ? "" : rawText.trim();
        if (text.isEmpty()) return;
        JSONObject block = new JSONObject();
        block.put("text", text);
        block.put("confidence", 0.82d);
        if (box != null) {
            JSONArray polygon = new JSONArray();
            polygon.put(point(box.left, box.top));
            polygon.put(point(box.right, box.top));
            polygon.put(point(box.right, box.bottom));
            polygon.put(point(box.left, box.bottom));
            block.put("polygon", polygon);
        }
        blocks.put(block);
    }

    private JSONArray point(int x, int y) {
        JSONArray point = new JSONArray();
        point.put(x);
        point.put(y);
        return point;
    }

    private void finishError(String requestId, String message) {
        busy.set(false);
        sendError(requestId, message);
    }

    private void sendSuccess(String requestId, JSONObject result) {
        String javascript = "window.__LuckyBeanNativeOcrResult && window.__LuckyBeanNativeOcrResult("
            + JSONObject.quote(requestId) + ",true," + result + ");";
        activity.runOnUiThread(() -> webView.evaluateJavascript(javascript, null));
    }

    private void sendError(String requestId, String message) {
        String javascript = "window.__LuckyBeanNativeOcrResult && window.__LuckyBeanNativeOcrResult("
            + JSONObject.quote(requestId) + ",false," + JSONObject.quote(message) + ");";
        activity.runOnUiThread(() -> webView.evaluateJavascript(javascript, null));
    }

    private static String safeMessage(Throwable error) {
        if (error == null) return "未知错误";
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
    }
}
