package com.luckybean.app.data;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.Index;

@Entity(
    tableName = "migration_records",
    primaryKeys = {"migrationId", "storeName", "recordId"},
    indices = {@Index("migrationId"), @Index(value = {"migrationId", "storeName"})}
)
public final class MigrationRecord {
    @NonNull public String migrationId = "";
    @NonNull public String storeName = "";
    @NonNull public String recordId = "";
    @NonNull public String json = "{}";
    @NonNull public String contentHash = "";

    public MigrationRecord() {}
}
