package com.luckybean.app.storage;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/** Narrow asynchronous bridge between the Web storage contract and Room. */
public final class RoomStoreBridge {
    private final WebView webView;
    private final RoomStoreRepository repository;

    public RoomStoreBridge(Context context, WebView webView) {
        this.webView = webView;
        this.repository = new RoomStoreRepository(context);
    }

    @JavascriptInterface
    public void request(String requestId, String requestJson) {
        final JSONObject request;
        try {
            request = new JSONObject(requestJson);
        } catch (JSONException error) {
            reject(requestId, "Invalid storage request");
            return;
        }

        String method = request.optString("method", "");
        String store = request.optString("store", "");
        CompletableFuture<?> operation;
        try {
            switch (method) {
                case "get":
                    operation = repository.get(store, request.getString("key"));
                    break;
                case "all":
                    operation = repository.all(store);
                    break;
                case "allByBean":
                    operation = repository.allByBean(store, request.getString("beanId"));
                    break;
                case "put":
                    operation = repository.put(store, request.getJSONObject("value"));
                    break;
                case "bulkPut":
                    operation = repository.bulkPut(store, request.getJSONArray("values"));
                    break;
                case "remove":
                    operation = repository.remove(store, request.getString("key"));
                    break;
                case "clear":
                    operation = repository.clear(store);
                    break;
                case "replaceStores":
                    operation = repository.replaceStores(readStores(request.getJSONObject("stores")));
                    break;
                case "clearAll":
                    operation = repository.clearAll();
                    break;
                default:
                    reject(requestId, "Unsupported storage method");
                    return;
            }
        } catch (Exception error) {
            reject(requestId, safeMessage(error));
            return;
        }

        operation.whenComplete((value, error) -> {
            if (error != null) {
                reject(requestId, safeMessage(error));
                return;
            }
            resolve(requestId, value);
        });
    }

    private static Map<String, JSONArray> readStores(JSONObject stores) throws JSONException {
        Map<String, JSONArray> result = new LinkedHashMap<>();
        Iterator<String> keys = stores.keys();
        while (keys.hasNext()) {
            String name = keys.next();
            result.put(name, stores.getJSONArray(name));
        }
        return result;
    }

    private void resolve(String requestId, Object value) {
        String encoded = value == null ? "null" : JSONObject.quote(value.toString());
        if (value instanceof JSONObject || value instanceof JSONArray) encoded = value.toString();
        String script = "globalThis.LuckyBeanStoreBridge&&globalThis.LuckyBeanStoreBridge.resolve("
            + JSONObject.quote(requestId == null ? "" : requestId) + "," + encoded + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void reject(String requestId, String message) {
        String script = "globalThis.LuckyBeanStoreBridge&&globalThis.LuckyBeanStoreBridge.reject("
            + JSONObject.quote(requestId == null ? "" : requestId) + ","
            + JSONObject.quote(message == null ? "Room storage operation failed" : message) + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private static String safeMessage(Throwable error) {
        Throwable cause = error.getCause() == null ? error : error.getCause();
        String message = cause.getMessage();
        return message == null || message.isEmpty() ? cause.getClass().getSimpleName() : message;
    }
}
