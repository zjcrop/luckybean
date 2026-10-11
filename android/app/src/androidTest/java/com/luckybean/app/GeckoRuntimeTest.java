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
        store.putBean(new JSONObject().put("id", "gecko-fixture").put("name", "Offline Gecko Bean").put("remainingWeight", 180),
            new JSONObject().put("id", "gecko-fixture").put("name", "Offline Gecko Bean").put("displayName", "Offline Gecko Bean").put("remainingWeight", 180)).get(20, TimeUnit.SECONDS);
        store.put("platformPreferences", new JSONObject().put("id", "engineMigration").put("ready", true)).get(20, TimeUnit.SECONDS);
        AtomicReference<GeckoActivity> activity = new AtomicReference<>();
        try (ActivityScenario<GeckoActivity> scenario = ActivityScenario.launch(new Intent(context, GeckoActivity.class))) {
            scenario.onActivity(activity::set);
            long deadline = System.currentTimeMillis() + 90000;
            while (!activity.get().localAppReady && System.currentTimeMillis() < deadline) Thread.sleep(200);
            assertTrue("Gecko packaged app did not become ready: " + activity.get().startupFailure, activity.get().localAppReady);
            assertEquals("Offline Gecko Bean", store.get("beans", "gecko-fixture").get(20, TimeUnit.SECONDS).getString("name"));
            assertNotNull("Page boot must write device identity through the Gecko→Room bridge",
                store.get("syncMetadata", "cloud.device.id.v3").get(20, TimeUnit.SECONDS));
        }
    }
}
