package com.luckybean.app.data;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;

import java.util.List;

@Dao
public interface LuckyBeanDao {
    @Query("SELECT * FROM native_records WHERE storeName = :storeName ORDER BY recordId")
    List<NativeRecord> all(String storeName);

    @Query("SELECT * FROM native_records WHERE storeName = :storeName AND recordId = :recordId LIMIT 1")
    NativeRecord get(String storeName, String recordId);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void put(NativeRecord value);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void putAll(List<NativeRecord> values);

    @Query("DELETE FROM native_records WHERE storeName = :storeName AND recordId = :recordId")
    void remove(String storeName, String recordId);

    @Query("DELETE FROM native_records WHERE storeName = :storeName")
    void clearStore(String storeName);

    @Query("DELETE FROM native_records")
    void clearAllRecords();

    @Query("SELECT COUNT(*) FROM native_records WHERE storeName = :storeName")
    int count(String storeName);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void stage(MigrationRecord value);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void stageAll(List<MigrationRecord> values);

    @Query("SELECT * FROM migration_records WHERE migrationId = :migrationId ORDER BY storeName, recordId")
    List<MigrationRecord> staged(String migrationId);

    @Query("SELECT * FROM migration_records WHERE migrationId = :migrationId AND storeName = :storeName ORDER BY recordId")
    List<MigrationRecord> stagedStore(String migrationId, String storeName);

    @Query("SELECT COUNT(*) FROM migration_records WHERE migrationId = :migrationId AND storeName = :storeName")
    int stagedCount(String migrationId, String storeName);

    @Query("DELETE FROM migration_records WHERE migrationId = :migrationId")
    void clearStaging(String migrationId);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void putMigrationState(MigrationState state);

    @Query("SELECT * FROM migration_states WHERE migrationId = :migrationId LIMIT 1")
    MigrationState migrationState(String migrationId);

    @Query("SELECT * FROM migration_states ORDER BY startedAt DESC")
    List<MigrationState> migrationStates();
}
