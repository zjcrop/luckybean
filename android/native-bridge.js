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
