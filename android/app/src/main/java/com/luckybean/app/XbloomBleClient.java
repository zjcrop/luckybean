package com.luckybean.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothStatusCodes;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;

import java.util.Collections;
import java.util.UUID;

final class XbloomBleClient {
    interface Listener {
        void onConnected(String requestId, String deviceName);
        void onConnectFailed(String requestId, String message);
        void onWriteComplete(String requestId);
        void onWriteFailed(String requestId, String message);
        void onNotification(byte[] value);
        void onDisconnected();
    }

    private static final UUID SERVICE_UUID = UUID.fromString("0000e0ff-3c17-d293-8e48-14fe2e4da212");
    private static final UUID TX_UUID = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb");
    private static final UUID RX_UUID = UUID.fromString("0000ffe2-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private final Context context;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic tx;
    private BluetoothGattCharacteristic rx;
    private String connectRequestId = "";
    private int negotiatedMtu = 23;
    private boolean connected;
    private boolean servicesDiscoveryStarted;

    XbloomBleClient(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    void scanAndConnect(String requestId) {
        disconnect(false);
        connectRequestId = requestId == null ? "" : requestId;
        negotiatedMtu = 23;
        servicesDiscoveryStarted = false;
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            listener.onConnectFailed(connectRequestId, "此设备没有开启蓝牙");
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            listener.onConnectFailed(connectRequestId, "系统 BLE 扫描器不可用");
            return;
        }
        try {
            ScanFilter filter = new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE_UUID)).build();
            scanner.startScan(Collections.singletonList(filter),
                new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback);
            handler.postDelayed(() -> {
                if (gatt == null && !connected) failConnect("15 秒内没有发现 xBloom 设备，请唤醒机器并断开官方 App");
            }, 15000);
        } catch (SecurityException error) {
            listener.onConnectFailed(connectRequestId, "缺少蓝牙扫描权限");
        } catch (Exception error) {
            listener.onConnectFailed(connectRequestId, safeMessage(error, "启动蓝牙扫描失败"));
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override public void onScanResult(int callbackType, ScanResult result) {
            if (gatt != null || connected || result == null || result.getDevice() == null) return;
            stopScan();
            try {
                gatt = result.getDevice().connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
                if (gatt == null) failConnect("无法启动 xBloom BLE 连接");
            } catch (SecurityException error) {
                failConnect("缺少蓝牙连接权限");
            } catch (Exception error) {
                failConnect(safeMessage(error, "连接 xBloom 失败"));
            }
        }

        @Override public void onScanFailed(int errorCode) {
            failConnect("xBloom 扫描失败，系统错误码 " + errorCode);
        }
    };

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt source, int status, int newState) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failConnect("xBloom BLE 连接失败，状态码 " + status);
                return;
            }
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                try {
                    source.requestMtu(247);
                } catch (SecurityException ignored) {
                    // Service discovery below still provides a useful error if permissions changed.
                }
                handler.postDelayed(() -> {
                    if (!connected && gatt == source) discoverServices(source);
                }, 650);
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                boolean wasConnected = connected;
                connected = false;
                tx = null;
                rx = null;
                closeGatt(source);
                if (!wasConnected) listener.onConnectFailed(connectRequestId, "xBloom 在建立服务前断开了连接");
                else listener.onDisconnected();
            }
        }

        @Override public void onMtuChanged(BluetoothGatt source, int mtu, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) negotiatedMtu = mtu;
            discoverServices(source);
        }

        @Override public void onServicesDiscovered(BluetoothGatt source, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failConnect("读取 xBloom 蓝牙服务失败");
                return;
            }
            try {
                android.bluetooth.BluetoothGattService service = source.getService(SERVICE_UUID);
                tx = service == null ? null : service.getCharacteristic(TX_UUID);
                rx = service == null ? null : service.getCharacteristic(RX_UUID);
                if (tx == null || rx == null) {
                    failConnect("发现的设备没有 xBloom 配方蓝牙通道");
                    return;
                }
                if (!source.setCharacteristicNotification(rx, true)) {
                    failConnect("无法订阅 xBloom 状态通知");
                    return;
                }
                BluetoothGattDescriptor descriptor = rx.getDescriptor(CCCD_UUID);
                if (descriptor == null) {
                    failConnect("xBloom 状态通知描述符缺失");
                    return;
                }
                boolean started;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    started = source.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                        == BluetoothStatusCodes.SUCCESS;
                } else {
                    descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    started = source.writeDescriptor(descriptor);
                }
                if (!started) failConnect("无法开启 xBloom 状态通知");
            } catch (SecurityException error) {
                failConnect("缺少蓝牙连接权限");
            } catch (Exception error) {
                failConnect(safeMessage(error, "初始化 xBloom 蓝牙服务失败"));
            }
        }

        @Override public void onDescriptorWrite(BluetoothGatt source, BluetoothGattDescriptor descriptor, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failConnect("开启 xBloom 状态通知失败");
                return;
            }
            finishConnection();
        }

        @Override public void onCharacteristicChanged(BluetoothGatt source, BluetoothGattCharacteristic characteristic) {
            byte[] value = characteristic.getValue();
            if (value != null && value.length > 0) listener.onNotification(value.clone());
        }

        @Override public void onCharacteristicChanged(BluetoothGatt source, BluetoothGattCharacteristic characteristic, byte[] value) {
            if (value != null && value.length > 0) listener.onNotification(value.clone());
        }
    };

    private void discoverServices(BluetoothGatt source) {
        if (source != gatt || connected || servicesDiscoveryStarted) return;
        try {
            servicesDiscoveryStarted = source.discoverServices();
            if (!servicesDiscoveryStarted) failConnect("无法读取 xBloom 蓝牙服务");
        } catch (SecurityException error) {
            failConnect("缺少蓝牙连接权限");
        }
    }

    void write(byte[] bytes, String requestId) {
        if (!connected || gatt == null || tx == null) {
            listener.onWriteFailed(requestId, "尚未连接 xBloom");
            return;
        }
        if (bytes == null || bytes.length == 0 || bytes.length > negotiatedMtu - 3) {
            listener.onWriteFailed(requestId, "配方帧超过当前 BLE MTU，请减少注水段数");
            return;
        }
        writeRaw(bytes, requestId);
    }

    private void writeRaw(byte[] bytes, String requestId) {
        if (gatt == null || tx == null) {
            listener.onWriteFailed(requestId, "尚未连接 xBloom");
            return;
        }
        try {
            boolean started;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                int result = gatt.writeCharacteristic(tx, bytes, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                started = result == BluetoothStatusCodes.SUCCESS;
            } else {
                tx.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                tx.setValue(bytes);
                started = gatt.writeCharacteristic(tx);
            }
            if (!started) {
                listener.onWriteFailed(requestId, "xBloom BLE 写入未能启动");
                return;
            }
            if (requestId != null && !requestId.isEmpty()) handler.postDelayed(() -> listener.onWriteComplete(requestId), 180);
        } catch (SecurityException error) {
            listener.onWriteFailed(requestId, "缺少蓝牙连接权限");
        } catch (Exception error) {
            listener.onWriteFailed(requestId, safeMessage(error, "xBloom BLE 写入失败"));
        }
    }

    private void finishConnection() {
        if (connected || gatt == null || rx == null) return;
        connected = true;
        String name = "xBloom";
        try {
            if (gatt.getDevice() != null && gatt.getDevice().getName() != null) name = gatt.getDevice().getName();
        } catch (SecurityException ignored) { }
        listener.onConnected(connectRequestId, name);
    }

    void disconnect() { disconnect(true); }

    private void disconnect(boolean notify) {
        stopScan();
        BluetoothGatt old = gatt;
        gatt = null;
        tx = null;
        rx = null;
        boolean wasConnected = connected;
        connected = false;
        if (old != null) {
            try { old.disconnect(); } catch (Exception ignored) { }
            closeGatt(old);
        }
        if (notify && wasConnected) listener.onDisconnected();
    }

    void close() { disconnect(false); }

    private void closeGatt(BluetoothGatt value) {
        try { value.close(); } catch (Exception ignored) { }
        if (gatt == value) gatt = null;
    }

    private void stopScan() {
        if (scanner == null) return;
        try { scanner.stopScan(scanCallback); } catch (Exception ignored) { }
        scanner = null;
    }

    private void failConnect(String message) {
        if (connected) return;
        String id = connectRequestId;
        disconnect(false);
        listener.onConnectFailed(id, message);
    }

    private static String safeMessage(Exception error, String fallback) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? fallback : message;
    }
}
