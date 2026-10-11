package com.luckybean.app.storage;

import android.content.Context;

import androidx.annotation.NonNull;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Async Room-backed record store. Payload JSON is stored verbatim; indexing columns are
 * projections only and are never written back into the canonical payload.
 */
public final class RoomStoreRepository {
    private static final Set<String> STORES = new HashSet<>(Arrays.asList(
        "beans", "beanSummaries", "brewSessions", "sensoryRecords", "inventoryEvents",
        "settings", "customCodes", "codebookCache", "syncMetadata", "shareDrafts",
        "historyRevisions", "recycleBin", "syncOutbox", "migrationSnapshots", "beanThumbnails", "platformPreferences"
    ));

    private final LuckyBeanRoomDatabase database;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "LuckyBean-RoomStore");
        thread.setPriority(Thread.NORM_PRIORITY - 1);
        return thread;
    });

    public RoomStoreRepository(@NonNull Context context) {
        database = LuckyBeanRoomDatabase.getInstance(context);
    }

    public CompletableFuture<JSONObject> get(String store, String key) {
        return submit(() -> {
            StoredRecord row = database.records().find(requireStore(store), key);
            return row == null ? null : new JSONObject(row.payloadJson);
        });
    }

    public CompletableFuture<JSONArray> all(String store) {
        return submit(() -> encode(database.records().all(requireStore(store))));
    }

    public CompletableFuture<JSONArray> allByBean(String store, String beanId) {
        return submit(() -> encode(database.records().byBean(requireStore(store), beanId)));
    }

    public CompletableFuture<Void> put(String store, JSONObject value) {
        return submit(() -> {
            database.records().upsert(toRow(requireStore(store), value));
            return null;
        });
    }

    public CompletableFuture<Void> putBean(JSONObject bean, JSONObject summary) {
        return submit(() -> {
            StoredRecord beanRow = toRow("beans", bean);
            StoredRecord summaryRow = toRow("beanSummaries", summary);
            database.runInTransaction(() -> {
                database.records().upsert(beanRow);
                database.records().upsert(summaryRow);
            });
            return null;
        });
    }

    public CompletableFuture<Void> bulkPutBeans(JSONArray beans, JSONArray summaries) {
        return submit(() -> {
            List<StoredRecord> beanRows = decodeRows("beans", beans);
            List<StoredRecord> summaryRows = decodeRows("beanSummaries", summaries);
            database.runInTransaction(() -> {
                database.records().upsertAll(beanRows);
                database.records().upsertAll(summaryRows);
            });
            return null;
        });
    }

    public CompletableFuture<Void> removeBean(String key) {
        return submit(() -> {
            database.runInTransaction(() -> {
                database.records().deleteStoreRecord("beans", key);
                database.records().deleteStoreRecord("beanSummaries", key);
            });
            return null;
        });
    }

    public CompletableFuture<Void> clearBeans() {
        return submit(() -> {
            database.runInTransaction(() -> {
                database.records().deleteStore("beans");
                database.records().deleteStore("beanSummaries");
            });
            return null;
        });
    }

    public CompletableFuture<Void> bulkPut(String store, JSONArray values) {
        return submit(() -> {
            String checkedStore = requireStore(store);
            List<StoredRecord> rows = decodeRows(checkedStore, values);
            database.runInTransaction(() -> database.records().upsertAll(rows));
            return null;
        });
    }

    public CompletableFuture<Void> remove(String store, String key) {
        return submit(() -> {
            database.runInTransaction(() -> database.records().deleteStoreRecord(requireStore(store), key));
            return null;
        });
    }

    public CompletableFuture<Void> clear(String store) {
        return submit(() -> {
            database.records().deleteStore(requireStore(store));
            return null;
        });
    }

    public CompletableFuture<Void> replaceStores(Map<String, JSONArray> stores) {
        return submit(() -> {
            Map<String, List<StoredRecord>> prepared = new LinkedHashMap<>();
            for (Map.Entry<String, JSONArray> entry : stores.entrySet()) {
                prepared.put(requireStore(entry.getKey()), decodeRows(entry.getKey(), entry.getValue()));
            }
            database.runInTransaction(() -> {
                for (Map.Entry<String, List<StoredRecord>> entry : prepared.entrySet()) {
                    database.records().deleteStore(entry.getKey());
                    database.records().upsertAll(entry.getValue());
                }
            });
            return null;
        });
    }

    public CompletableFuture<Void> applyChanges(JSONObject changes) {
        return submit(() -> {
            List<String> clearStores = readStringArray(changes.optJSONArray("clearStores"));
            JSONArray deletes = changes.optJSONArray("deletes");
            JSONArray puts = changes.optJSONArray("puts");
            List<String[]> deleteRows = new ArrayList<>();
            List<StoredRecord> putRows = new ArrayList<>();
            if (deletes != null) {
                for (int i = 0; i < deletes.length(); i++) {
                    JSONObject row = deletes.getJSONObject(i);
                    deleteRows.add(new String[] { requireStore(row.getString("store")), row.getString("key") });
                }
            }
            if (puts != null) {
                for (int i = 0; i < puts.length(); i++) {
                    JSONObject row = puts.getJSONObject(i);
                    String store = requireStore(row.getString("store"));
                    putRows.add(toRow(store, row.getJSONObject("value")));
                }
            }
            database.runInTransaction(() -> {
                for (String store : clearStores) database.records().deleteStore(requireStore(store));
                for (String[] row : deleteRows) database.records().deleteStoreRecord(row[0], row[1]);
                database.records().upsertAll(putRows);
            });
            return null;
        });
    }

    private static List<String> readStringArray(JSONArray values) throws JSONException {
        List<String> result = new ArrayList<>();
        if (values == null) return result;
        for (int i = 0; i < values.length(); i++) result.add(values.getString(i));
        return result;
    }

    public CompletableFuture<Void> clearAll() {
        return submit(() -> {
            database.records().deleteAll();
            return null;
        });
    }

    private <T> CompletableFuture<T> submit(ThrowingSupplier<T> action) {
        CompletableFuture<T> result = new CompletableFuture<>();
        executor.execute(() -> {
            try {
                result.complete(action.get());
            } catch (Throwable error) {
                result.completeExceptionally(error);
            }
        });
        return result;
    }

    private static String requireStore(String store) {
        if (!STORES.contains(store)) throw new IllegalArgumentException("Unknown LuckyBean store: " + store);
        return store;
    }

    private static String keyFor(String store, JSONObject value) throws JSONException {
        String field = "customCodes".equals(store) ? "code" : "id";
        String key = value.optString(field, "");
        if (key.isEmpty()) throw new IllegalArgumentException(store + " record has no " + field);
        return key;
    }

    private static StoredRecord toRow(String store, JSONObject value) throws JSONException {
        String beanId = value.optString("beanId", "");
        String createdAt = value.optString("createdAt", value.optString("updatedAt", ""));
        return new StoredRecord(store, keyFor(store, value), beanId, createdAt, value.toString());
    }

    private static List<StoredRecord> decodeRows(String store, JSONArray values) throws JSONException {
        List<StoredRecord> rows = new ArrayList<>(values.length());
        for (int i = 0; i < values.length(); i++) rows.add(toRow(store, values.getJSONObject(i)));
        return rows;
    }

    private static JSONArray encode(List<StoredRecord> rows) throws JSONException {
        JSONArray result = new JSONArray();
        for (StoredRecord row : rows) result.put(new JSONObject(row.payloadJson));
        return result;
    }

    @FunctionalInterface
    private interface ThrowingSupplier<T> {
        T get() throws Exception;
    }
}
