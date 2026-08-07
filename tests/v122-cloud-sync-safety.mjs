import assert from 'node:assert/strict';
import {
  analyzeRemoteDeletionRisk,
  deletionRiskFingerprintSource,
  mergePacketPreservingRemote,
  packetUnitEntries
} from '../src/services/cloud-sync-safety.js';

const remoteRecords = {
  k: 'bean-records',
  b: 'bean-a',
  x: [
    ['r', ['brew-1', 'remote-old']],
    ['s', ['sensory-1', 'remote-only']],
    ['i', ['inventory-1', 'remote-only']]
  ]
};
const localRecords = {
  k: 'bean-records',
  b: 'bean-a',
  x: [
    ['r', ['brew-1', 'local-update']]
  ]
};

const local = new Map([['same-chunk', localRecords]]);
const remote = new Map([
  ['same-chunk', remoteRecords],
  ['remote-only-chunk', { k: 'bean-meta', b: ['bean-b'] }]
]);

const risk = analyzeRemoteDeletionRisk(local, remote);
assert.equal(risk.requiresConfirmation, true);
assert.equal(risk.missingUnits, 3);
assert.equal(risk.remoteOnlyChunks, 1);
assert.equal(risk.largeDeletion, true);
assert.ok(risk.signatures.some(value => value.includes('sensory-1')));
assert.ok(risk.signatures.some(value => value.includes('inventory-1')));
assert.ok(risk.signatures.some(value => value.includes('bean-b')));

const merged = mergePacketPreservingRemote(localRecords, remoteRecords);
const mergedKeys = [...packetUnitEntries(merged).keys()];
assert.deepEqual(mergedKeys.sort(), ['i:inventory-1', 'r:brew-1', 's:sensory-1']);
assert.equal(merged.x.find(([kind]) => kind === 'r')[1][1], 'local-update');

const noDeletion = analyzeRemoteDeletionRisk(new Map([['same-chunk', merged]]), new Map([['same-chunk', remoteRecords]]));
assert.equal(noDeletion.requiresConfirmation, false);
assert.equal(noDeletion.missingUnits, 0);

const unknownBaseline = analyzeRemoteDeletionRisk(new Map(), new Map(), { baselineUnknown: true });
assert.equal(unknownBaseline.requiresConfirmation, true);
assert.equal(unknownBaseline.baselineUnknown, true);
assert.match(deletionRiskFingerprintSource(unknownBaseline), /baseline:unknown/);

console.log('v1.2.2 cloud deletion guard and preserve-only merge checks passed');
