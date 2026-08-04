package com.luckybean.app.data;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

public final class CanonicalJson {
    private CanonicalJson() {}

    public static String stringify(Object value) throws JSONException {
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            List<String> keys = new ArrayList<>();
            Iterator<String> iterator = object.keys();
            while (iterator.hasNext()) keys.add(iterator.next());
            Collections.sort(keys);
            StringBuilder result = new StringBuilder("{");
            for (int i = 0; i < keys.size(); i++) {
                if (i > 0) result.append(',');
                String key = keys.get(i);
                result.append(JSONObject.quote(key));
                result.append(':');
                result.append(stringify(object.opt(key)));
            }
            return result.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder result = new StringBuilder("[");
            for (int i = 0; i < array.length(); i++) {
                if (i > 0) result.append(',');
                result.append(stringify(array.opt(i)));
            }
            return result.append(']').toString();
        }
        if (value instanceof Number) return JSONObject.numberToString((Number) value);
        if (value instanceof Boolean) return Boolean.TRUE.equals(value) ? "true" : "false";
        return JSONObject.quote(String.valueOf(value));
    }

    public static String normalize(String json) throws JSONException {
        String trimmed = json == null ? "null" : json.trim();
        if (trimmed.startsWith("{")) return stringify(new JSONObject(trimmed));
        if (trimmed.startsWith("[")) return stringify(new JSONArray(trimmed));
        return stringify(trimmed);
    }

    public static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte item : bytes) result.append(String.format("%02x", item & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }
}
