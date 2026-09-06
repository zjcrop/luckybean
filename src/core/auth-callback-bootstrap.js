(() => {
  const hash = String(globalThis.location?.hash || '');
  if (!hash || hash === '#') return;
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (!params.has('access_token') && !params.has('refresh_token') && !params.has('error') && !params.has('error_code')) return;
    globalThis.__LuckyBeanInitialAuthCallbackHash = hash;
    const accessToken = params.get('access_token') || '';
    const refreshToken = params.get('refresh_token') || '';
    if (accessToken && refreshToken) {
      const expiresIn = Number(params.get('expires_in') || 3600);
      globalThis.__LuckyBeanInitialAuthCallbackSession = {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: params.get('token_type') || 'bearer',
        expires_in: expiresIn,
        expires_at: Math.floor(Date.now() / 1000) + Math.max(60, expiresIn),
        user: null
      };
      document.documentElement.dataset.authCallbackSnapshot = 'session-captured';
    } else {
      document.documentElement.dataset.authCallbackSnapshot = 'captured';
    }
  } catch {
    // Keep the original URL untouched; the auth module will fall back to location.hash.
  }
})();
