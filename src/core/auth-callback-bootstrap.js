(() => {
  const hash = String(globalThis.location?.hash || '');
  if (!hash || hash === '#') return;
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (!params.has('access_token') && !params.has('refresh_token') && !params.has('error') && !params.has('error_code')) return;
    globalThis.__LuckyBeanInitialAuthCallbackHash = hash;
    document.documentElement.dataset.authCallbackSnapshot = 'captured';
  } catch {
    // Leave the original hash untouched. The auth service will parse location.hash normally.
  }
})();