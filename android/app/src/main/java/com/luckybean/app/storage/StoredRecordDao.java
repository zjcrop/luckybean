package com.luckybean.app.storage;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;

import java.util.List;

@Dao
public interface StoredRecordDao {
    @Query("SELECT * FROM records WHERE storeName = :storeName AND recordId = :recordId LIMIT 1")
    StoredRecord find(String storeName, String recordId);

    @Query("SELECT * FROM records WHERE storeName = :storeName ORDER BY recordId")
    List<StoredRecord> all(String storeName);

    @Query("SELECT * FROM records WHERE storeName = :storeName AND beanId = :beanId ORDER BY createdAt, recordId")
    List<StoredRecord> byBean(String storeName, String beanId);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void upsert(StoredRecord row);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void upsertAll(List<StoredRecord> rows);

    @Query("DELETE FROM records WHERE storeName = :storeName")
    void deleteStore(String storeName);

    @Query("DELETE FROM records")
    void deleteAll();
}
