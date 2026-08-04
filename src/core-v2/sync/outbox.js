import {
  SYNC_PROTOCOL_VERSION,
  assertPlainRecord,
  canonicalJson,
  cloneJson,
  recordId
} from '../contracts.js';
import { sha256Hex } from '../backup/backup-core.js';

export const SYNC_OPERATIONS = Object.freeze({
  UPSERT: 'upsert',
  DELETE: 'delete'
});

const APPEND_ONLY_TYPES = new Set([
  'brewSession',
  'sensoryRecord',
  'inventoryEvent'
]);

export async function createSyncEvent({
  eventId,
  entityType,
  entity,
  operation = SYNC_OPERATIONS.UPSERT,
  deviceId,
  clientTime = new Date().toISOString()
}) {
  const type = String(entityType || '').trim();
  if (!type) throw new Error('同步事件缺少 entityType');
  if (!Object.values(SYNC_OPERATIONS).includes(operation)) throw new Error(`未知同步操作：${operation}`);
  const value = cloneJson(assertPlainRecord(entity, 'sync entity'));
  const entityId = recordId(value, 'sync entity');
  const revision = Math.max(1, Number(value.revision) || 1);
  const payload = operation === SYNC_OPERATIONS.DELETE ? null : value;
  const hashSource = canonicalJson({ entityType: type, entityId, revision, operation, payload });
  const contentHash = await sha256Hex(hashSource);
  const resolvedEventId = String(eventId || `${deviceId || 'device'}:${type}:${entityId}:${revision}:${contentHash.slice(0, 12)}`);

  return Object.freeze({
    id: resolvedEventId,
    eventId: resolvedEventId,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    entityType: type,
    entityId,
    revision,
    operation,
    deviceId: String(deviceId || value.deviceId || ''),
    clientTime: String(clientTime),
    contentHash,
    payload,
    state: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null
  });
}

export function coalescePendingEvents(events) {
  const ordered = [...events].sort((left, right) => {
    const time = String(left.clientTime || '').localeCompare(String(right.clientTime || ''));
    return time || String(left.eventId || left.id).localeCompare(String(right.eventId || right.id));
  });
  const output = [];
  const replaceable = new Map();

  for (const event of ordered) {
    const key = `${event.entityType}:${event.entityId}`;
    if (APPEND_ONLY_TYPES.has(event.entityType)) {
      output.push(event);
      continue;
    }
    const previousIndex = replaceable.get(key);
    if (previousIndex == null) {
      replaceable.set(key, output.length);
      output.push(event);
      continue;
    }
    const previous = output[previousIndex];
    if (Number(event.revision || 0) >= Number(previous.revision || 0)) output[previousIndex] = event;
  }
  return output;
}

export function markSyncAttempt(event, { now = new Date().toISOString(), error = null } = {}) {
  const attempts = Math.max(0, Number(event.attempts) || 0) + 1;
  const delayMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
  const nextAttemptAt = new Date(new Date(now).getTime() + delayMinutes * 60_000).toISOString();
  return {
    ...event,
    state: error ? 'retry' : 'sent',
    attempts,
    lastAttemptAt: now,
    nextAttemptAt: error ? nextAttemptAt : null,
    lastError: error ? String(error.message || error) : null
  };
}

export function mergeIncomingEntity(local, remote) {
  if (!local) return { winner: remote, resolution: 'remote-only' };
  if (!remote) return { winner: local, resolution: 'local-only' };
  const localRevision = Number(local.revision) || 0;
  const remoteRevision = Number(remote.revision) || 0;
  if (localRevision > remoteRevision) return { winner: local, resolution: 'higher-local-revision' };
  if (remoteRevision > localRevision) return { winner: remote, resolution: 'higher-remote-revision' };
  const localTime = String(local.updatedAt || '');
  const remoteTime = String(remote.updatedAt || '');
  if (localTime >= remoteTime) return { winner: local, resolution: 'equal-revision-local-time' };
  return { winner: remote, resolution: 'equal-revision-remote-time' };
}
