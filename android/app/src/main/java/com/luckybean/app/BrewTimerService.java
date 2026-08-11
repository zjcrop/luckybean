package com.luckybean.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class BrewTimerService extends Service {
    public static final String ACTION_PREPARE = "com.luckybean.app.action.PREPARE_BREW";
    public static final String ACTION_START = "com.luckybean.app.action.START_BREW";
    public static final String ACTION_PAUSE = "com.luckybean.app.action.PAUSE_BREW";
    public static final String ACTION_RESUME = "com.luckybean.app.action.RESUME_BREW";
    public static final String ACTION_CANCEL = "com.luckybean.app.action.CANCEL_BREW";
    public static final String EXTRA_PAYLOAD = "brew_execution_payload";

    private static final String CHANNEL_ID = "luckybean_brew_execution";
    private static final int NOTIFICATION_ID = 23011;
    private static final long TICK_INTERVAL_MS = 50L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<SpeechEvent> speechEvents = new ArrayList<>();
    private final Set<String> firedEventIds = new HashSet<>();
    private final Map<String, File> preparedFiles = new HashMap<>();
    private final Map<String, SpeechEvent> synthesisQueue = new HashMap<>();

    private ExoPlayer player;
    private TextToSpeech textToSpeech;
    private boolean ttsReady = false;
    private boolean running = false;
    private boolean paused = false;
    private long startedElapsedMs = 0L;
    private long pauseStartedElapsedMs = 0L;
    private long pausedTotalMs = 0L;
    private long totalMs = 0L;
    private PowerManager.WakeLock cpuWakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean audioFocusHeld = false;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (!running) return;
            if (!paused) tickExecution();
            handler.postDelayed(this, TICK_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(C.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
            .build(), false);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        initializeTts();
    }

    private void initializeTts() {
        textToSpeech = new TextToSpeech(getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                ttsReady = false;
                return;
            }
            int language = textToSpeech.setLanguage(Locale.SIMPLIFIED_CHINESE);
            ttsReady = language != TextToSpeech.LANG_MISSING_DATA && language != TextToSpeech.LANG_NOT_SUPPORTED;
            textToSpeech.setSpeechRate(1.05f);
            textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) { }
                @Override public void onDone(String utteranceId) {
                    SpeechEvent event = synthesisQueue.remove(utteranceId);
                    if (event != null) {
                        File file = cacheFile(event.id);
                        if (file.isFile() && file.length() > 44) preparedFiles.put(event.id, file);
                    }
                }
                @Override public void onError(String utteranceId) { synthesisQueue.remove(utteranceId); }
                @Override public void onError(String utteranceId, int errorCode) { synthesisQueue.remove(utteranceId); }
            });
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_PREPARE.equals(action)) {
            parsePayload(intent.getStringExtra(EXTRA_PAYLOAD));
            prepareSpeechFiles();
            return START_NOT_STICKY;
        }
        if (ACTION_START.equals(action)) {
            String payload = intent.getStringExtra(EXTRA_PAYLOAD);
            if (payload != null && !payload.isEmpty()) parsePayload(payload);
            startExecution();
            return START_NOT_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) pauseExecution();
        else if (ACTION_RESUME.equals(action)) resumeExecution();
        else if (ACTION_CANCEL.equals(action)) stopExecution(true);
        return START_NOT_STICKY;
    }

    private void parsePayload(String payload) {
        if (payload == null || payload.isEmpty()) return;
        try {
            JSONObject root = new JSONObject(payload);
            JSONObject speech = root.optJSONObject("speech");
            JSONArray events = speech == null ? null : speech.optJSONArray("events");
            long parsedTotal = speech == null ? 0L : speech.optLong("totalMs", 0L);
            if (parsedTotal <= 0L) {
                JSONArray stages = root.optJSONArray("stages");
                if (stages != null && stages.length() > 0) parsedTotal = stages.optJSONObject(stages.length() - 1).optLong("endMs", 0L);
            }
            totalMs = Math.max(0L, parsedTotal);
            speechEvents.clear();
            firedEventIds.clear();
            if (events != null) {
                for (int i = 0; i < events.length(); i++) {
                    JSONObject event = events.optJSONObject(i);
                    if (event == null) continue;
                    String id = event.optString("id", "event-" + i);
                    long atMs = Math.max(0L, event.optLong("atMs", 0L));
                    long validWindowMs = Math.max(250L, event.optLong("validWindowMs", 3000L));
                    String text = event.optString("text", "").trim();
                    String fixedKey = event.optString("fixedKey", "").trim();
                    if (!text.isEmpty()) speechEvents.add(new SpeechEvent(id, atMs, validWindowMs, text, fixedKey));
                }
            }
            speechEvents.sort((a, b) -> Long.compare(a.atMs, b.atMs));
        } catch (Exception error) {
            android.util.Log.e("LuckyBeanBrew", "Invalid execution payload", error);
        }
    }

    private void prepareSpeechFiles() {
        if (!ttsReady || textToSpeech == null) {
            handler.postDelayed(this::prepareSpeechFiles, 180L);
            return;
        }
        File directory = new File(getCacheDir(), "brew-speech-v1");
        if (!directory.exists() && !directory.mkdirs()) return;
        for (SpeechEvent event : speechEvents) {
            if (rawResourceId(event.fixedKey) != 0) continue;
            File file = cacheFile(event.id);
            if (file.isFile() && file.length() > 44) {
                preparedFiles.put(event.id, file);
                continue;
            }
            String utteranceId = "prepare:" + event.id;
            synthesisQueue.put(utteranceId, event);
            Bundle params = new Bundle();
            int result = textToSpeech.synthesizeToFile(event.text, params, file, utteranceId);
            if (result != TextToSpeech.SUCCESS) synthesisQueue.remove(utteranceId);
        }
    }

    private File cacheFile(String eventId) {
        File directory = new File(getCacheDir(), "brew-speech-v1");
        if (!directory.exists()) directory.mkdirs();
        return new File(directory, eventId.replaceAll("[^A-Za-z0-9._-]", "_") + ".wav");
    }

    private int rawResourceId(String key) {
        if (key == null || key.isEmpty()) return 0;
        return getResources().getIdentifier(key, "raw", getPackageName());
    }

    private void startExecution() {
        if (speechEvents.isEmpty() && totalMs <= 0L) return;
        startForeground(NOTIFICATION_ID, buildNotification("冲煮计时进行中"));
        acquireCpuWakeLock();
        requestAudioFocus();
        running = true;
        paused = false;
        startedElapsedMs = SystemClock.elapsedRealtime();
        pausedTotalMs = 0L;
        pauseStartedElapsedMs = 0L;
        firedEventIds.clear();
        handler.removeCallbacks(ticker);
        handler.post(ticker);
    }

    private long elapsedMs() {
        long now = paused ? pauseStartedElapsedMs : SystemClock.elapsedRealtime();
        return Math.max(0L, now - startedElapsedMs - pausedTotalMs);
    }

    private void tickExecution() {
        long elapsed = elapsedMs();
        for (SpeechEvent event : speechEvents) {
            if (firedEventIds.contains(event.id) || elapsed < event.atMs) continue;
            firedEventIds.add(event.id);
            long lateness = elapsed - event.atMs;
            if (lateness <= event.validWindowMs) playSpeechEvent(event);
        }
        if (totalMs > 0 && elapsed >= totalMs + 6000L) stopExecution(false);
    }

    private void playSpeechEvent(SpeechEvent event) {
        if (!audioFocusHeld) requestAudioFocus();
        int resourceId = rawResourceId(event.fixedKey);
        if (resourceId != 0) {
            playUri(Uri.parse("android.resource://" + getPackageName() + "/" + resourceId));
            return;
        }
        File file = preparedFiles.get(event.id);
        if (file == null) {
            File candidate = cacheFile(event.id);
            if (candidate.isFile() && candidate.length() > 44) file = candidate;
        }
        if (file != null && file.isFile()) {
            playUri(Uri.fromFile(file));
            return;
        }
        if (ttsReady && textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.speak(event.text, TextToSpeech.QUEUE_FLUSH, null, "live:" + event.id);
        }
    }

    private void playUri(Uri uri) {
        try {
            if (textToSpeech != null) textToSpeech.stop();
            player.stop();
            player.clearMediaItems();
            player.setMediaItem(MediaItem.fromUri(uri));
            player.prepare();
            player.play();
        } catch (Exception error) {
            android.util.Log.w("LuckyBeanBrew", "Speech playback failed", error);
        }
    }

    private void pauseExecution() {
        if (!running || paused) return;
        paused = true;
        pauseStartedElapsedMs = SystemClock.elapsedRealtime();
        player.pause();
        if (textToSpeech != null) textToSpeech.stop();
        updateNotification("冲煮已暂停");
    }

    private void resumeExecution() {
        if (!running || !paused) return;
        pausedTotalMs += Math.max(0L, SystemClock.elapsedRealtime() - pauseStartedElapsedMs);
        pauseStartedElapsedMs = 0L;
        paused = false;
        updateNotification("冲煮计时进行中");
    }

    private void stopExecution(boolean userCancelled) {
        running = false;
        paused = false;
        handler.removeCallbacks(ticker);
        if (player != null) { player.stop(); player.clearMediaItems(); }
        if (textToSpeech != null) textToSpeech.stop();
        abandonAudioFocus();
        releaseCpuWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void requestAudioFocus() {
        if (audioManager == null || audioFocusHeld) return;
        android.media.AudioAttributes platformAttributes = new android.media.AudioAttributes.Builder()
            .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
        AudioManager.OnAudioFocusChangeListener listener = focusChange -> {
            if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                audioFocusHeld = true;
            } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                audioFocusHeld = false;
                if (player != null) { player.stop(); player.clearMediaItems(); }
                if (textToSpeech != null) textToSpeech.stop();
            } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                if (player != null) player.setVolume(0.25f);
            }
        };
        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(platformAttributes)
            .setOnAudioFocusChangeListener(listener, handler)
            .setAcceptsDelayedFocusGain(true)
            .setWillPauseWhenDucked(false)
            .build();
        int result = audioManager.requestAudioFocus(audioFocusRequest);
        audioFocusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager != null && audioFocusRequest != null) audioManager.abandonAudioFocusRequest(audioFocusRequest);
        audioFocusHeld = false;
    }

    private void acquireCpuWakeLock() {
        if (cpuWakeLock != null && cpuWakeLock.isHeld()) return;
        PowerManager manager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        cpuWakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LuckyBean:BrewExecution");
        cpuWakeLock.setReferenceCounted(false);
        cpuWakeLock.acquire(15 * 60 * 1000L);
    }

    private void releaseCpuWakeLock() {
        if (cpuWakeLock != null && cpuWakeLock.isHeld()) cpuWakeLock.release();
        cpuWakeLock = null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "冲煮计时", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("锁屏或切换应用后保持 LuckyBean 冲煮时间轴和语音提醒");
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder.setContentTitle("LuckyBean 小酌")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(pending)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        releaseCpuWakeLock();
        abandonAudioFocus();
        if (player != null) { player.release(); player = null; }
        if (textToSpeech != null) { textToSpeech.stop(); textToSpeech.shutdown(); textToSpeech = null; }
        super.onDestroy();
    }

    private static final class SpeechEvent {
        final String id;
        final long atMs;
        final long validWindowMs;
        final String text;
        final String fixedKey;
        SpeechEvent(String id, long atMs, long validWindowMs, String text, String fixedKey) {
            this.id = id; this.atMs = atMs; this.validWindowMs = validWindowMs; this.text = text; this.fixedKey = fixedKey;
        }
    }
}
