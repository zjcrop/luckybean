import { BREW_API_PUBLIC_KEY, getInstallationId } from './brew-api-client.js';

export const MEDIA_TASTING_ENDPOINT = 'https://vaxwncdcuvbpvdbbketb.supabase.co/functions/v1/media-tasting-v1';
export const MEDIA_TASTING_CLIENT_VERSION = 'luckybean-media-tasting/1.0.0';
export const MEDIA_TASTING_CONTRACT = 'luckybean-media-tasting/1.0';

function clean(value, max = 500) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function compact(value, depth = 0) {
  if (depth > 4) return undefined;
  if (Array.isArray(value)) return value.slice(0, 30).map(item => compact(item, depth + 1)).filter(item => item !== undefined);
  if (!value || typeof value !== 'object') {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return clean(value);
  }
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    const next = compact(item, depth + 1);
    if (next === undefined || next === '' || (Array.isArray(next) && !next.length)) continue;
    out[clean(key, 80)] = next;
  }
  return out;
}

export async function generateMediaTastingCopy({ template, facts, timeoutMs = 20000 } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  try {
    const request = fetch(MEDIA_TASTING_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        apikey: BREW_API_PUBLIC_KEY,
        'x-client-info': MEDIA_TASTING_CLIENT_VERSION,
        'x-installation-id': getInstallationId()
      },
      body: JSON.stringify({
        contract: MEDIA_TASTING_CONTRACT,
        template: {
          id: clean(template?.id, 120) || 'custom',
          name: clean(template?.name, 120) || '媒体品鉴模板',
          instructions: clean(template?.instructions || template?.content, 8000)
        },
        facts: compact(facts || {}),
        locale: 'zh-CN'
      }),
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {})
    });
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await request;
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok || payload?.ok !== true) {
      return { ok: false, reason: String(payload?.error || `http-${response.status}`) };
    }
    const resultText = clean(payload?.result?.text, 9000);
    if (!resultText) return { ok: false, reason: 'empty-result' };
    return {
      ok: true,
      text: resultText,
      templateId: String(payload?.result?.templateId || template?.id || ''),
      model: String(payload?.model || ''),
      usage: payload?.usage || null,
      ephemeral: payload?.result?.ephemeral === true
    };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network-error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
