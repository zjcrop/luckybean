package com.luckybean.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/** Pure Java identity for generated speech; independent of Android playback. */
final class BrewSpeechCacheKey {
    static final String REVISION = "brew-speech-v2";

    private BrewSpeechCacheKey() { }

    static String create(String text, String voiceName, String languageTag, String engineName, float speechRate, float pitch) {
        String[] fields = { REVISION, text, voiceName, languageTag, engineName, Float.toString(speechRate), Float.toString(pitch) };
        StringBuilder identity = new StringBuilder();
        for (String field : fields) {
            String value = field == null ? "" : field;
            identity.append(value.length()).append(':').append(value);
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(identity.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte value : digest) hex.append(String.format(Locale.ROOT, "%02x", value & 0xff));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is required for speech caching", error);
        }
    }
}
