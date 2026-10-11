package com.luckybean.app.storage;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

@Database(entities = {StoredRecord.class}, version = 1, exportSchema = true)
public abstract class LuckyBeanRoomDatabase extends RoomDatabase {
    private static volatile LuckyBeanRoomDatabase instance;

    public abstract StoredRecordDao records();

    public static LuckyBeanRoomDatabase getInstance(@NonNull Context context) {
        LuckyBeanRoomDatabase current = instance;
        if (current != null) return current;
        synchronized (LuckyBeanRoomDatabase.class) {
            current = instance;
            if (current == null) {
                current = Room.databaseBuilder(
                    context.getApplicationContext(),
                    LuckyBeanRoomDatabase.class,
                    "luckybean-room.db"
                ).build();
                instance = current;
            }
        }
        return current;
    }
}
