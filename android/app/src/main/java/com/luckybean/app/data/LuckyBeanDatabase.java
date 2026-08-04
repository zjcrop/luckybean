package com.luckybean.app.data;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

@Database(
    entities = {NativeRecord.class, MigrationRecord.class, MigrationState.class},
    version = 1,
    exportSchema = true
)
public abstract class LuckyBeanDatabase extends RoomDatabase {
    private static volatile LuckyBeanDatabase instance;

    public abstract LuckyBeanDao dao();

    public static LuckyBeanDatabase get(Context context) {
        LuckyBeanDatabase current = instance;
        if (current != null) return current;
        synchronized (LuckyBeanDatabase.class) {
            current = instance;
            if (current == null) {
                current = Room.databaseBuilder(
                    context.getApplicationContext(),
                    LuckyBeanDatabase.class,
                    "luckybean-core-v2.db"
                )
                .setJournalMode(JournalMode.WRITE_AHEAD_LOGGING)
                .build();
                instance = current;
            }
        }
        return current;
    }
}
