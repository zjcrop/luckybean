globalThis.__LUCKYBEAN_ANDROID__ = true;
globalThis.__LUCKYBEAN_PUBLIC_URL__ = 'https://zjcrop.github.io/luckybean/';

(() => {
  const pending = new Map();
  let sequence = 0;

  function nextRequestId() {
    sequence += 1;
    return `ocr-${Date.now().toString(36)}-${sequence.toString(36)}`;
  }

  function recognizeImage(image) {
    const native = globalThis.LuckyBeanNative;
    if (typeof native?.recognizeImage !== 'function') {
      return Promise.reject(new Error('Android 本地 OCR 接口不可用'));
    }
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Android 本地 OCR 超时，请补拍清晰的局部照片'));
      }, 45000);
      pending.set(requestId, { resolve, reject, timeout });
      try {
        native.recognizeImage(requestId, String(image.id || ''), String(image.role || ''), String(image.dataUrl || ''));
      } catch (error) {
        clearTimeout(timeout);
        pending.delete(requestId);
        reject(error);
      }
    });
  }

  const storeRequests = new Map();
  let storeSequence = 0;

  function requestRoomStore(method, payload = {}) {
    const native = globalThis.LuckyBeanRoomNative;
    if (typeof native?.request !== 'function') {
      return Promise.reject(new Error('Android Room 存储接口不可用'));
    }
    storeSequence += 1;
    const requestId = `room-${Date.now().toString(36)}-${storeSequence.toString(36)}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        storeRequests.delete(requestId);
        reject(new Error('Android 本地数据操作超时'));
      }, 60000);
      storeRequests.set(requestId, {
        resolve(value) {
          clearTimeout(timeout);
          storeRequests.delete(requestId);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timeout);
          storeRequests.delete(requestId);
          reject(error);
        }
      });
      try {
        native.request(requestId, JSON.stringify({ method, ...payload }));
      } catch (error) {
        clearTimeout(timeout);
        storeRequests.delete(requestId);
        reject(error);
      }
    });
  }

  globalThis.LuckyBeanStoreBridge = {
    resolve(requestId, value) {
      storeRequests.get(String(requestId))?.resolve(value);
    },
    reject(requestId, message) {
      storeRequests.get(String(requestId))?.reject(new Error(String(message || 'Android 本地数据操作失败')));
    }
  };

  globalThis.LuckyBeanRoomStore = Object.freeze({
    get(store, key) { return requestRoomStore('get', { store, key: String(key) }); },
    all(store) { return requestRoomStore('all', { store }); },
    allByBean(store, beanId) { return requestRoomStore('allByBean', { store, beanId: String(beanId) }); },
    put(store, value) { return requestRoomStore('put', { store, value }); },
    putBean(value, summary) { return requestRoomStore('putBean', { value, summary }); },
    bulkPut(store, values) { return requestRoomStore('bulkPut', { store, values }); },
    bulkPutBeans(values, summaries) { return requestRoomStore('bulkPutBeans', { values, summaries }); },
    remove(store, key) { return requestRoomStore('remove', { store, key: String(key) }); },
    removeBean(key) { return requestRoomStore('removeBean', { key: String(key) }); },
    clear(store) { return requestRoomStore('clear', { store }); },
    clearBeans() { return requestRoomStore('clearBeans'); },
    replaceStores(stores) { return requestRoomStore('replaceStores', { stores }); },
    clearAll() { return requestRoomStore('clearAll'); }
  });

  globalThis.LuckyBeanNativeRecognition = {
    resolve(requestId, payload) {
      const entry = pending.get(String(requestId));
      if (!entry) return;
      clearTimeout(entry.timeout);
      pending.delete(String(requestId));
      entry.resolve(payload || {});
    },
    reject(requestId, message) {
      const entry = pending.get(String(requestId));
      if (!entry) return;
      clearTimeout(entry.timeout);
      pending.delete(String(requestId));
      entry.reject(new Error(String(message || 'Android 本地 OCR 失败')));
    }
  };

  globalThis.LuckyBeanRecognitionBridge = {
    engine: 'android-mlkit-bundled-16.0.1',
    async recognizeCoffeeBag(payload = {}) {
      const images = Array.isArray(payload.images) ? payload.images : [];
      if (!images.length) throw new Error('请先添加豆袋照片');
      const blocks = [];
      const texts = [];
      for (const image of images) {
        const result = await recognizeImage(image);
        if (Array.isArray(result?.blocks)) blocks.push(...result.blocks);
        if (result?.fullText) texts.push(result.fullText);
      }
      return {
        engine: 'android-mlkit-bundled-16.0.1',
        blocks,
        fullText: texts.join('\n\n')
      };
    }
  };
})();
