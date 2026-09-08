import { get, put } from '../db.js';
import {
  SYNC_FORMAT, CHUNK_FORMAT, SYNC_SCHEMA_VERSION,
  buildLogicalPackets, encodePacket, decodePacket, compressBytes, decompressBytes, mergeRemotePacketsIntoLocal
} from '../cloud-codec.js';
import {
  analyzeRemoteDeletionRisk, deletedBaselineUnitKeys, deletionRiskFingerprintSource,
  mergePacketPreservingRemote, packetUnitKeySet
} from './cloud-sync-safety.js';

const STATE_ID = 'cloud.sync.state.v3';
const DEVICE_ID = 'cloud.device.id.v3';
const DIRTY_KEY = 'luckybean.cloud.dirty.v3';
const DEBOUNCE_MS = 8000;
const CHUNK_QUERY_BATCH = 40;
const enc = new TextEncoder();
let timer = null;
let busy = false;
let pendingRun = false;
let localAppReady = Boolean(globalThis.__LuckyBeanLocalAppReady);
let pendingAutomaticReason = '';

const auth = () => globalThis.LuckyBeanCloudAuth;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function emit(state, detail = {}) {
  document.documentElement.dataset.cloudSync = state;
  document.dispatchEvent(new CustomEvent('luckybean:cloud-sync-state', { detail: { state, ...detail } }));
}

function publishManifest(manifest) {
  if (!manifest) return;
  const beanIndex = Array.isArray(manifest.bean_index) ? manifest.bean_index : [];
  document.dispatchEvent(new CustomEvent('luckybean:cloud-manifest-ready', {
    detail: {
      revision: manifestRevision(manifest),
      beanIndex,
      packetCount: Array.isArray(manifest.chunks) ? manifest.chunks.length : 0,
      sourceDeviceId: String(manifest.source_device_id || '')
    }
  }));
}

function readDirty() {
  try { return JSON.parse(localStorage.getItem(DIRTY_KEY) || 'null'); }
  catch { return null; }
}

function clearDirty() { localStorage.removeItem(DIRTY_KEY); }

function markMergeBackPending() {
  const now = new Date().toISOString();
  localStorage.setItem(DIRTY_KEY, JSON.stringify({
    dirty: true,
    firstChangedAt: now,
    lastChangedAt: now,
    stores: ['cloud-merge'],
    operation: 'cloud-merge'
  }));
  document.dispatchEvent(new CustomEvent('luckybean:data-changed', {
    detail: { store: 'cloud-merge', operation: 'cloud-merge', at: now }
  }));
}

async function deviceId() {
  const record = await get('syncMetadata', DEVICE_ID);
  if (record?.value) return record.value;
  const value = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  await put('syncMetadata', { id: DEVICE_ID, value, createdAt: new Date().toISOString() });
  return value;
}

async function stateRecord() {
  return (await get('syncMetadata', STATE_ID)) || {
    id: STATE_ID,
    lastRemoteRevision: '',
    lastSuccessfulSyncAt: '',
    lastSyncedUnitKeys: [],
    lastSyncedChunks: [],
    remoteBeanIndex: [],
    lastStatus: 'never',
    preservedDeletionFingerprint: '',
    pendingDeletionFingerprint: ''
  };
}

function manifestRevision(manifest) {
  // sync_completed_at is server-authored by the cloud store and is authoritative.
  // Device clocks are retained for diagnostics only and never outrank it.
  return String(manifest?.sync_completed_at || manifest?.uploaded_at || manifest?.client_updated_at || '');
}

async function saveState(patch) {
  const current = await stateRecord();
  const next = { ...current, ...patch, id: STATE_ID, updatedAt: new Date().toISOString() };
  await put('syncMetadata', next);
  return next;
}

function bytesToB64(bytes) {
  let binary = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) binary += String.fromCharCode(...bytes.subarray(index, index + size));
  return btoa(binary);
}

function b64ToBytes(value) {
  return Uint8Array.from(atob(String(value || '')), char => char.charCodeAt(0));
}

