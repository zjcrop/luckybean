package com.luckybean.app;

import android.content.Context;
import android.content.Intent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.luckybean.app.storage.RoomStoreRepository;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class GeckoRuntimeTest {
    @Test public void loadsPackagedAppWithRoomWhileNetworkIsUnavailable() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        RoomStoreRepository store = new RoomStoreRepository(context);
        store.clearAll().get(20, TimeUnit.SECONDS);
        store.put("syncMetadata", new JSONObject().put("id", "native.storage.backend.v1").put("active", true).put("schemaVersion", 10)).get(20, TimeUnit.SECONDS);
        JSONObject fixture;
        try (java.io.InputStream input = context.getAssets().open("web-cache/contracts/fixtures/core-store-golden.v1.json")) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int length;
            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
            fixture = new JSONObject(output.toString("UTF-8"));
        }
        JSONObject rows = fixture.getJSONObject("stores");
        java.util.Iterator<String> names = rows.keys();
        while (names.hasNext()) {
            String name = names.next();
            store.bulkPut(name, rows.getJSONArray(name)).get(20, TimeUnit.SECONDS);
        }
        assertEquals(1, android.provider.Settings.Global.getInt(context.getContentResolver(), "airplane_mode_on", 0));
        store.put("platformPreferences", new JSONObject().put("id", "engineMigration").put("ready", true)).get(20, TimeUnit.SECONDS);
        AtomicReference<GeckoActivity> activity = new AtomicReference<>();
        try (ActivityScenario<GeckoActivity> scenario = ActivityScenario.launch(new Intent(context, GeckoActivity.class))) {
            scenario.onActivity(activity::set);
            long deadline = System.currentTimeMillis() + 90000;
            while (!activity.get().localAppReady && System.currentTimeMillis() < deadline) Thread.sleep(200);
            assertTrue("Gecko packaged app did not become ready: " + activity.get().startupFailure, activity.get().localAppReady);
            assertEquals("Golden bean", store.get("beans", "golden-bean").get(20, TimeUnit.SECONDS).getString("name"));
            assertNotNull("Page boot must write device identity through the Gecko→Room bridge",
                store.get("syncMetadata", "cloud.device.id.v3").get(20, TimeUnit.SECONDS));
            scenario.onActivity(GeckoActivity::runOfflineAcceptance);
            deadline = System.currentTimeMillis() + 30000;
            while (activity.get().acceptanceResult == null && (activity.get().acceptanceFailure == null || activity.get().acceptanceFailure.isEmpty())
                    && System.currentTimeMillis() < deadline) Thread.sleep(200);
            assertNotNull("Offline brew acceptance failed: " + activity.get().acceptanceFailure, activity.get().acceptanceResult);
            assertEquals(85, activity.get().acceptanceResult.getInt("remainingWeight"));
            assertEquals(85, store.get("beans", "golden-bean").get(20, TimeUnit.SECONDS).getInt("remainingWeight"));
            assertTrue(activity.get().acceptanceResult.getBoolean("duplicate"));
        }
    }
}
