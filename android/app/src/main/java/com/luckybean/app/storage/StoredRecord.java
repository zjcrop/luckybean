package com.luckybean.app.storage;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.Index;

@Entity(
    tableName = "records",
    primaryKeys = {"storeName", "recordId"},
    indices = {
        @Index(value = {"storeName", "beanId", "createdAt"}),
        @Index(value = {"storeName", "createdAt"})
    }
)
public final class StoredRecord {
    @NonNull public String storeName;
    @NonNull public String recordId;
    public String beanId;
    public String createdAt;
    @NonNull public String payloadJson;

    public StoredRecord(@NonNull String storeName, @NonNull String recordId,
                        String beanId, String createdAt, @NonNull String payloadJson) {
        this.storeName = storeName;
        this.recordId = recordId;
        this.beanId = beanId == null ? "" : beanId;
        this.createdAt = createdAt == null ? "" : createdAt;
        this.payloadJson = payloadJson;
    }
}
