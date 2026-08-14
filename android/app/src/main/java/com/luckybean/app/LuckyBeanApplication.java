package com.luckybean.app;

import android.app.Application;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

public final class LuckyBeanApplication extends Application {
    private static final String TAG = "LuckyBeanRecognition";
    private HandlerThread warmupThread;
    private TextRecognizer chineseRecognizer;
    private TextRecognizer latinRecognizer;

    @Override
    public void onCreate() {
        super.onCreate();
        warmupThread = new HandlerThread("LuckyBean-OCR-Warmup", android.os.Process.THREAD_PRIORITY_BACKGROUND);
        warmupThread.start();
        new Handler(warmupThread.getLooper()).postDelayed(this::warmRecognitionRuntime, 450L);
    }

    private void warmRecognitionRuntime() {
        Bitmap bitmap = null;
        try {
            chineseRecognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
            latinRecognizer = TextRecognition.getClient(new TextRecognizerOptions.Builder().build());
            bitmap = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(Color.WHITE);
            InputImage input = InputImage.fromBitmap(bitmap, 0);
            Tasks.whenAllComplete(chineseRecognizer.process(input), latinRecognizer.process(input))
                .addOnCompleteListener(ignored -> Log.i(TAG, "Bundled OCR runtime warmed in background"));
        } catch (Exception error) {
            Log.w(TAG, "OCR background warm-up failed", error);
        } finally {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        }
    }
}
