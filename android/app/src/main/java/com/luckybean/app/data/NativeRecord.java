package com.luckybean.app.data;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.Index;

@Entity(
    tableName = "native_records",
    primaryKeys = {"storeName", "recordId"},
    indices = {@Index("storeName")}
)
public final class NativeRecord {
    @NonNull public String storeName = "";
    @NonNull public String recordId = "";
    @NonNull public String json = "{}";
    @NonNull public String updatedAt = "";
    @NonNull public String source = "";
    @NonNull public String contentHash = "";

    public NativeRecord() {}
}
