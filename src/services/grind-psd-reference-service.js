const GRIND_PSD_DATABASE_URL = 'https://raw.githubusercontent.com/zjcrop/Grind-PSD/main/data/database.json';
const CACHE_KEY = 'luckybean.grindPsdReference.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalize(value='') {
  return String(value || '').trim().toLocaleLowerCase('zh-CN').replace(/[\s._-]+/g, '');
}

function safeCacheRead() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!value || !value.savedAt || Date.now() - value.savedAt > CACHE_TTL_MS) return null;
    return value.data || null;
  } catch { return null; }
}

function safeCacheWrite(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt:Date.now(), data })); } catch {}
}

export async function loadGrindPsdReference({ force=false } = {}) {
  if (!force) {
    const cached = safeCacheRead();
    if (cached) return { data:cached, source:'cache' };
  }
  const response = await fetch(GRIND_PSD_DATABASE_URL, { cache:'no-store' });
  if (!response.ok) throw new Error(`Grind-PSD 数据读取失败（HTTP ${response.status}）`);
  const data = await response.json();
  if (!data || !Array.isArray(data.records)) throw new Error('Grind-PSD 数据结构无效');
  safeCacheWrite(data);
  return { data, source:'github' };
}

export function findGrinderRecords(database, grinder={}) {
  const brand = normalize(grinder.brand || grinder.manufacturer || '');
  const model = normalize(grinder.model || grinder.name || '');
  return (database?.records || []).filter(record => {
    const rb = normalize(record?.grinder?.brand || '');
    const rm = normalize(record?.grinder?.model || '');
    if (brand && model) return rb === brand && rm === model;
    if (model) return rm === model || normalize(`${rb}${rm}`) === model;
    return false;
  }).filter(record => record?.grinder?.setting != null);
}

function numericSetting(record) {
  const setting = Number(record?.grinder?.settingOrder ?? record?.grinder?.setting);
  return Number.isFinite(setting) ? setting : null;
}

export function summarizeGrindPsdReference(records=[]) {
  const usable = records.map(record => ({ record, setting:numericSetting(record) })).filter(row => row.setting != null);
  if (!usable.length) return { status:'none', count:0, message:'Grind-PSD 暂无对应设备的可用实测记录。' };
  const settings = usable.map(row => row.setting).sort((a,b)=>a-b);
  const qualities = usable.map(row => row.record?.metrics?.quality?.grade).filter(Boolean);
  const modeBins = [...new Set(usable.map(row => row.record?.metrics?.modeBin).filter(Boolean))];
  if (settings.length === 1) {
    const row = usable[0];
    return {
      status:'single-point', count:1, setting:String(row.record.grinder.setting), settingOrder:row.setting,
      quality:row.record?.metrics?.quality || null, modeBin:row.record?.metrics?.modeBin || '',
      message:`Grind-PSD 仅有 1 个可比实测点：刻度 ${row.record.grinder.setting}${row.record?.metrics?.modeBin ? `，主峰 ${row.record.metrics.modeBin}` : ''}。样本不足，不能据此推导研磨范围。`
    };
  }
  const min=settings[0], max=settings.at(-1);
  return {
    status:'range', count:settings.length, min, max, qualities, modeBins,
    message:`Grind-PSD 有 ${settings.length} 个实测点，观测刻度范围 ${min}–${max}。该范围仅表示现有样本覆盖，不等同于方案推荐范围。`
  };
}

export function mapCustomGrinderRange(grinder={}, target=0.5, tolerance=0.08) {
  const fine=Number(grinder.fineAnchor), mid=Number(grinder.midAnchor), coarse=Number(grinder.coarseAnchor);
  if (![fine,mid,coarse].every(Number.isFinite)) return null;
  const map = t => t <= 0.5 ? fine + (mid-fine)*(t/0.5) : mid + (coarse-mid)*((t-0.5)/0.5);
  const lo=Math.max(0,Math.min(1,Number(target)-tolerance));
  const hi=Math.max(0,Math.min(1,Number(target)+tolerance));
  const a=map(lo), b=map(hi);
  return { min:Math.min(a,b), max:Math.max(a,b), center:map(Math.max(0,Math.min(1,Number(target)))) };
}

export async function grinderReference(grinder, options={}) {
  try {
    const {data,source}=await loadGrindPsdReference(options);
    const records=findGrinderRecords(data,grinder);
    return { ...summarizeGrindPsdReference(records), source, databaseUpdatedAt:data.updatedAt || null };
  } catch (error) {
    return { status:'unavailable', count:0, source:'error', message:`Grind-PSD 暂时无法读取：${error.message}` };
  }
}

export { GRIND_PSD_DATABASE_URL };
