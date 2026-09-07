import * as base from './cloud-codec-base.js';
import { all, remove } from './db.js';
import {
  activeDeletedBeanIds,
  mergeRemoteBeanMutations,
  readBeanMutations
} from './domain/beans/bean-mutation-ledger.js';

export * from './cloud-codec-base.js';

const MUTATION_KIND = 'bean-mutations';
const MUTATION_BATCH_SIZE = 64;

function splitRows(rows, size = MUTATION_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

export function packBeanMutation(mutation = {}) {
  return [
    String(mutation.entityId || ''),
    mutation.operation === 'delete' ? 'd' : 'r',
    String(mutation.mutatedAt || ''),
    String(mutation.mutationId || ''),
    String(mutation.sourceDeviceId || '')
  ];
}

export function unpackBeanMutation(row = []) {
  return {
    entity: 'beans',
    entityId: String(row[0] || ''),
    operation: row[1] === 'd' ? 'delete' : 'restore',
    mutatedAt: String(row[2] || ''),
    mutationId: String(row[3] || ''),
    sourceDeviceId: String(row[4] || ''),
    syncState: 'synced'
  };
}

function mutationRows(packets = []) {
  return packets
    .filter(packet => packet?.k === MUTATION_KIND)
    .flatMap(packet => Array.isArray(packet.x) ? packet.x : [])
    .map(unpackBeanMutation)
    .filter(mutation => mutation.entityId && mutation.mutationId);
}

function withoutMutationPackets(packets = []) {
  return packets.filter(packet => packet?.k !== MUTATION_KIND);
}

function skipKeysWithDeletes(options = {}, deletedIds = new Set()) {
  const source = options.skipUnitKeys instanceof Set
    ? options.skipUnitKeys
    : new Set(options.skipUnitKeys || []);
  const skip = new Set(source);
  for (const id of deletedIds) skip.add(`bean:${id}`);
  return skip;
}

async function enforceDeletedBeans(deletedIds = new Set()) {
  if (!deletedIds.size) return 0;
  const localIds = new Set((await all('beans')).map(bean => String(bean.id)));
  let removed = 0;
  for (const id of deletedIds) {
    if (!localIds.has(String(id))) continue;
    await remove('beans', id);
    removed += 1;
  }
  return removed;
}

export async function buildLogicalPackets() {
  const built = await base.buildLogicalPackets();
  const mutations = await readBeanMutations();
  const packets = [...built.packets];
  splitRows(mutations.map(packBeanMutation)).forEach((rows, index) => {
    packets.push({
      logicalKey: `global:bean-mutations:${index}`,
      packet: {
        v: base.SYNC_SCHEMA_VERSION,
        f: base.SYNC_FORMAT,
        k: MUTATION_KIND,
        p: index,
        x: rows
      }
    });
  });
  packets.sort((a, b) => a.logicalKey.localeCompare(b.logicalKey));
  return {
    ...built,
    packets,
    counts: { ...built.counts, beanMutations: mutations.length }
  };
}

export function materializePackets(packets = [], options = {}) {
  return {
    ...base.materializePackets(withoutMutationPackets(packets), options),
    beanMutations: mutationRows(packets)
  };
}

export async function mergeRemotePacketsIntoLocal(packets = [], options = {}) {
  const mergedMutations = await mergeRemoteBeanMutations(mutationRows(packets));
  const deletedIds = activeDeletedBeanIds(mergedMutations);
  const result = await base.mergeRemotePacketsIntoLocal(withoutMutationPackets(packets), {
    ...options,
    skipUnitKeys: skipKeysWithDeletes(options, deletedIds)
  });
  const deletedByMutation = await enforceDeletedBeans(deletedIds);
  return {
    ...result,
    beanMutations: mergedMutations.length,
    deletedByMutation
  };
}

export async function restorePackets(packets = []) {
  const mergedMutations = await mergeRemoteBeanMutations(mutationRows(packets));
  const deletedIds = activeDeletedBeanIds(mergedMutations);
  const filtered = withoutMutationPackets(packets).filter(packet => {
    if (packet?.k !== 'bean-meta') return true;
    return !deletedIds.has(String(packet?.b?.[0] || ''));
  });
  const result = await base.restorePackets(filtered);
  const deletedByMutation = await enforceDeletedBeans(deletedIds);
  return {
    ...result,
    beanMutations: mergedMutations.length,
    deletedByMutation
  };
}
