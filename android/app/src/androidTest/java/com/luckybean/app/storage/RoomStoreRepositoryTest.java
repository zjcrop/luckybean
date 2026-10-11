package com.luckybean.app.storage;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

@RunWith(AndroidJUnit4.class)
public final class RoomStoreRepositoryTest {
    private Context context;
    private RoomStoreRepository repository;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        repository = new RoomStoreRepository(context);
        repository.clearAll().get(20, TimeUnit.SECONDS);
    }

    @Test
    public void preservesOpaqueRowsIndexesAndAtomicBeanProjectionWrites() throws Exception {
        JSONObject bean = new JSONObject()
            .put("id", "bean-1")
            .put("name", "Room · Geisha")
            .put("unknownNested", new JSONObject().put("source", "schema10").put("flags", new JSONArray().put("keep").put(7)));
        JSONObject summary = new JSONObject()
            .put("id", "bean-1")
            .put("displayName", "Room · Geisha")
            .put("remainingWeight", 155.5);
        repository.putBean(bean, summary).get(20, TimeUnit.SECONDS);

        JSONObject storedBean = repository.get("beans", "bean-1").get(20, TimeUnit.SECONDS);
        JSONObject storedSummary = repository.get("beanSummaries", "bean-1").get(20, TimeUnit.SECONDS);
        assertNotNull(storedBean);
        assertEquals(bean.toString(), storedBean.toString());
        assertEquals(summary.toString(), storedSummary.toString());

        JSONArray sensoryRows = new JSONArray().put(new JSONObject()
            .put("id", "sensory-1")
            .put("beanId", "bean-1")
            .put("createdAt", "2026-10-01T00:00:00.000Z")
            .put("storageFormat", "sensory-record/aes-gcm-v1")
            .put("ciphertext", "OPAQUE-SEALED-VALUE"));
        repository.bulkPut("sensoryRecords", sensoryRows).get(20, TimeUnit.SECONDS);
        assertEquals(1, repository.allByBean("sensoryRecords", "bean-1").get(20, TimeUnit.SECONDS).length());
        assertEquals("OPAQUE-SEALED-VALUE",
            repository.get("sensoryRecords", "sensory-1").get(20, TimeUnit.SECONDS).getString("ciphertext"));

        repository.put("syncOutbox", new JSONObject()
            .put("id", "outbox-1")
            .put("store", "beans")
            .put("payload", new JSONObject().put("unknown", "keep"))).get(20, TimeUnit.SECONDS);
        repository.put("migrationSnapshots", new JSONObject()
            .put("id", "manifest")
            .put("sourceSchemaVersion", 10)
            .put("format", "luckybean-indexeddb-snapshot/1")).get(20, TimeUnit.SECONDS);
        assertEquals(10, repository.get("migrationSnapshots", "manifest").get(20, TimeUnit.SECONDS).getInt("sourceSchemaVersion"));

        Map<String, JSONArray> invalidReplacement = new LinkedHashMap<>();
        invalidReplacement.put("beans", new JSONArray().put(new JSONObject().put("id", "bean-new")));
        invalidReplacement.put("customCodes", new JSONArray().put(new JSONObject().put("id", "missing-required-code")));
        try {
            repository.replaceStores(invalidReplacement).get(20, TimeUnit.SECONDS);
            throw new AssertionError("invalid key-path data must abort before changing Room rows");
        } catch (ExecutionException expected) {
            assertNotNull(expected.getCause());
        }
        assertEquals("Room · Geisha", repository.get("beans", "bean-1").get(20, TimeUnit.SECONDS).getString("name"));
        assertNull(repository.get("beans", "bean-new").get(20, TimeUnit.SECONDS));

        repository.removeBean("bean-1").get(20, TimeUnit.SECONDS);
        assertNull(repository.get("beans", "bean-1").get(20, TimeUnit.SECONDS));
        assertNull(repository.get("beanSummaries", "bean-1").get(20, TimeUnit.SECONDS));
    }
    @Test
    public void sharedGoldenFixturePreservesEveryStoreAndOrdering() throws Exception {
        JSONObject fixture;
        try (java.io.InputStream input = context.getAssets().open("web-cache/contracts/fixtures/core-store-golden.v1.json")) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int length;
            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
            fixture = new JSONObject(output.toString("UTF-8"));
        }
        JSONObject stores = fixture.getJSONObject("stores");
        java.util.Iterator<String> names = stores.keys();
        while (names.hasNext()) {
            String name = names.next();
            JSONArray rows = stores.getJSONArray(name);
            repository.bulkPut(name, rows).get(20, TimeUnit.SECONDS);
            assertEquals(rows.length(), repository.all(name).get(20, TimeUnit.SECONDS).length());
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = rows.getJSONObject(index);
                String key = row.getString("customCodes".equals(name) ? "code" : "id");
                assertEquals(row.toString(), repository.get(name, key).get(20, TimeUnit.SECONDS).toString());
            }
        }
        JSONArray byBean = repository.allByBean("brewSessions", "golden-bean").get(20, TimeUnit.SECONDS);
        JSONArray expected = fixture.getJSONArray("byBeanExpected");
        assertEquals(expected.length(), byBean.length());
        for (int index = 0; index < expected.length(); index++) assertEquals(expected.getString(index), byBean.getJSONObject(index).getString("id"));
    }

}
