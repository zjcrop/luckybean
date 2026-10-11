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
    public interface ResultSink {
        void complete(String callback, String requestId, Object value);
    }
    private final ResultSink sink;
    private final RoomStoreRepository repository;

    public RoomStoreBridge(Context context, WebView webView) {
        this(context, (callback, requestId, value) -> {
            String encoded = value == null ? "null" : value instanceof JSONObject || value instanceof JSONArray
                ? value.toString() : JSONObject.quote(value.toString());
            String method = callback.endsWith("resolve") ? "resolve" : "reject";
            String script = "globalThis.LuckyBeanStoreBridge&&globalThis.LuckyBeanStoreBridge." + method + "("
                + JSONObject.quote(requestId == null ? "" : requestId) + "," + encoded + ");";
            webView.post(() -> webView.evaluateJavascript(script, null));
        });
    }

    public RoomStoreBridge(Context context, ResultSink sink) {
        this.sink = sink;
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
                case "putBean":
                    operation = repository.putBean(request.getJSONObject("value"), request.getJSONObject("summary"));
                    break;
                case "bulkPutBeans":
                    operation = repository.bulkPutBeans(request.getJSONArray("values"), request.getJSONArray("summaries"));
                    break;
                case "removeBean":
                    operation = repository.removeBean(request.getString("key"));
                    break;
                case "clearBeans":
                    operation = repository.clearBeans();
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
                case "applyChanges":
                    operation = repository.applyChanges(request.getJSONObject("changes"));
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
        sink.complete("store.resolve", requestId, value);
    }

    private void reject(String requestId, String message) {
        sink.complete("store.reject", requestId, message);
    }

    private static String safeMessage(Throwable error) {
        Throwable cause = error.getCause() == null ? error : error.getCause();
        String message = cause.getMessage();
        return message == null || message.isEmpty() ? cause.getClass().getSimpleName() : message;
    }
}
