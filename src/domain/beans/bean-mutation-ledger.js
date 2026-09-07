import { get, put } from '../../db.js';

export const BEAN_MUTATION_LEDGER_ID = 'bean.lifecycle.mutations.v1';
export const BEAN_MUTATION_SCHEMA = 'bean-lifecycle-mutation/1.0';
export const BEAN_MUTATION_OPERATIONS = Object.freeze({ DELETE: 'delete', RESTORE: 'restore' });
const DEVICE_ID = 'cloud.device.id.v3';

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function validOperation(value) {
  return value === 'delete' || value === 'restore';
}

function mutationTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeBeanMutation(value = {}) {
  const entityId = String(value.entityId || value.id || '').trim();
  const operation = String(value.operation || '').trim();
  if (!entityId || !validOperation(operation)) return null;
  return {
    schemaVersion: BEAN_MUTATION_SCHEMA,
    entity: 'beans',
    entityId,
    operation,
    mutatedAt: String(value.mutatedAt || value.deletedAt || value.restoredAt || ''),
    mutationId: String(value.mutationId || ''),
    sourceDeviceId: String(value.sourceDeviceId || ''),
    syncState: value.syncState === 'synced' ? 'synced' : 'pending'
  };
}

export function compareBeanMutations(left, right) {
  const a = normalizeBeanMutation(left);
  const b = normalizeBeanMutation(right);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const timeDelta = mutationTime(a.mutatedAt) - mutationTime(b.mutatedAt);
  if (timeDelta) return timeDelta;
  const idDelta = a.mutationId.localeCompare(b.mutationId);
  if (idDelta) return idDelta;
  if (a.operation === b.operation) return 0;
  return a.operation === 'delete' ? 1 : -1;
}

export function mergeBeanMutationLists(local = [], remote = []) {
  const merged = new Map();
  for (const source of [...local, ...remote]) {
    const mutation = normalizeBeanMutation(source);
    if (!mutation) continue;
    const current = merged.get(mutation.entityId);
    if (!current || compareBeanMutations(mutation, current) > 0) merged.set(mutation.entityId, clone(mutation));
  }
  return [...merged.values()].sort((a, b) => a.entityId.localeCompare(b.entityId));
}

export function activeDeletedBeanIds(mutations = []) {
  return new Set(mergeBeanMutationLists(mutations).filter(item => item.operation === 'delete').map(item => item.entityId));
}

function mutationId(at = new Date().toISOString()) {
  const time = Math.max(0, mutationTime(at)).toString(36).padStart(9, '0');
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `bm-${time}-${random}`;
}

async function localDeviceId() {
  const current = await get('syncMetadata', DEVICE_ID);
  if (current?.value) return String(current.value);
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await put('syncMetadata', { id: DEVICE_ID, value, createdAt: new Date().toISOString() });
  return value;
}

async function ledgerRecord() {
  const current = await get('syncMetadata', BEAN_MUTATION_LEDGER_ID);
  return current || {
    id: BEAN_MUTATION_LEDGER_ID,
    schemaVersion: BEAN_MUTATION_SCHEMA,
    mutations: [],
    createdAt: new Date().toISOString()
  };
}

async function saveMutations(mutations = []) {
  const current = await ledgerRecord();
  const normalized = mergeBeanMutationLists(mutations);
  await put('syncMetadata', {
    ...current,
    id: BEAN_MUTATION_LEDGER_ID,
    schemaVersion: BEAN_MUTATION_SCHEMA,
    mutations: normalized,
    updatedAt: new Date().toISOString()
  });
  return normalized;
}

export async function readBeanMutations() {
  const current = await ledgerRecord();
  return mergeBeanMutationLists(current.mutations || []);
}

export async function recordBeanMutations(ids = [], operation, options = {}) {
  if (!validOperation(operation)) throw new Error(`无效 Bean 生命周期操作：${operation}`);
  const wanted = [...new Set((ids || []).map(value => String(value || '').trim()).filter(Boolean))];
  if (!wanted.length) return [];
  const mutatedAt = String(options.mutatedAt || new Date().toISOString());
  const sourceDeviceId = String(options.sourceDeviceId || await localDeviceId());
  const current = await readBeanMutations();
  const created = wanted.map(entityId => ({
    schemaVersion: BEAN_MUTATION_SCHEMA,
    entity: 'beans',
    entityId,
    operation,
    mutatedAt,
    mutationId: mutationId(mutatedAt),
    sourceDeviceId,
    syncState: 'pending'
  }));
  await saveMutations(mergeBeanMutationLists(current, created));
  return created;
}

export const recordBeanDeletions = (ids, options) => recordBeanMutations(ids, 'delete', options);
export const recordBeanRestores = (ids, options) => recordBeanMutations(ids, 'restore', options);

export async function mergeRemoteBeanMutations(remote = []) {
  const current = await readBeanMutations();
  const incoming = remote.map(item => ({ ...item, syncState: 'synced' }));
  const merged = mergeBeanMutationLists(current, incoming);
  await saveMutations(merged);
  return merged;
}

export async function markBeanMutationsSynced() {
  const current = await readBeanMutations();
  if (!current.some(item => item.syncState !== 'synced')) return current;
  return saveMutations(current.map(item => ({ ...item, syncState: 'synced' })));
}

function installSyncAckListener() {
  if (!globalThis.document?.addEventListener) return;
  globalThis.document.addEventListener('luckybean:cloud-sync-state', event => {
    if (!['synced', 'synced-preserved'].includes(event.detail?.state)) return;
    markBeanMutationsSynced().catch(error => console.warn('Bean 生命周期同步确认状态写入失败', error));
  });
}

installSyncAckListener();
