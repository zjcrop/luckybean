import { canonicalJson } from '../contracts.js';
import { coalescePendingEvents, markSyncAttempt } from '../sync/outbox.js';

export class CloudAdapterError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'CloudAdapterError';
    this.code = code;
    this.details = details;
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:') {
    throw new CloudAdapterError('INSECURE_CLOUD_ENDPOINT', '云端接口必须使用 HTTPS');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

function assertJsonResponse(response, bodyText) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('application/json')) {
    throw new CloudAdapterError('NON_JSON_CLOUD_RESPONSE', '云端扩展只能返回 JSON', {
      status: response.status,
      contentType: type,
      preview: String(bodyText || '').slice(0, 160)
    });
  }
}

function validateAck(value, submittedIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloudAdapterError('INVALID_SYNC_ACK', '同步确认必须是 JSON 对象');
  }
  const acknowledged = Array.isArray(value.acknowledged) ? value.acknowledged.map(String) : [];
  const rejected = Array.isArray(value.rejected) ? value.rejected : [];
  const allowed = new Set(submittedIds);
  for (const id of acknowledged) {
    if (!allowed.has(id)) throw new CloudAdapterError('UNKNOWN_SYNC_ACK', `云端确认了未提交事件：${id}`);
  }
  return {
    acknowledged: [...new Set(acknowledged)],
    rejected,
    serverTime: String(value.serverTime || ''),
    protocolVersion: Number(value.protocolVersion || 0)
  };
}

export function createCloudAdapter({
  baseUrl,
  fetchImpl = globalThis.fetch,
  accessToken = null,
  timeoutMs = 20_000
}) {
  if (typeof fetchImpl !== 'function') throw new CloudAdapterError('FETCH_UNAVAILABLE', '当前环境不支持网络请求');
  const endpoint = normalizeBaseUrl(baseUrl);

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(options.headers || {});
      headers.set('accept', 'application/json');
      headers.set('content-type', 'application/json');
      if (accessToken) headers.set('authorization', `Bearer ${String(accessToken)}`);
      const response = await fetchImpl(`${endpoint}${path}`, {
        ...options,
        headers,
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });
      const text = await response.text();
      assertJsonResponse(response, text);
      let value;
      try { value = text ? JSON.parse(text) : {}; }
      catch (error) { throw new CloudAdapterError('INVALID_JSON_RESPONSE', '云端返回的 JSON 无法解析', error.message); }
      if (!response.ok) {
        throw new CloudAdapterError(
          String(value?.code || `HTTP_${response.status}`),
          String(value?.message || `云端请求失败：${response.status}`),
          value?.details || null
        );
      }
      return value;
    } catch (error) {
      if (error?.name === 'AbortError') throw new CloudAdapterError('CLOUD_TIMEOUT', '云端请求超时');
      if (error instanceof CloudAdapterError) throw error;
      throw new CloudAdapterError('CLOUD_NETWORK_ERROR', error?.message || String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    async pushOutbox(events, { deviceId, schemaVersion = 3, protocolVersion = 2 } = {}) {
      const pending = coalescePendingEvents(events).filter(event => event?.state !== 'sent');
      if (!pending.length) return { acknowledged: [], rejected: [], submitted: [] };
      const submittedIds = pending.map(event => String(event.eventId || event.id));
      const body = {
        protocolVersion,
        schemaVersion,
        deviceId: String(deviceId || ''),
        requestHashSource: canonicalJson(pending.map(event => ({
          eventId: event.eventId || event.id,
          contentHash: event.contentHash,
          revision: event.revision
        }))),
        events: pending
      };
      try {
        const response = await request('/v2/sync/events', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        const ack = validateAck(response, submittedIds);
        return { ...ack, submitted: submittedIds };
      } catch (error) {
        return {
          acknowledged: [],
          rejected: [],
          submitted: submittedIds,
          error,
          retryEvents: pending.map(event => markSyncAttempt(event, { error }))
        };
      }
    },

    async pullChanges({ deviceId, cursor = '', schemaVersion = 3, protocolVersion = 2 } = {}) {
      const response = await request('/v2/sync/changes', {
        method: 'POST',
        body: JSON.stringify({
          protocolVersion,
          schemaVersion,
          deviceId: String(deviceId || ''),
          cursor: String(cursor || '')
        })
      });
      if (!Array.isArray(response.events)) {
        throw new CloudAdapterError('INVALID_PULL_RESPONSE', '云端变更响应缺少 events 数组');
      }
      return {
        events: response.events,
        cursor: String(response.cursor || ''),
        hasMore: Boolean(response.hasMore)
      };
    },

    async health() {
      return request('/v2/health', { method: 'POST', body: '{}' });
    }
  });
}
