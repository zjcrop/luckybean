// Only the existing deterministic BrewProfiles contract may use this retry helper.
const allowedEndpoint = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/brew-analyze-v2';
let requestSequence = 0;

export async function fetchBrewContract(url, init = {}, {
  timeoutMs = 20000, attempts = 2, fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = text => console.log(text)
} = {}) {
  const target = new URL(url);
  if (target.origin + target.pathname !== allowedEndpoint || target.username || target.password) {
    throw new Error('BrewProfiles gate refuses an unrelated endpoint');
  }
  const method = (init.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'OPTIONS'].includes(method)) throw new Error('Unsupported contract request method');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Error('Invalid retry limit');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid request deadline');
  const label = '[brew-request ' + (++requestSequence) + '] ' + method + ' brew-analyze-v2';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    let timer;
    log(label + ' start attempt=' + attempt);
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(label + ' deadline exceeded after ' + timeoutMs + 'ms');
          error.name = 'TimeoutError';
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      });
      const response = await Promise.race([(async () => {
        const result = await fetchImpl(target, { ...init, method, signal: controller.signal });
        const bytes = await result.arrayBuffer();
        // Retain status/headers and all original caller assertions, including expected 400/401/204.
        return new Response([204, 205, 304].includes(result.status) ? null : bytes, {
          status: result.status, statusText: result.statusText, headers: result.headers
        });
      })(), timeout]);
      log(label + ' HTTP=' + response.status + ' elapsedMs=' + (Date.now() - started));
      if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
        const seconds = Number(response.headers.get('retry-after'));
        clearTimeout(timer);
        await sleep(Math.min(seconds > 0 ? seconds * 1000 : attempt * 500, 5000));
        continue;
      }
      return response;
    } catch (error) {
      log(label + ' failure=' + error.name + ' elapsedMs=' + (Date.now() - started));
      const transient = ['AbortError', 'TimeoutError'].includes(error.name) || error instanceof TypeError;
      if (!transient || attempt === attempts) throw error;
    } finally { clearTimeout(timer); }
    await sleep(attempt * 500);
  }
}
