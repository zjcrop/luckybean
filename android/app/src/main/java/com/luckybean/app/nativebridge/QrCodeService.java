package com.luckybean.app.nativebridge;

import android.graphics.Bitmap;
import android.util.Base64;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.EnumMap;
import java.util.Map;

public final class QrCodeService {
    public JSONObject render(String text, int requestedSize) throws Exception {
        String value = text == null ? "" : text.trim();
        if (value.isEmpty()) throw new IllegalArgumentException("二维码内容不能为空");
        if (value.getBytes(StandardCharsets.UTF_8).length > 2950) {
            throw new IllegalArgumentException("二维码内容过长，请使用压缩分享格式");
        }
        int size = Math.max(192, Math.min(1024, requestedSize <= 0 ? 768 : requestedSize));
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
        hints.put(EncodeHintType.MARGIN, 2);

        BitMatrix matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, size, size, hints);
        int[] pixels = new int[size * size];
        for (int y = 0; y < size; y++) {
            int offset = y * size;
            for (int x = 0; x < size; x++) pixels[offset + x] = matrix.get(x, y) ? 0xff000000 : 0xffffffff;
        }
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        bitmap.setPixels(pixels, 0, size, 0, 0, size, size);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try {
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                throw new IllegalStateException("二维码图片编码失败");
            }
        } finally {
            bitmap.recycle();
        }
        byte[] png = output.toByteArray();
        return new JSONObject()
            .put("dataUrl", "data:image/png;base64," + Base64.encodeToString(png, Base64.NO_WRAP))
            .put("bytes", png.length)
            .put("size", size)
            .put("sha256", sha256(value));
    }

    private static String sha256(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(digest.length * 2);
        for (byte item : digest) result.append(String.format("%02x", item & 0xff));
        return result.toString();
    }
}
