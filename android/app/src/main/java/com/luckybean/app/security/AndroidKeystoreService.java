package com.luckybean.app.security;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public final class AndroidKeystoreService {
    public static final String FORMAT = "luckybean-android-keystore-aes-gcm-v1";
    private static final String PROVIDER = "AndroidKeyStore";
    private static final String ALIAS = "luckybean.core-v2.master.v1";
    private static final int TAG_BITS = 128;

    public JSONObject seal(String plaintext, String context) throws Exception {
        SecretKey key = getOrCreateKey();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] aad = normalizeContext(context).getBytes(StandardCharsets.UTF_8);
        cipher.updateAAD(aad);
        byte[] ciphertext = cipher.doFinal(String.valueOf(plaintext == null ? "" : plaintext).getBytes(StandardCharsets.UTF_8));
        return new JSONObject()
            .put("format", FORMAT)
            .put("keyAlias", ALIAS)
            .put("algorithm", "AES-GCM-256")
            .put("context", normalizeContext(context))
            .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
    }

    public String open(JSONObject envelope, String requestedContext) throws Exception {
        if (envelope == null || !FORMAT.equals(envelope.optString("format"))) {
            throw new SecurityException("不受支持的 Android 密文格式");
        }
        if (!ALIAS.equals(envelope.optString("keyAlias"))) {
            throw new SecurityException("密文密钥别名不匹配");
        }
        String storedContext = normalizeContext(envelope.optString("context", ""));
        String context = normalizeContext(requestedContext);
        if (!storedContext.equals(context)) throw new SecurityException("密文上下文不匹配");

        byte[] iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP);
        byte[] ciphertext = Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP);
        if (iv.length < 12 || iv.length > 16) throw new SecurityException("AES-GCM IV 长度无效");

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getExistingKey(), new GCMParameterSpec(TAG_BITS, iv));
        cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
        byte[] plaintext = cipher.doFinal(ciphertext);
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    public JSONObject status() throws Exception {
        KeyStore store = KeyStore.getInstance(PROVIDER);
        store.load(null);
        return new JSONObject()
            .put("provider", PROVIDER)
            .put("alias", ALIAS)
            .put("available", true)
            .put("keyPresent", store.containsAlias(ALIAS))
            .put("exportable", false)
            .put("algorithm", "AES-GCM-256");
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance(PROVIDER);
        store.load(null);
        if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
            ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build();
        generator.init(spec);
        return generator.generateKey();
    }

    private SecretKey getExistingKey() throws Exception {
        KeyStore store = KeyStore.getInstance(PROVIDER);
        store.load(null);
        KeyStore.Entry entry = store.getEntry(ALIAS, null);
        if (!(entry instanceof KeyStore.SecretKeyEntry)) {
            throw new SecurityException("Android Keystore 主密钥不存在，无法解密本设备密文");
        }
        return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
    }

    private static String normalizeContext(String value) {
        String context = String.valueOf(value == null ? "" : value).trim();
        return context.isEmpty() ? "luckybean.default" : context;
    }
}
