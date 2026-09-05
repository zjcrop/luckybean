import fs from 'node:fs';

const file = 'src/app.js';
let source = fs.readFileSync(file, 'utf8');
const before = `async function refreshData() {
  state.beans = await all('beanSummaries');
  state.beans.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  state.data.beansReady = true; state.data.beansMode = 'summary'; updateLowStockIndicator();
}`;
const after = `async function refreshData() {
  performance?.mark?.('luckybean:bean-directory-start');
  state.beans = await all('beanSummaries');
  state.beans.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  // refreshData is the boundary back to the lightweight directory state. Never leave stale
  // bean-detail/history payloads resident or let a prior detailBeanId bypass a fresh indexed read.
  state.brewSessions = [];
  state.sensoryRecords = [];
  state.inventoryEvents = [];
  state.preferenceModel = null;
  state.recommendedIds = new Set();
  state.data.beansReady = true;
  state.data.beansMode = 'summary';
  state.data.detailBeanId = '';
  state.data.sensoryScope = 'none';
  state.data.sensoryBeanId = '';
  state.data.inventoryReady = false;
  performance?.mark?.('luckybean:bean-directory-ready');
  updateLowStockIndicator();
}`;
if (!source.includes(before)) throw new Error('refreshData follow-up anchor not found');
source = source.replace(before, after);
fs.writeFileSync(file, source);
console.log('Applied local-first follow-up invariants');
