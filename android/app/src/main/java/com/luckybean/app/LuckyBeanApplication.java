package com.luckybean.app;

import android.app.Application;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.tasks.Task;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

public final class LuckyBeanApplication extends Application {
    private static final String TAG = "LuckyBeanRecognition";
    private HandlerThread warmupThread;
    private Handler warmupHandler;
    private TextRecognizer chineseRecognizer;
    private TextRecognizer latinRecognizer;
    private int warmupAttempts;

    @Override
    public void onCreate() {
        super.onCreate();
        warmupThread = new HandlerThread("LuckyBean-OCR-Warmup", android.os.Process.THREAD_PRIORITY_BACKGROUND);
        warmupThread.start();
        warmupHandler = new Handler(warmupThread.getLooper());
        warmupHandler.postDelayed(this::warmRecognitionRuntime, 450L);
    }

    private synchronized void ensureRecognitionClients() {
        if (chineseRecognizer == null) chineseRecognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        if (latinRecognizer == null) latinRecognizer = TextRecognition.getClient(new TextRecognizerOptions.Builder().build());
    }

    public TextRecognizer chineseRecognizer() {
        ensureRecognitionClients();
        return chineseRecognizer;
    }

    public TextRecognizer latinRecognizer() {
        ensureRecognitionClients();
        return latinRecognizer;
    }

    private void warmRecognitionRuntime() {
        warmupAttempts += 1;
        try {
            ensureRecognitionClients();
            final Bitmap bitmap = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(Color.WHITE);
            InputImage input = InputImage.fromBitmap(bitmap, 0);
            Task<Text> chineseTask = chineseRecognizer.process(input);
            Task<Text> latinTask = latinRecognizer.process(input);
            Tasks.whenAllComplete(chineseTask, latinTask)
                .addOnCompleteListener(ignored -> {
                    if (!bitmap.isRecycled()) bitmap.recycle();
                    if (chineseTask.isSuccessful() || latinTask.isSuccessful()) {
                        Log.i(TAG, "Shared bundled OCR runtime warmed in background");
                    } else if (warmupAttempts < 3 && warmupHandler != null) {
                        Log.w(TAG, "OCR warm-up incomplete; retrying without blocking the UI");
                        warmupHandler.postDelayed(this::warmRecognitionRuntime, 1600L * warmupAttempts);
                    }
                });
        } catch (Exception error) {
            Log.w(TAG, "OCR background warm-up failed", error);
            if (warmupAttempts < 3 && warmupHandler != null) {
                warmupHandler.postDelayed(this::warmRecognitionRuntime, 1600L * warmupAttempts);
            }
        }
    }

    @Override
    public void onTerminate() {
        if (chineseRecognizer != null) chineseRecognizer.close();
        if (latinRecognizer != null) latinRecognizer.close();
        warmupHandler = null;
        if (warmupThread != null) warmupThread.quitSafely();
        super.onTerminate();
    }
}
