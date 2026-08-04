package com.luckybean.app.nativebridge;

import android.app.Activity;
import android.content.Intent;

import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.luckybean.app.data.CanonicalJson;
import com.luckybean.app.data.LuckyBeanDao;
import com.luckybean.app.data.LuckyBeanDatabase;
import com.luckybean.app.data.NativeRecord;
import com.luckybean.app.sync.CloudSyncWorker;

import org.json.JSONArray;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoResult;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class NativeCommandRouter {
    private static final Set<String> STORES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        "beans", "brewSessions", "sensoryRecords", "inventoryEvents", "settings",
        "customCodes", "codebookCache", "syncMetadata", "shareDrafts",
        "attachments", "syncOutbox", "syncTombstones", "schemaMetadata"
    )));

    private final Activity activity;
    private final LuckyBeanDao dao;
    private final NativeActivityBroker activityBroker;
    private final ExecutorService databaseExecutor = Executors.newSingleThreadExecutor();

    public NativeCommandRouter(Activity activity) {
        this.activity = activity;
        dao = LuckyBeanDatabase.get(activity).dao();
        activityBroker = new NativeActivityBroker(activity);
    }

    public GeckoResult<Object> handle(JSONObject request) {
        String command = request.optString("command", "");
        JSONObject payload = request.optJSONObject("payload");
        if (payload == null) payload = new JSONObject();

        try {
            switch (command) {
                case "capabilities":
                    return GeckoResult.fromValue(ok(capabilities()));
                case "storage.open":
                case "storage.all":
                case "storage.get":
                case "storage.put":
                case "storage.bulkPut":
                case "storage.remove":
                case "storage.clear":
                case "storage.clearAll":
                    return runDatabase(command, payload);
                case "files.saveText":
                    return wrap(activityBroker.saveText(
                        payload.optString("name", "luckybean-export.json"),
                        payload.optString("mimeType", "application/octet-stream"),
                        payload.optString("text", "")
                    ));
                case "files.openText":
                    return wrap(activityBroker.openText(payload.optJSONArray("mimeTypes")));
                case "ocr.pickImage":
                    return wrap(activityBroker.pickImageForOcr());
                case "camera.capture":
                    return wrap(activityBroker.captureImage());
                case "share.text":
                    return GeckoResult.fromValue(ok(shareText(payload)));
                case "sync.enqueue":
                    return GeckoResult.fromValue(ok(enqueueSync()));
                default:
                    return GeckoResult.fromValue(failure("UNKNOWN_COMMAND", "未知原生命令：" + command));
            }
        } catch (Exception error) {
            return GeckoResult.fromValue(failure("NATIVE_COMMAND_FAILED", error));
        }
    }

    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        activityBroker.onActivityResult(requestCode, resultCode, data);
    }

    public void destroy() {
        activityBroker.destroy();
        databaseExecutor.shutdownNow();
    }

    private GeckoResult<Object> runDatabase(String command, JSONObject payload) {
        GeckoResult<Object> result = new GeckoResult<>();
        databaseExecutor.execute(() -> {
            try {
                Object value;
                switch (command) {
                    case "storage.open": value = openStorage(); break;
                    case "storage.all": value = all(requireStore(payload)); break;
                    case "storage.get": value = get(requireStore(payload), required(payload, "key")); break;
                    case "storage.put": value = put(requireStore(payload), payload); break;
                    case "storage.bulkPut": value = bulkPut(requireStore(payload), payload); break;
                    case "storage.remove": value = remove(requireStore(payload), required(payload, "key")); break;
                    case "storage.clear": value = clear(requireStore(payload)); break;
                    case "storage.clearAll": value = clearAll(payload); break;
                    default: throw new IllegalArgumentException("未知数据库命令");
                }
                result.complete(ok(value));
            } catch (Exception error) {
                result.complete(failure("STORAGE_COMMAND_FAILED", error));
            }
        });
        return result;
    }

    private JSONObject capabilities() throws Exception {
        return new JSONObject()
            .put("platform", "android")
            .put("engine", "geckoview")
            .put("storage", "room")
            .put("schemaVersion", 3)
            .put("files", true)
            .put("cameraX", true)
            .put("ocr", new JSONObject()
                .put("bundled", true)
                .put("scripts", new JSONArray().put("latin").put("chinese")))
            .put("backgroundSync", true)
            .put("offlineCore", true);
    }

    private JSONObject openStorage() throws Exception {
        JSONObject counts = new JSONObject();
        for (String store : STORES) counts.put(store, dao.count(store));
        return new JSONObject().put("schemaVersion", 3).put("counts", counts);
    }

    private JSONArray all(String store) throws Exception {
        JSONArray values = new JSONArray();
        for (NativeRecord record : dao.all(store)) values.put(new JSONObject(record.json));
        return values;
    }

    private Object get(String store, String key) throws Exception {
        NativeRecord record = dao.get(store, key);
        return record == null ? JSONObject.NULL : new JSONObject(record.json);
    }

    private String put(String store, JSONObject payload) throws Exception {
        String key = required(payload, "key");
        JSONObject value = payload.getJSONObject("value");
        dao.put(makeRecord(store, key, value));
        return key;
    }

    private JSONObject bulkPut(String store, JSONObject payload) throws Exception {
        JSONArray input = payload.getJSONArray("records");
        List<NativeRecord> records = new ArrayList<>(input.length());
        for (int i = 0; i < input.length(); i++) {
            JSONObject wrapper = input.getJSONObject(i);
            records.add(makeRecord(store, required(wrapper, "key"), wrapper.getJSONObject("value")));
        }
        dao.putAll(records);
        return new JSONObject().put("written", records.size());
    }

    private JSONObject remove(String store, String key) throws Exception {
        dao.remove(store, key);
        return new JSONObject().put("removed", true);
    }

    private JSONObject clear(String store) throws Exception {
        dao.clearStore(store);
        return new JSONObject().put("cleared", store);
    }

    private JSONObject clearAll(JSONObject payload) throws Exception {
        if (!"DELETE_LOCAL_DATA".equals(payload.optString("confirmToken"))) {
            throw new SecurityException("清除全部本地数据需要明确确认令牌");
        }
        dao.clearAllRecords();
        return new JSONObject().put("cleared", true);
    }

    private NativeRecord makeRecord(String store, String key, JSONObject value) throws Exception {
        String canonical = CanonicalJson.stringify(value);
        NativeRecord record = new NativeRecord();
        record.storeName = store;
        record.recordId = key;
        record.json = canonical;
        record.updatedAt = Instant.now().toString();
        record.source = "core-v2";
        record.contentHash = CanonicalJson.sha256(canonical);
        return record;
    }

    private JSONObject shareText(JSONObject payload) throws Exception {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, payload.optString("title", "LuckyBean"));
        send.putExtra(Intent.EXTRA_TEXT, payload.optString("text", ""));
        activity.startActivity(Intent.createChooser(send, "分享 LuckyBean 内容"));
        return new JSONObject().put("opened", true);
    }

    private JSONObject enqueueSync() throws Exception {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CloudSyncWorker.class)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(activity).enqueue(request);
        return new JSONObject().put("workId", request.getId().toString());
    }

    private GeckoResult<Object> wrap(GeckoResult<Object> source) {
        GeckoResult<Object> wrapped = new GeckoResult<>();
        source.accept(
            value -> wrapped.complete(ok(value)),
            error -> wrapped.complete(failure("NATIVE_ACTIVITY_FAILED", error))
        );
        return wrapped;
    }

    private static String requireStore(JSONObject payload) {
        String store = payload.optString("store", "");
        if (!STORES.contains(store)) throw new IllegalArgumentException("未知数据表：" + store);
        return store;
    }

    private static String required(JSONObject payload, String key) {
        String value = payload.optString(key, "").trim();
        if (value.isEmpty()) throw new IllegalArgumentException("缺少字段：" + key);
        return value;
    }

    private static JSONObject ok(Object value) {
        try {
            return new JSONObject().put("ok", true).put("value", value == null ? JSONObject.NULL : value);
        } catch (Exception impossible) {
            return failure("SERIALIZATION_FAILED", impossible);
        }
    }

    private static JSONObject failure(String code, Throwable error) {
        return failure(code, error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
    }

    private static JSONObject failure(String code, String message) {
        try {
            return new JSONObject().put("ok", false).put("code", code).put("message", message);
        } catch (Exception impossible) {
            return new JSONObject();
        }
    }
}
