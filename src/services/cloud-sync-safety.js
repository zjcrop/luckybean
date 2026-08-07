const clone = value => globalThis.structuredClone
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function rowIdentity(kind, row, index) {
  const id = Array.isArray(row) && row[0] != null && String(row[0])
    ? String(row[0])
    : `row-${index}-${JSON.stringify(row)}`;
  return `${kind}:${id}`;
}

function customCodeIdentity(row, index) {
  const id = row?.id || row?.code || row?.key || row?.name || `row-${index}`;
  return `custom:${String(id)}`;
}

export function packetUnitEntries(packet = {}) {
  const entries = new Map();
  if (packet.k === 'bean-meta' && Array.isArray(packet.b)) {
    const id = String(packet.b[0] || 'unknown');
    entries.set(`bean:${id}`, { kind: 'bean-meta', value: packet.b });
    return entries;
  }
  if (packet.k === 'bean-records' || packet.k === 'orphan') {
    (packet.x || []).forEach((entry, index) => {
      const kind = String(entry?.[0] || 'record');
      const row = entry?.[1];
      entries.set(rowIdentity(kind, row, index), { kind, value: entry });
    });
    return entries;
  }
  if (packet.k === 'settings') {
    (packet.c || []).forEach((row, index) => {
      entries.set(customCodeIdentity(row, index), { kind: 'custom-code', value: row });
    });
  }
  return entries;
}

export function mergePacketPreservingRemote(localPacket = {}, remotePacket = {}) {
  const local = clone(localPacket);
  if ((local.k === 'bean-records' || local.k === 'orphan') && local.k === remotePacket.k) {
    const localEntries = packetUnitEntries(local);
    const merged = [...(local.x || [])];
    for (const [key, entry] of packetUnitEntries(remotePacket)) {
      if (!localEntries.has(key)) merged.push(clone(entry.value));
    }
    local.x = merged;
    return local;
  }
  if (local.k === 'settings' && remotePacket.k === 'settings') {
    const localEntries = packetUnitEntries(local);
    const merged = [...(local.c || [])];
    for (const [key, entry] of packetUnitEntries(remotePacket)) {
      if (!localEntries.has(key)) merged.push(clone(entry.value));
    }
    local.c = merged;
    return local;
  }
  return local;
}

export function analyzeRemoteDeletionRisk(localPackets = new Map(), remotePackets = new Map(), { baselineUnknown = false } = {}) {
  const missing = [];
  const remoteOnlyChunkIds = [];
  let remoteUnits = 0;
  let comparedChunks = 0;

  for (const [chunkId, remotePacket] of remotePackets) {
    const remoteEntries = packetUnitEntries(remotePacket);
    remoteUnits += remoteEntries.size;
    const localPacket = localPackets.get(chunkId);
    if (!localPacket) {
      remoteOnlyChunkIds.push(chunkId);
      for (const key of remoteEntries.keys()) missing.push({ chunkId, key, wholeChunk: true });
      continue;
    }
    comparedChunks += 1;
    const localEntries = packetUnitEntries(localPacket);
    for (const key of remoteEntries.keys()) {
      if (!localEntries.has(key)) missing.push({ chunkId, key, wholeChunk: false });
    }
  }

  const missingUnits = missing.length;
  const ratio = remoteUnits ? missingUnits / remoteUnits : 0;
  const signatures = missing.map(item => `${item.chunkId}|${item.key}`).sort();
  if (baselineUnknown) signatures.unshift('baseline:unknown');

  return {
    requiresConfirmation: Boolean(baselineUnknown || missingUnits),
    baselineUnknown: Boolean(baselineUnknown),
    missingUnits,
    remoteUnits,
    ratio,
    largeDeletion: missingUnits >= 5 || ratio >= 0.2,
    remoteOnlyChunks: remoteOnlyChunkIds.length,
    remoteOnlyChunkIds,
    comparedChunks,
    signatures
  };
}

export function deletionRiskFingerprintSource(risk = {}) {
  return JSON.stringify({
    baselineUnknown: Boolean(risk.baselineUnknown),
    signatures: [...(risk.signatures || [])].sort()
  });
}
