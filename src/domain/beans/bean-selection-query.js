import { freshnessProfile } from '../../utils.js';

function text(value) { return String(value ?? '').normalize('NFKC').trim(); }
function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function dayStart(value) {
  const parsed = Date.parse(`${text(value)}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : null;
}
function dayEnd(value) {
  const parsed = Date.parse(`${text(value)}T23:59:59.999`);
  return Number.isFinite(parsed) ? parsed : null;
}
function dateTime(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function beanFreshnessStage(bean) {
  const ratio = Math.max(0, Math.min(1, Number(freshnessProfile(bean)?.progress || 0)));
  if (ratio < 1 / 3) return 'resting';
  if (ratio < 2 / 3) return 'peak';
  return 'late';
}

export function normalizeBeanSelectionCriteria(criteria = {}) {
  return {
    addedFrom: text(criteria.addedFrom),
    addedTo: text(criteria.addedTo),
    roastFrom: text(criteria.roastFrom),
    roastTo: text(criteria.roastTo),
    remainingMin: numberOrNull(criteria.remainingMin),
    remainingMax: numberOrNull(criteria.remainingMax),
    country: text(criteria.country),
    origin: text(criteria.origin),
    freshnessStage: text(criteria.freshnessStage)
  };
}

export function matchesBeanSelection(bean, criteria = {}, facts = {}) {
  const filter = normalizeBeanSelectionCriteria(criteria);
  const createdAt = dateTime(bean?.createdAt);
  const roastDate = dateTime(bean?.roastDate);
  const remaining = Number(bean?.remainingWeight || 0);

  const addedFrom = dayStart(filter.addedFrom);
  const addedTo = dayEnd(filter.addedTo);
  const roastFrom = dayStart(filter.roastFrom);
  const roastTo = dayEnd(filter.roastTo);
  if (addedFrom != null && (createdAt == null || createdAt < addedFrom)) return false;
  if (addedTo != null && (createdAt == null || createdAt > addedTo)) return false;
  if (roastFrom != null && (roastDate == null || roastDate < roastFrom)) return false;
  if (roastTo != null && (roastDate == null || roastDate > roastTo)) return false;
  if (filter.remainingMin != null && remaining < filter.remainingMin) return false;
  if (filter.remainingMax != null && remaining > filter.remainingMax) return false;

  const country = text(facts.country ?? bean?.countryName ?? bean?.country ?? bean?.countryCode);
  const origin = text(facts.origin ?? bean?.regionName ?? bean?.region ?? bean?.entityName ?? bean?.entity ?? bean?.processingStation ?? bean?.regionCode ?? bean?.entityCode);
  if (filter.country && country !== filter.country) return false;
  if (filter.origin && origin !== filter.origin) return false;
  if (filter.freshnessStage && beanFreshnessStage(bean) !== filter.freshnessStage) return false;
  return true;
}

export function queryBeansForSelection(beans = [], criteria = {}, factResolver = () => ({})) {
  return (beans || []).filter(bean => matchesBeanSelection(bean, criteria, factResolver(bean) || {}));
}

export function selectedBeanIds(beans = [], criteria = {}, factResolver = () => ({})) {
  return queryBeansForSelection(beans, criteria, factResolver).map(bean => String(bean.id)).filter(Boolean);
}