function b64Url(bytes) {
  return bytesToB64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function digest(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function digestB64(bytes) { return bytesToB64(await digest(bytes)); }
async function chunkId(logicalKey, packet) {
  const contentHash = await digestB64(encodePacket(packet));
  return b64Url(await digest(enc.encode(`${logicalKey}\n${contentHash}`))).slice(0, 32);
}

function logicalKeyOf(meta) {
  return String(meta?.logical_key || meta?.logicalKey || '');
}

function fieldFingerprint(value) {
  const text = JSON.stringify(value ?? null);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function beanIndexFromBundle(bundle, metas = []) {
  const metaById = new Map((metas || []).map(meta => [String(meta.chunk_id || ''), meta]));
  const rows = [];
  for (const [id, descriptor] of bundle?.descriptors || []) {
    const packet = descriptor?.packet;
    if (packet?.k !== 'bean-meta' || !Array.isArray(packet.b)) continue;
    const bean = packet.b;
    const meta = metaById.get(String(id));
    rows.push({
      id: String(bean[0] || ''),
      name: String(bean[1] || ''),
      country_code: String(bean[2] || ''),
      region_code: String(bean[3] || ''),
      roast_date: String(bean[9] || ''),
      remaining_weight_g: Number(bean[11] || 0) / 10,
      record_revision: String(meta?.chunk_id || id),
      logical_key: descriptor.logicalKey,
      field_revisions: bean.map(fieldFingerprint)
    });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function countFieldDiffs(remoteIndex = [], localIndex = []) {
  const local = new Map(localIndex.map(bean => [String(bean.id), bean]));
  let fields = 0;
  let beans = 0;
  for (const remote of remoteIndex) {
    const current = local.get(String(remote.id));
    if (!current) {
      beans += 1;
      fields += Array.isArray(remote.field_revisions) ? remote.field_revisions.length : 1;
      continue;
    }
    const left = Array.isArray(current.field_revisions) ? current.field_revisions : [];
    const right = Array.isArray(remote.field_revisions) ? remote.field_revisions : [];
    const count = Math.max(left.length, right.length);
    let different = 0;
    for (let index = 0; index < count; index += 1) if (left[index] !== right[index]) different += 1;
    if (different) { beans += 1; fields += different; }
  }
  return { beans, fields };
}

async function remoteManifest(userId) {
  const rows = await auth().apiRequest(`/rest/v1/luckybean_sync_manifests?user_id=eq.${encodeURIComponent(userId)}&select=*`, {
    method: 'GET', timeoutMs: 6000
  });
  return rows?.[0] || null;
}

async function fetchChunkRows(userId, metas = [], timeoutMs = 12000) {
  if (!metas.length) return [];
  const result = [];
  for (let offset = 0; offset < metas.length; offset += CHUNK_QUERY_BATCH) {
    const part = metas.slice(offset, offset + CHUNK_QUERY_BATCH);
    const ids = [...new Set(part.map(meta => String(meta?.chunk_id || '')).filter(Boolean))];
    if (!ids.length) continue;
    const filter = ids.map(value => encodeURIComponent(value)).join(',');
    const rows = await auth().apiRequest(
      `/rest/v1/luckybean_sync_chunks?user_id=eq.${encodeURIComponent(userId)}&chunk_id=in.(${filter})&select=*`,
      { method: 'GET', timeoutMs }
    );
    result.push(...(rows || []));
    await sleep(0);
  }
  return result;
}

async function decodePacketRows(rows = [], metas = [], { legacyMessage = '' } = {}) {
  const byId = new Map((rows || []).map(row => [String(row.chunk_id || ''), row]));
  const packets = new Map();
  for (const meta of metas) {
    const id = String(meta.chunk_id || '');
    const row = byId.get(id);
    if (!row) throw new Error(`云端缺少分包 ${id}`);
    if (row.cipher && row.cipher !== 'none') {
      const error = new Error(legacyMessage || '检测到旧版加密云端数据，已停止覆盖。请先使用旧版完成迁移。');
      error.code = 'LEGACY_ENCRYPTED';
      throw error;
    }
    const packed = b64ToBytes(row.payload);
    const plain = await decompressBytes(packed, row.compression);
    if (await digestB64(plain) !== row.content_hash) throw new Error(`分包 ${id} 完整性校验失败`);
    packets.set(id, decodePacket(plain));
    await sleep(0);
  }
  return packets;
}

async function remotePacketBundle(userId, manifest) {
  const metas = Array.isArray(manifest?.chunks) ? manifest.chunks : [];
  if (!metas.length) return { rows: new Map(), packets: new Map() };
  const result = await fetchChunkRows(userId, metas);
  const rows = new Map((result || []).map(row => [String(row.chunk_id || ''), row]));
  const packets = await decodePacketRows(result, metas);
  return { rows, packets };
}

async function localPacketBundle(built) {
  const descriptors = new Map();
  const packets = new Map();
  const byLogicalKey = new Map();
  for (const packetInfo of built.packets) {
    const id = await chunkId(packetInfo.logicalKey, packetInfo.packet);
    const descriptor = { id, logicalKey: packetInfo.logicalKey, packet: packetInfo.packet };
    descriptors.set(id, descriptor);
    byLogicalKey.set(packetInfo.logicalKey, descriptor);
    packets.set(id, packetInfo.packet);
  }
  return { descriptors, byLogicalKey, packets };
}

async function commitManifest(userId, manifest, existing) {
  if (existing) {
    const expected = manifestRevision(existing);
    const rows = await auth().apiRequest(
      `/rest/v1/luckybean_sync_manifests?user_id=eq.${encodeURIComponent(userId)}&sync_completed_at=eq.${encodeURIComponent(expected)}&select=*`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: manifest,
        timeoutMs: 10000
      }
    );
    return rows?.[0] || null;
  }
  const rows = await auth().apiRequest('/rest/v1/luckybean_sync_manifests?on_conflict=user_id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: manifest,
    timeoutMs: 10000
  });
  return rows?.[0] || null;
}

async function riskFingerprint(risk) {
  return digestB64(enc.encode(deletionRiskFingerprintSource(risk)));
}

function guardDetail(risk, fingerprint, remoteRevision) {
  return {
    fingerprint,
    remoteRevision,
    baselineUnknown: risk.baselineUnknown,
    missingUnits: risk.missingUnits,
    remoteUnits: risk.remoteUnits,
    remoteOnlyChunks: risk.remoteOnlyChunks,
    largeDeletion: risk.largeDeletion,
    ratioPct: Math.round(risk.ratio * 1000) / 10,
    message: risk.baselineUnknown
      ? '云端已有数据，但本机尚未建立同步基线。为防止本机不完整数据覆盖云端，需要确认处理方式。'
      : `本机数据将使云端减少 ${risk.missingUnits} 项记录，已停止自动删除。`
  };
}

async function prepareUploadRows({ built, localBundle, remoteBundle, existing, policy, forceMigration, device, now }) {
  const nextChunks = [];
  const changedRows = [];
  const remoteChunks = new Map((existing?.chunks || []).map(item => [item.chunk_id, item]));

  for (const [id, descriptor] of localBundle.descriptors) {
    const remotePacket = remoteBundle.packets.get(id);
    const packet = policy === 'preserve' && remotePacket
      ? mergePacketPreservingRemote(descriptor.packet, remotePacket)
      : descriptor.packet;
    const plain = encodePacket(packet);
    const contentHash = await digestB64(plain);
    const previous = remoteChunks.get(id);
    const plainCompatible = previous?.cipher === 'none' || previous?.transport === 'plain-compressed-v1';
    if (previous?.content_hash === contentHash && plainCompatible && !forceMigration) {
      nextChunks.push({ ...previous, logical_key: descriptor.logicalKey });
      continue;
    }
    const compressed = await compressBytes(plain);
    changedRows.push({
      user_id: existing?.user_id || auth()?.getSession?.()?.user?.id,
      chunk_id: id,
      format: CHUNK_FORMAT,
      schema_version: SYNC_SCHEMA_VERSION,
      compression: compressed.algorithm,
      cipher: 'none',
      iv: '',
      payload: bytesToB64(compressed.bytes),
      content_hash: contentHash,
      plain_bytes: plain.byteLength,
      compressed_bytes: compressed.bytes.byteLength,
      cipher_bytes: compressed.bytes.byteLength,
      source_device_id: device,
      client_updated_at: now,
    });
    nextChunks.push({
      chunk_id: id,
      content_hash: contentHash,
      logical_hash: await digestB64(enc.encode(descriptor.logicalKey)),
      logical_key: descriptor.logicalKey,
      plain_bytes: plain.byteLength,
      compressed_bytes: compressed.bytes.byteLength,
      cipher_bytes: compressed.bytes.byteLength,
      cipher: 'none',
      transport: 'plain-compressed-v1',
      client_updated_at: now
    });
    await sleep(0);
  }

  const localIds = new Set(localBundle.descriptors.keys());
  const remoteOnly = [...remoteChunks.entries()].filter(([id]) => !localIds.has(id));
  if (policy === 'preserve') {
    for (const [, meta] of remoteOnly) nextChunks.push(meta);
  }

  return {
    nextChunks,
    changedRows,
    staleChunkIds: policy === 'delete' ? remoteOnly.map(([id]) => id) : []
  };
}

async function upload({ reason = 'auto', forceMigration = false, deletionPolicy = '', expectedFingerprint = '', expectedRemoteRevision = '' } = {}) {
  const active = auth()?.getSession?.();
  if (!active?.user?.id) throw new Error('请先登录云端账号');
  const userId = active.user.id;
  const existing = await remoteManifest(userId);
  const localState = await stateRecord();
  const device = await deviceId();
  const remoteRevision = manifestRevision(existing);
  if (expectedRemoteRevision && remoteRevision !== expectedRemoteRevision) {
    return { staleRemote: true, expectedRemoteRevision, remoteRevision };
  }
  if (!expectedRemoteRevision && existing && remoteRevision !== localState.lastRemoteRevision) {
    return mergeAndUpload(existing, readDirty(), { reason: `${reason}-late-remote`, interactive: false });
  }

  emit('comparing', { reason });
  const built = await buildLogicalPackets();
  const localBundle = await localPacketBundle(built);
  const remoteBundle = await remotePacketBundle(userId, existing);
  const baselineUnknown = Boolean(
    existing?.chunks?.length && !localState.lastRemoteRevision && existing.source_device_id && existing.source_device_id !== device
  );
  const risk = analyzeRemoteDeletionRisk(localBundle.packets, remoteBundle.packets, { baselineUnknown });
  const fingerprint = await riskFingerprint(risk);
  let policy = deletionPolicy;

  if (risk.requiresConfirmation) {
    if (expectedFingerprint && expectedFingerprint !== fingerprint) policy = '';
    if (!policy && localState.preservedDeletionFingerprint === fingerprint) policy = 'preserve';
    if (!policy) {
      const detail = guardDetail(risk, fingerprint, remoteRevision);
      await saveState({
        lastStatus: 'deletion-confirmation-required',
        pendingDeletionFingerprint: fingerprint,
        pendingDeletionDetail: detail,
        pendingDeletionAt: new Date().toISOString()
      });
      emit('deletion-confirmation-required', detail);
      return { confirmationRequired: true, ...detail };
    }
  } else {
    policy = 'delete';
  }

  if (!['preserve', 'delete'].includes(policy)) throw new Error('无效的云端删除处理方式');

  emit('syncing', { reason, deletionPolicy: policy });
  const now = new Date().toISOString();
  const prepared = await prepareUploadRows({ built, localBundle, remoteBundle, existing, policy, forceMigration, device, now });

  if (prepared.changedRows.length) {
    await auth().apiRequest('/rest/v1/luckybean_sync_chunks?on_conflict=user_id,chunk_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: prepared.changedRows,
      timeoutMs: 12000
    });
  }

  const beanIndex = beanIndexFromBundle(localBundle, prepared.nextChunks);
  const manifest = {
    user_id: userId,
    format: SYNC_FORMAT,
    schema_version: SYNC_SCHEMA_VERSION,
    codebook_version: built.codebookVersion,
    kdf: 'none',
    kdf_iterations: 0,
    kdf_salt: '',
    chunks: prepared.nextChunks,
    bean_index: beanIndex,
    source_device_id: device,
    client_updated_at: now,
    client_data_schema_version: 10,
    client_architecture: 'manifest-diff-v4',
  };
  const committedManifest = await commitManifest(userId, manifest, existing);
  if (!committedManifest) {
    return { staleRemote: true, expectedRemoteRevision: remoteRevision, remoteRevision: manifestRevision(await remoteManifest(userId)) };
  }
  const completedRevision = manifestRevision(committedManifest);

  for (const id of prepared.staleChunkIds) {
    await auth().apiRequest(`/rest/v1/luckybean_sync_chunks?user_id=eq.${encodeURIComponent(userId)}&chunk_id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' }, timeoutMs: 6000
    });
  }

  clearDirty();
  const preservedUnits = policy === 'preserve' ? risk.missingUnits : 0;
  const deletedUnits = policy === 'delete' ? risk.missingUnits : 0;
  const lastStatus = preservedUnits ? 'synced-preserved' : 'synced';
  const baselineKeys = [...packetUnitKeySet(localBundle.packets)].sort();
  await saveState({
    lastRemoteRevision: completedRevision,
    lastSuccessfulSyncAt: completedRevision,
    lastSyncedUnitKeys: baselineKeys,
    lastSyncedChunks: prepared.nextChunks.map(meta => ({ chunk_id:meta.chunk_id, content_hash:meta.content_hash, logical_key:logicalKeyOf(meta) })),
    remoteBeanIndex: beanIndex,
    lastStatus,
    changedPackets: prepared.changedRows.length,
    deletedPackets: prepared.staleChunkIds.length,
    deletedUnits,
    preservedUnits,
    packetCount: prepared.nextChunks.length,
    uploadedBytes: prepared.changedRows.reduce((sum, row) => sum + Number(row.compressed_bytes || 0), 0),
    pendingDeletionFingerprint: '',
    pendingDeletionDetail: null,
    preservedDeletionFingerprint: policy === 'preserve' && risk.requiresConfirmation ? fingerprint : ''
  });
  emit(lastStatus, {
    changed: prepared.changedRows.length,
    deleted: prepared.staleChunkIds.length,
    deletedUnits,
    preservedUnits,
    packetCount: prepared.nextChunks.length
  });
  return { changed: prepared.changedRows.length, deleted: prepared.staleChunkIds.length, deletedUnits, preservedUnits, packetCount: prepared.nextChunks.length };
}

function mergeRestoredCounts(target = {}, source = {}) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    if (typeof value === 'number') result[key] = Number(result[key] || 0) + value;
    else result[key] = value;
  }
  return result;
}

async function mergePacketStage(packets, manifest, dirty, localState) {
  if (!packets.length) return {};
  return mergeRemotePacketsIntoLocal(packets, {
    remoteCompletedAt: manifestRevision(manifest),
    localChangedAt: dirty?.lastChangedAt || localState.lastSuccessfulSyncAt || ''
  });
}

async function download(manifest, { interactive = false, mergeBack = false } = {}) {
  const active = auth()?.getSession?.();
  if (!active?.user?.id || !manifest) return { skipped: true };
  const userId = active.user.id;
  const localState = await stateRecord();
  const dirty = readDirty();
  const completedRevision = manifestRevision(manifest);

  // Manifest first: it is the lightweight authoritative list/revision surface.
  // The local UI remains responsive while the exact changed chunk set is derived.
  publishManifest(manifest);
  emit('comparing-list', { revision:completedRevision, beanCount:Array.isArray(manifest.bean_index) ? manifest.bean_index.length : 0 });

  const localBuilt = await buildLogicalPackets();
  const localBundle = await localPacketBundle(localBuilt);
  const remoteMetas = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  const neededMetas = remoteMetas.filter(meta => !localBundle.descriptors.has(String(meta.chunk_id || '')));
  const localBeanIndex = beanIndexFromBundle(localBundle);
  const fieldDiffs = countFieldDiffs(Array.isArray(manifest.bean_index) ? manifest.bean_index : [], localBeanIndex);

  const priorityMetas = neededMetas.filter(meta => {
    const key = logicalKeyOf(meta);
    return key.endsWith(':meta') || key.startsWith('global:bean-mutations:');
  });
  const priorityIds = new Set(priorityMetas.map(meta => String(meta.chunk_id || '')));
  const detailMetas = neededMetas.filter(meta => !priorityIds.has(String(meta.chunk_id || '')));
  let restored = {};

  globalThis.__LuckyBeanCloudRestoreActive = true;
  try {
    if (priorityMetas.length) {
      emit('downloading-list', { changed:priorityMetas.length, total:neededMetas.length });
      const priorityRows = await fetchChunkRows(userId, priorityMetas, 9000);
      const priorityPackets = [...(await decodePacketRows(priorityRows, priorityMetas, {
        legacyMessage:'检测到旧版密码加密云端数据。请在原设备产生一次新修改后自动迁移，或使用旧版本手动恢复。'
      })).values()];
      restored = mergeRestoredCounts(restored, await mergePacketStage(priorityPackets, manifest, dirty, localState));
      document.dispatchEvent(new CustomEvent('luckybean:cloud-list-restored', {
        detail:{ restored, revision:completedRevision, changedPackets:priorityMetas.length }
      }));
      // Let bean-list rendering happen before larger historical/detail packets.
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    if (detailMetas.length) {
      emit('downloading-diff', { changed:detailMetas.length, total:neededMetas.length });
      const detailRows = await fetchChunkRows(userId, detailMetas, 12000);
      const detailPackets = [...(await decodePacketRows(detailRows, detailMetas, {
        legacyMessage:'检测到旧版密码加密云端数据。请在原设备产生一次新修改后自动迁移，或使用旧版本手动恢复。'
      })).values()];
      restored = mergeRestoredCounts(restored, await mergePacketStage(detailPackets, manifest, dirty, localState));
    }

    clearDirty();
    const finalBuilt = await buildLogicalPackets();
    const finalBundle = await localPacketBundle(finalBuilt);
    const baselineKeys = [...packetUnitKeySet(finalBundle.packets)].sort();
    await saveState({
      lastRemoteRevision: completedRevision,
      lastSuccessfulSyncAt: completedRevision || new Date().toISOString(),
      lastSyncedUnitKeys: baselineKeys,
      lastSyncedChunks: remoteMetas.map(meta => ({ chunk_id:meta.chunk_id, content_hash:meta.content_hash, logical_key:logicalKeyOf(meta) })),
      remoteBeanIndex: Array.isArray(manifest.bean_index) ? manifest.bean_index : [],
      lastStatus: 'downloaded',
      restored,
      comparedPackets: remoteMetas.length,
      downloadedPackets: neededMetas.length,
      skippedUnchangedPackets: Math.max(0, remoteMetas.length - neededMetas.length),
      differingBeans: fieldDiffs.beans,
      differingFields: fieldDiffs.fields,
      pendingDeletionFingerprint: '',
      pendingDeletionDetail: null
    });
    emit('downloaded', {
      restored,
      downloadedPackets:neededMetas.length,
      skippedUnchangedPackets:Math.max(0, remoteMetas.length-neededMetas.length),
      differingBeans:fieldDiffs.beans,
      differingFields:fieldDiffs.fields
    });
    document.dispatchEvent(new CustomEvent('luckybean:cloud-data-restored', { detail: { restored } }));
    if (mergeBack) markMergeBackPending();
    return {
      restored,
      downloadedPackets:neededMetas.length,
      skippedUnchangedPackets:Math.max(0, remoteMetas.length-neededMetas.length),
      differingBeans:fieldDiffs.beans,
      differingFields:fieldDiffs.fields
    };
  } catch (error) {
    if (error?.code === 'LEGACY_ENCRYPTED') {
      await saveState({ lastStatus:'legacy-encrypted', legacyEncryptedAt:new Date().toISOString() });
      emit('legacy-encrypted', { message:error.message });
      if (interactive) throw error;
      return { legacyEncrypted:true };
    }
    throw error;
  } finally {
    globalThis.__LuckyBeanCloudRestoreActive = false;
  }
}

async function mergeAndUpload(manifest, dirty, { reason = 'merge', interactive = false } = {}) {
  const active = auth()?.getSession?.();
  if (!active?.user?.id) return { skipped: true, reason: 'signed-out' };
  let currentManifest = manifest;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const localState = await stateRecord();
    const remoteBundle = await remotePacketBundle(active.user.id, currentManifest);
    const localBuilt = await buildLogicalPackets();
    const localBundle = await localPacketBundle(localBuilt);
    const deletedKeys = deletedBaselineUnitKeys(localBundle.packets, localState.lastSyncedUnitKeys || []);
    globalThis.__LuckyBeanCloudRestoreActive = true;
    try {
      await mergeRemotePacketsIntoLocal([...remoteBundle.packets.values()], {
        skipUnitKeys: deletedKeys,
        remoteCompletedAt: manifestRevision(currentManifest),
        localChangedAt: dirty?.lastChangedAt || localState.updatedAt || ''
      });
    } finally {
      globalThis.__LuckyBeanCloudRestoreActive = false;
    }
    const result = await upload({
      reason: `${reason}-union`,
      deletionPolicy: 'delete',
      expectedRemoteRevision: manifestRevision(currentManifest)
    });
    if (!result?.staleRemote) return result;
    currentManifest = await remoteManifest(active.user.id);
  }
  const error = new Error('云端数据连续发生变化，本次已安全停止；稍后将自动重新合并');
  if (interactive) throw error;
  return { error: error.message };
}

async function reconcile({ reason = 'startup', interactive = false, forcePull = false, deletionPolicy = '', expectedFingerprint = '' } = {}) {
  if (busy) {
    pendingRun = true;
    return { queued: true };
  }
  const active = auth()?.getSession?.();
  if (!active?.user?.id) {
    emit('waiting-for-login');
    return { skipped: true, reason: 'signed-out' };
  }
  if (navigator.scheduling?.isInputPending?.()) {
    scheduleSync(1500, reason);
    return { queued: true, reason: 'input-pending' };
  }
  busy = true;
  try {
    const manifest = await remoteManifest(active.user.id);
    const localState = await stateRecord();
    const dirty = readDirty();
    const remoteRevision = manifestRevision(manifest);
    const remoteChanged = Boolean(manifest && remoteRevision && remoteRevision !== localState.lastRemoteRevision);
    if (manifest) publishManifest(manifest);

    if (forcePull && manifest) return await download(manifest, { interactive: true, mergeBack: true });
    if (manifest && !localState.lastRemoteRevision) {
      return await mergeAndUpload(manifest, dirty, { reason: `${reason}-first-baseline`, interactive });
    }
    if (dirty && manifest) return await mergeAndUpload(manifest, dirty, { reason, interactive });
    if (dirty || deletionPolicy) return await upload({ reason, deletionPolicy: deletionPolicy || 'delete', expectedFingerprint });
    if (remoteChanged) return await download(manifest, { interactive });

    await saveState({
      lastStatus:'idle',
      lastCheckedAt:new Date().toISOString(),
      lastRemoteRevision:remoteRevision || localState.lastRemoteRevision,
      remoteBeanIndex:Array.isArray(manifest?.bean_index) ? manifest.bean_index : localState.remoteBeanIndex || []
    });
    emit('idle');
    return { idle: true };
  } catch (error) {
    const status = error?.code === 'LEGACY_ENCRYPTED' ? 'legacy-encrypted' : 'error';
    await saveState({ lastStatus: status, lastError: error.message, lastErrorAt: new Date().toISOString() }).catch(() => {});
    emit(status, { error: error.message });
    if (interactive) throw error;
    return { error: error.message };
  } finally {
    busy = false;
    if (pendingRun) {
      pendingRun = false;
      scheduleSync(1000, 'queued-change');
    }
  }
}

function scheduleSync(delay = DEBOUNCE_MS, reason = 'local-change') {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (document.visibilityState === 'hidden') {
      scheduleSync(2000, reason);
      return;
    }
    reconcile({ reason }).catch(() => {});
  }, delay);
}

function ensureAutomatic(reason = 'authenticated') {
  const active = auth()?.getSession?.();
  if (!active?.user?.id) {
    emit('waiting-for-login');
    return false;
  }
  if (!localAppReady) {
    pendingAutomaticReason = reason;
    emit('waiting-for-local');
    return true;
  }
  scheduleSync(reason === 'login' ? 1800 : 1200, reason);
  return true;
}

async function resolveDeletionDecision(decision) {
  const current = await stateRecord();
  const fingerprint = current.pendingDeletionFingerprint || '';
  if (!fingerprint) return reconcile({ reason: 'deletion-review-missing', interactive: true });
  const policy = decision === 'delete' ? 'delete' : 'preserve';
  return reconcile({
    reason: policy === 'delete' ? 'confirmed-cloud-deletion' : 'preserve-cloud-data',
    interactive: true,
    deletionPolicy: policy,
    expectedFingerprint: fingerprint
  });
}

document.addEventListener('luckybean:local-app-ready', () => {
  localAppReady = true;
  if (pendingAutomaticReason || readDirty()) {
    const reason = pendingAutomaticReason || 'startup-dirty';
    pendingAutomaticReason = '';
    scheduleSync(1600, reason);
  }
});
document.addEventListener('luckybean:data-changed', () => {
  if (localAppReady) scheduleSync(DEBOUNCE_MS, 'local-change');
  else pendingAutomaticReason = 'local-change';
});
document.addEventListener('luckybean:cloud-auth-state', event => {
  if (event.detail?.state === 'authenticated') ensureAutomatic('auth-ready');
});
document.addEventListener('luckybean:cloud-login-success', () => ensureAutomatic('login'));
window.addEventListener('online', () => scheduleSync(500, 'network-online'));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && readDirty()) scheduleSync(800, 'foreground');
});

globalThis.LuckyBeanCloudSync = {
  revision: 'cloud-sync-service-v4-manifest-diff',
  reconcile,
  ensureAutomatic,
  resolveDeletionDecision,
  syncNow: () => reconcile({ reason: 'manual', interactive: true }),
  pullNow: () => reconcile({ reason: 'manual-pull', interactive: true, forcePull: true }),
  syncIntentionalDeletion: async () => {
    const current = await stateRecord();
    if (!current.lastRemoteRevision) return reconcile({ reason: 'intentional-local-deletion', interactive: false });
    return reconcile({ reason: 'intentional-local-deletion', interactive: true, deletionPolicy: 'delete' });
  },
  enabled: async () => true,
  getState: stateRecord,
  hasPendingChanges: () => Boolean(readDirty())
};

document.dispatchEvent(new CustomEvent('luckybean:cloud-sync-service-ready'));
if (readDirty()) { if (localAppReady) scheduleSync(1600, 'startup-dirty'); else pendingAutomaticReason = 'startup-dirty'; }
