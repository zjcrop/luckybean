(() => {
  const hash = String(globalThis.location?.hash || '');
  if (!hash || hash === '#') return;

  let relevant = false;
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    relevant = params.has('access_token') || params.has('refresh_token') || params.has('error') || params.has('error_code');
  } catch {
    return;
  }
  if (!relevant) return;

  globalThis.__LuckyBeanInitialAuthCallbackHash = hash;
  document.documentElement.dataset.authCallbackSnapshot = 'captured';

  const originalReplaceState = history.replaceState.bind(history);
  let released = false;

  const restoreSnapshot = () => {
    if (released || globalThis.LuckyBeanCloudAuth) return;
    if (!location.hash) {
      try { originalReplaceState(history.state, document.title, `${location.pathname}${location.search}${hash}`); } catch {}
    }
  };

  history.replaceState = function guardedReplaceState(state, title, url) {
    if (!released && !globalThis.LuckyBeanCloudAuth && url != null) {
      const next = String(url);
      if (!next.includes('#')) return originalReplaceState(state, title, `${next}${hash}`);
    }
    return originalReplaceState(state, title, url);
  };

  const releaseWhenReady = () => {
    if (globalThis.LuckyBeanCloudAuth) {
      released = true;
      history.replaceState = originalReplaceState;
      try { delete globalThis.__LuckyBeanInitialAuthCallbackHash; } catch { globalThis.__LuckyBeanInitialAuthCallbackHash = ''; }
      document.documentElement.dataset.authCallbackSnapshot = 'consumed';
      return;
    }
    restoreSnapshot();
    setTimeout(releaseWhenReady, 0);
  };

  setTimeout(releaseWhenReady, 0);
})();