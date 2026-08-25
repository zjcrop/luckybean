export const beanGroupState = { mode: 'native', groupKey: '' };

export function setBeanGroupMode(mode) {
  const next = String(mode || 'native');
  if (beanGroupState.mode !== next) beanGroupState.groupKey = '';
  beanGroupState.mode = next;
  return beanGroupState.mode;
}

export function hasActiveBeanGroup() {
  return Boolean(beanGroupState.groupKey);
}

export function openBeanGroupState(groupKey) {
  beanGroupState.groupKey = String(groupKey || '');
  return beanGroupState.groupKey;
}

export function closeBeanGroupState() {
  const changed = Boolean(beanGroupState.groupKey);
  beanGroupState.groupKey = '';
  return changed;
}
