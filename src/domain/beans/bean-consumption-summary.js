// Reference basis:
// FDA: up to 400 mg/day is not generally associated with negative effects for most adults.
// https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much
// Arabica dry mass reference: about 12 mg caffeine/g (Silvarolla et al., Nature 2004, doi:10.1038/429826a).
// Sleep buffer: substantial caffeine can disrupt sleep even 6 hours before bedtime (Drake et al., 2013, doi:10.5664/jcsm.3170).
export const DEFAULT_CAFFEINE_HEALTH_SETTINGS = Object.freeze({
  dailyCaffeineLimitMg: 400,
  arabicaCaffeineMgPerBeanG: 12,
  robustaCaffeineMgPerBeanG: 22,
  decafCaffeineMgPerBeanG: 1,
  bedtimeLocal: '23:00',
  caffeineCutoffHours: 6
});

const CONSUMPTION_TYPES = new Set(['consume', 'brew-consume']);
const RESTORE_TYPES = new Set(['restore-brew-deletion']);

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function beanCaffeineFactor(bean = {}, settings = DEFAULT_CAFFEINE_HEALTH_SETTINGS) {
  const searchable = JSON.stringify(bean).toLowerCase();
  if (/decaf|低因|脱因|去咖啡因/.test(searchable)) return finiteNonNegative(settings.decafCaffeineMgPerBeanG) || 1;
  if (/robusta|canephora|罗布斯塔|卡内弗拉/.test(searchable)) return finiteNonNegative(settings.robustaCaffeineMgPerBeanG) || 22;
  return finiteNonNegative(settings.arabicaCaffeineMgPerBeanG) || 12;
}

function bedtimeAndBufferMinutes(settings) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(settings.bedtimeLocal || ''));
  const bedtime = match ? Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2])) : 23 * 60;
  const buffer = Math.min(12, Math.max(1, Number(settings.caffeineCutoffHours) || 6)) * 60;
  return { bedtime, buffer };
}

function isInsideSleepBuffer(date, settings) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const { bedtime, buffer } = bedtimeAndBufferMinutes(settings);
  return (bedtime - minutes + 1440) % 1440 <= buffer;
}

/**
 * Inventory events are the authoritative evidence for bean consumption. Brew plans and
 * sensory records are deliberately excluded so a completed brew cannot be counted twice.
 */
export function buildBeanConsumptionSummary({ beans = [], inventoryEvents = [], now = new Date(), healthSettings = {} } = {}) {
  const settings = { ...DEFAULT_CAFFEINE_HEALTH_SETTINGS, ...(healthSettings || {}) };
  const beanById = new Map(beans.map(bean => [bean.id, bean]));
  const today = localDayKey(now);
  const totalRemainingG = beans.reduce((sum, bean) => sum + finiteNonNegative(bean.remainingWeight), 0);
  const eventsToday = inventoryEvents
    .map(event => ({ event, at: new Date(event.createdAt) }))
    .filter(({ at }) => Number.isFinite(at.getTime()) && localDayKey(at) === today)
    .sort((a, b) => a.at - b.at);

  const restoredSourceIds = new Set(eventsToday
    .filter(({ event }) => Number(event.amountG) > 0 && RESTORE_TYPES.has(String(event.type || '')) && event.sourceEventId)
    .map(({ event }) => String(event.sourceEventId)));
  const activeConsumptions = [];
  let unmatchedRestoredG = 0;
  let unmatchedRestoredCaffeineMg = 0;
  for (const { event, at } of eventsToday) {
    const amount = Number(event.amountG);
    if (!Number.isFinite(amount)) continue;
    if (amount < 0 && CONSUMPTION_TYPES.has(String(event.type || 'consume'))) {
      if (restoredSourceIds.has(String(event.id || ''))) continue;
      const grams = Math.abs(amount);
      activeConsumptions.push({ grams, caffeineMg: grams * beanCaffeineFactor(beanById.get(event.beanId), settings), at });
    } else if (amount > 0 && RESTORE_TYPES.has(String(event.type || '')) && !event.sourceEventId) {
      const grams = amount;
      unmatchedRestoredG += grams;
      unmatchedRestoredCaffeineMg += grams * beanCaffeineFactor(beanById.get(event.beanId), settings);
    }
  }
  const grossConsumedG = activeConsumptions.reduce((sum, item) => sum + item.grams, 0);
  const grossCaffeineMg = activeConsumptions.reduce((sum, item) => sum + item.caffeineMg, 0);
  const consumedG = Math.max(0, grossConsumedG - unmatchedRestoredG);
  const estimatedCaffeineMg = Math.max(0, grossCaffeineMg - unmatchedRestoredCaffeineMg);
  const latestConsumedAt = consumedG > 0 ? activeConsumptions.at(-1)?.at || null : null;

  const dailyLimitMg = Math.min(400, finiteNonNegative(settings.dailyCaffeineLimitMg) || 400);
  const remainingCaffeineMg = Math.max(0, dailyLimitMg - estimatedCaffeineMg);
  const referenceMgPerG = finiteNonNegative(settings.arabicaCaffeineMgPerBeanG) || 12;
  const remainingReferenceBeanG = remainingCaffeineMg / referenceMgPerG;
  const exceeded = estimatedCaffeineMg > dailyLimitMg + 0.001;
  const late = Boolean(latestConsumedAt && isInsideSleepBuffer(latestConsumedAt, settings));

  return {
    totalRemainingG,
    totalRemainingKg: totalRemainingG / 1000,
    consumedTodayG: consumedG,
    estimatedCaffeineMg,
    dailyLimitMg,
    remainingCaffeineMg,
    remainingReferenceBeanG,
    exceeded,
    late,
    latestConsumedAt,
    bedtimeLocal: settings.bedtimeLocal,
    caffeineCutoffHours: settings.caffeineCutoffHours
  };
}
