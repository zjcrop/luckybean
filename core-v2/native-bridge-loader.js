(() => {
  if (globalThis.LuckyBeanNative?.invoke) return;
  const runtime = globalThis.browser?.runtime;
  if (!runtime?.sendNativeMessage) return;
  const nativeApp = 'luckybean';
  const invoke = async (command, payload = {}) => {
    const response = await runtime.sendNativeMessage(nativeApp, {
      command,
      payload,
      requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    });
    if (!response || response.ok === false) {
      const error = new Error(response?.message || `Native command failed: ${command}`);
      error.code = response?.code || 'NATIVE_ERROR';
      error.details = response?.details || null;
      throw error;
    }
    return response;
  };
  globalThis.__LUCKYBEAN_ANDROID__ = true;
  globalThis.__LUCKYBEAN_NATIVE_ENGINE__ = 'geckoview';
  globalThis.__LUCKYBEAN_PUBLIC_URL__ = 'https://zjcrop.github.io/BrewIon/luckybean/core-v2/';
  globalThis.LuckyBeanNative = Object.freeze({ invoke });
})();
