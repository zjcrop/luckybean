import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeGearRows } from '../src/cloud-codec.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const codec = read('src/cloud-codec.js');

const filters = [{ id: 'filter-1', brand: 'Cafec', type: 'Abaca', quantity: 37, price: 0.6, updatedAt: '2026-08-11T12:00:00.000Z' }];
const drippers = [{ id: 'dripper-1', name: 'V60', type: '锥形滤杯', material: 'plastic', price: 45, updatedAt: '2026-08-11T12:00:00.000Z' }];
const grinders = [{ id: 'grinder-1', name: 'Comandante C40', setting: '24 clicks', price: 1800, updatedAt: '2026-08-11T12:00:00.000Z' }];

assert.deepEqual(normalizeGearRows(filters, 'filter'), filters);
assert.deepEqual(normalizeGearRows(drippers, 'dripper'), drippers);
assert.deepEqual(normalizeGearRows(grinders, 'grinder'), grinders);
assert.deepEqual(normalizeGearRows('[object Object],[object Object]', 'grinder'), [], 'corrupted 1.23D/early-1.23E grinder placeholders must be ignored safely');
assert.equal(normalizeGearRows('C40、EK43', 'grinder').length, 2, 'legacy grinder-name strings must remain recoverable');

assert.match(codec, /filters:\s*normalizeGearRows\(sourceGear\.filters, 'filter'\)/);
assert.match(codec, /drippers:\s*normalizeGearRows\(sourceGear\.drippers, 'dripper'\)/);
assert.match(codec, /grinders:\s*normalizeGearRows\(sourceGear\.grinders, 'grinder'\)/);
assert.doesNotMatch(codec, /grinders:\s*String\(sourceGear\.grinders/);
assert.match(codec, /filters:\s*mergeGearRows\(local\?\.gear\?\.filters[^\n]+data\.settings\.gear\?\.filters/);
assert.match(codec, /const remote = normalizeGearRows\(remoteRows, kind\)/);

console.log('LuckyBean 1.23E gear cloud-sync compatibility checks passed');
