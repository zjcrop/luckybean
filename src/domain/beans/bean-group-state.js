export const beanGroupState = { groupKey: '' };

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
