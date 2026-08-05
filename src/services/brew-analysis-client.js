import { validateBrewAnalysis } from '../contracts/brew-contracts.js';

const DEFAULT_TIMEOUT_MS = 3500;

export class BrewAnalysisError extends Error {
  constructor(message, { code = 'BREW_ANALYSIS_FAILED', status = 0, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BrewAnalysisError';
    this.code = code;
    this.status = status;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(item => item.toString(16).padStart(2, '0')).join('');
}

export function createBrewAnalysisClient({ endpoint, publishableKey, getAccessToken, cacheStore, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!endpoint) throw new TypeError('缺少BrewProfiles综合分析端点');
  if (!publishableKey) throw new TypeError('缺少Supabase Publishable Key');
  if (typeof getAccessToken !== 'function') throw new TypeError('getAccessToken必须是函数');

  let activeController = null;

  async function analyze(input, { force = false, signal } = {}) {
    const inputFingerprint = `sha256:${await sha256(input)}`;
    if (!force && cacheStore?.get) {
      const cached = await cacheStore.get(inputFingerprint);
      if (cached) return { analysis: validateBrewAnalysis(cached), source: 'cache', inputFingerprint };
    }

    const token = await getAccessToken();
    if (!token) throw new BrewAnalysisError('专业模型需要有效登录会话', { code: 'AUTH_REQUIRED', status: 401 });

    activeController?.abort('superseded');
    activeController = new AbortController();
    const timeout = setTimeout(() => activeController.abort('timeout'), timeoutMs);
    const abort = () => activeController.abort(signal?.reason || 'external');
    signal?.addEventListener('abort', abort, { once: true });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'apikey': publishableKey,
          'authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ contract: 'brew-analysis/2.0', input }),
        cache: 'no-store',
        signal: activeController.signal
      });
      const text = await response.text();
      let payload;
      try { payload = text ? JSON.parse(text) : null; }
      catch { throw new BrewAnalysisError('专业模型返回了无法解析的数据', { code: 'INVALID_JSON', status: response.status }); }
      if (!response.ok) {
        throw new BrewAnalysisError(payload?.message || payload?.error || `专业模型请求失败（${response.status}）`, {
          code: payload?.code || 'HTTP_ERROR',
          status: response.status
        });
      }
      const analysis = validateBrewAnalysis(payload);
      if (analysis.metadata.inputFingerprint !== inputFingerprint) {
        throw new BrewAnalysisError('服务器返回的输入指纹与本次请求不一致', { code: 'FINGERPRINT_MISMATCH' });
      }
      await cacheStore?.put?.(inputFingerprint, analysis);
      return { analysis, source: 'network', inputFingerprint };
    } catch (error) {
      if (error instanceof BrewAnalysisError) throw error;
      if (activeController.signal.aborted) {
        const timeoutAbort = activeController.signal.reason === 'timeout';
        throw new BrewAnalysisError(timeoutAbort ? '专业模型响应超时' : '专业模型请求已取消', {
          code: timeoutAbort ? 'TIMEOUT' : 'ABORTED',
          cause: error
        });
      }
      throw new BrewAnalysisError('专业模型暂时不可用', { code: 'NETWORK_ERROR', cause: error });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      activeController = null;
    }
  }

  return { analyze, cancel: () => activeController?.abort('cancelled') };
}
