package com.luckybean.app.data;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "migration_states")
public final class MigrationState {
    @PrimaryKey
    @NonNull public String migrationId = "";
    @NonNull public String sourceDatabase = "";
    public int sourceVersion = 0;
    public int targetSchemaVersion = 3;
    @NonNull public String status = "pending";
    @NonNull public String startedAt = "";
    @NonNull public String completedAt = "";
    @NonNull public String reportJson = "{}";
    @NonNull public String snapshotPath = "";

    public MigrationState() {}
}
