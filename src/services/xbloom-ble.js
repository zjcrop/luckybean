import { buildXbloomLoadFrames, parseXbloomStatusNotification } from '../domain/brew/xbloom-profile.js';

const SERVICE_UUID = '0000e0ff-3c17-d293-8e48-14fe2e4da212';
const TX_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
const RX_UUID = '0000ffe2-0000-1000-8000-00805f9b34fb';
const nativePending = new Map();
let requestSequence = 0;
let webDevice = null;
let webTx = null;
let webRx = null;

function nextRequestId() {
  requestSequence += 1;
  return `xbloom-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function nativeCall(method, ...args) {
  const native = globalThis.LuckyBeanNative;
  if (typeof native?.[method] !== 'function') return Promise.reject(new Error('Android xBloom 蓝牙接口不可用，请更新 LuckyBean DS 安装包'));
  const requestId = nextRequestId();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      nativePending.delete(requestId);
      reject(new Error(method === 'connectXbloom' ? '连接 xBloom 超时' : 'xBloom 蓝牙写入超时'));
    }, method === 'connectXbloom' ? 30000 : 8000);
    nativePending.set(requestId, { resolve, reject, timeout });
    try { native[method](requestId, ...args); }
    catch (error) {
      clearTimeout(timeout);
      nativePending.delete(requestId);
      reject(error);
    }
  });
}

if (!globalThis.LuckyBeanNativeBluetooth) {
  globalThis.LuckyBeanNativeBluetooth = {
    resolve(requestId, value) {
      const entry = nativePending.get(String(requestId));
      if (!entry) return;
      clearTimeout(entry.timeout);
      nativePending.delete(String(requestId));
      entry.resolve(value);
    },
    reject(requestId, message) {
      const entry = nativePending.get(String(requestId));
      if (!entry) return;
      clearTimeout(entry.timeout);
      nativePending.delete(String(requestId));
      entry.reject(new Error(String(message || 'xBloom 蓝牙操作失败')));
    },
    notify(value) {
      try { document.dispatchEvent(new CustomEvent('luckybean:xbloom-notification', { detail: base64ToBytes(value) })); } catch { }
    },
    disconnected() {
      document.dispatchEvent(new CustomEvent('luckybean:xbloom-disconnected'));
    }
  };
}

function receiveWebNotification(event) {
  const value = event.target?.value;
  if (!value) return;
  document.dispatchEvent(new CustomEvent('luckybean:xbloom-notification', {
    detail: new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }));
}

export async function connectXbloom() {
  if (globalThis.__LUCKYBEAN_ANDROID__ && globalThis.LuckyBeanNative) {
    return { name: await nativeCall('connectXbloom'), native: true };
  }
  if (!globalThis.isSecureContext || !navigator.bluetooth?.requestDevice) {
    throw new Error('当前浏览器不支持 BLE 设备连接；iPhone Safari 无法使用网页蓝牙，请用 LuckyBean DS Android 版');
  }
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID]
  });
  if (!device?.gatt) throw new Error('所选设备不支持 GATT BLE');
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  webTx = await service.getCharacteristic(TX_UUID);
  webRx = await service.getCharacteristic(RX_UUID);
  await webRx.startNotifications();
  webRx.addEventListener('characteristicvaluechanged', receiveWebNotification);
  webDevice = device;
  webDevice.addEventListener('gattserverdisconnected', () => {
    webTx = null;
    webRx = null;
    document.dispatchEvent(new CustomEvent('luckybean:xbloom-disconnected'));
  }, { once: true });
  return { name: device.name || 'xBloom', native: false };
}

export async function writeXbloomFrame(bytes) {
  if (globalThis.__LUCKYBEAN_ANDROID__ && globalThis.LuckyBeanNative) {
    return nativeCall('writeXbloomFrame', bytesToBase64(bytes));
  }
  if (!webTx) throw new Error('尚未连接 xBloom');
  if (typeof webTx.writeValueWithoutResponse === 'function') await webTx.writeValueWithoutResponse(bytes);
  else await webTx.writeValue(bytes);
  await new Promise(resolve => setTimeout(resolve, 140));
}

export async function loadRecipeToXbloom(recipe) {
  const frames = buildXbloomLoadFrames(recipe);
  let armed = false;
  let resolveArmed;
  let rejectArmed;
  const armedStatus = new Promise((resolve, reject) => {
    resolveArmed = resolve;
    rejectArmed = reject;
  });
  const onNotification = event => {
    const status = parseXbloomStatusNotification(event.detail);
    if (status?.state === 0x1f && !armed) {
      armed = true;
      resolveArmed(status);
    }
  };
  document.addEventListener('luckybean:xbloom-notification', onNotification);
  const timeout = setTimeout(() => rejectArmed(new Error('设备未返回“配方已装载”状态；请确认机器固件、蓝牙连接及粉量/配方参数。')), 15000);
  try {
    await writeXbloomFrame(frames[0]);
    await new Promise(resolve => setTimeout(resolve, 500));
    await writeXbloomFrame(frames[1]);
    await new Promise(resolve => setTimeout(resolve, 2000));
    for (const frame of frames.slice(2)) {
      await writeXbloomFrame(frame);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    await armedStatus;
    return { frameCount: frames.length, armed: true, started: false };
  } finally {
    clearTimeout(timeout);
    document.removeEventListener('luckybean:xbloom-notification', onNotification);
  }
}

export async function disconnectXbloom() {
  if (globalThis.__LUCKYBEAN_ANDROID__ && globalThis.LuckyBeanNative) {
    globalThis.LuckyBeanNative.disconnectXbloom();
  }
  if (webDevice?.gatt?.connected) webDevice.gatt.disconnect();
  webDevice = null;
  webTx = null;
  webRx = null;
}
