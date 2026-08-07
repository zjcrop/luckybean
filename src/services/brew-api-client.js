export const BREW_API_ENDPOINT = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/brew-analyze-v2';
export const BREW_API_PUBLIC_KEY = 'sb_publishable_MsB0RFoxxf5zJbbT9PPBjQ_WP7GBMMn';
export const BREW_API_CLIENT_VERSION = 'luckybean-brew-client/1.3.0';

const INSTALLATION_KEY = 'luckybean.installation.id.v1';
const INSTALLATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

export function getInstallationId() {
  let value = '';
  try { value = localStorage.getItem(INSTALLATION_KEY) || ''; } catch { /* storage unavailable */ }
  if (INSTALLATION_PATTERN.test(value)) return value;
  value = `lb-${crypto.randomUUID()}`;
  try { localStorage.setItem(INSTALLATION_KEY, value); } catch { /* storage unavailable */ }
  return value;
}

function endpointUrl(path = '', endpoint = BREW_API_ENDPOINT) {
  const base = String(endpoint || BREW_API_ENDPOINT).replace(/[?#].*$/, '').replace(/\/$/, '');
  if (!path) return base;
  return path.startsWith('?') ? `${base}${path}` : `${base}/${String(path).replace(/^\//, '')}`;
}

function requestError(payload, status) {
  const code = String(payload?.error || payload?.code || `HTTP_${status}`);
  const messageMap = {
    PUBLIC_CLIENT_KEY_REQUIRED: '专业冲煮服务拒绝了客户端标识。',
    INSTALLATION_ID_REQUIRED: '专业冲煮服务无法建立本机调用标识。',
    RATE_LIMITED: '专业冲煮服务调用过于频繁，请稍后再试。',
    PROFILE_CATALOG_EMPTY: 'BrewProfiles方案目录暂不可用。',
    SPATIAL_TARGETS_INCOMPLETE: '专业三维结果缺少完整靶向物质区域。',
    SPATIAL_TARGET_GEOMETRY_INVALID: '专业三维靶区几何数据无效。',
    ENGINE_REQUEST_FAILED: 'BrewProfiles计算引擎暂不可用。'
  };
  const error = new Error(messageMap[code] || payload?.message || `专业冲煮服务请求失败（HTTP ${status}）`);
  error.code = code;
  error.status = status;
  error.payload = payload;
  return error;
}

export async function brewApiJson(path = '', {
  method = 'GET',
  body,
  endpoint = BREW_API_ENDPOINT,
  timeoutMs = 10000,
  signal
} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  const timer = setTimeout(() => controller.abort('timeout'), Math.max(1500, Number(timeoutMs) || 10000));
  try {
    const response = await fetch(endpointUrl(path, endpoint), {
      method,
      headers: {
        accept: 'application/json',
        apikey: BREW_API_PUBLIC_KEY,
        'content-type': 'application/json',
        'x-client-info': BREW_API_CLIENT_VERSION,
        'x-installation-id': getInstallationId(),
        'x-request-id': crypto.randomUUID()
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: controller.signal
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) throw requestError(payload, response.status);
    if (!payload || typeof payload !== 'object') throw requestError({ error: 'INVALID_JSON_RESPONSE' }, 502);
    return { payload, response };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('专业冲煮服务连接超时。');
      timeout.code = 'NETWORK_TIMEOUT';
      throw timeout;
    }
    if (error instanceof TypeError) {
      const network = new Error('无法连接BrewProfiles专业冲煮服务。');
      network.code = 'NETWORK_UNAVAILABLE';
      network.cause = error;
      throw network;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}
