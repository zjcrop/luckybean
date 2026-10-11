import { getSetting, setSetting } from '../../db.js';
import { beanGroupState, setBeanGroupMode } from './bean-group-state.js';

const MODE_KEY = 'v099i.group.mode';
const LEGACY_MODE_KEY = 'v099f.group.mode';
const LEGACY_GROUP_KEY = 'luckybean.group.method.v098';
const MODES = new Set(['native', 'freshness-ratio', 'remaining-50']);
let loading;
let loaded = false;
let generation = 0;
let saving = Promise.resolve();

export function loadBeanGroupMode({ force = false } = {}) {
  if (loading) return loading;
  if (loaded && !force) return Promise.resolve(beanGroupState.mode);
  const version = generation;
  loading = Promise.all([getSetting(MODE_KEY, null), getSetting(LEGACY_MODE_KEY, 'native')])
    .then(async ([saved, legacy]) => {
      const oldGroup = localStorage.getItem(LEGACY_GROUP_KEY) || '';
      // An explicit saved native mode must win over stale migration keys.
      const mode = MODES.has(saved) ? saved : legacy === 'freshness'
        ? 'freshness-ratio' : oldGroup === 'remaining-50' ? 'remaining-50' : 'native';
      if (!MODES.has(saved)) await setSetting(MODE_KEY, mode);
      await setSetting(LEGACY_MODE_KEY, 'native');
      if (oldGroup === 'remaining-50' || oldGroup === 'freshness-state') localStorage.setItem(LEGACY_GROUP_KEY, 'roast');
      if (version === generation) setBeanGroupMode(mode);
      loaded = true;
      return beanGroupState.mode;
    }).finally(() => { loading = null; });
  return loading;
}

export function saveBeanGroupMode(mode) {
  const next = MODES.has(mode) ? mode : 'native';
  generation += 1;
  loaded = true;
  setBeanGroupMode(next);
  saving = saving.catch(() => {}).then(async () => {
    if (loading) await loading;
    await setSetting(MODE_KEY, next);
    await setSetting(LEGACY_MODE_KEY, 'native');
    localStorage.setItem(LEGACY_GROUP_KEY, 'roast');
  });
  return saving;
}
