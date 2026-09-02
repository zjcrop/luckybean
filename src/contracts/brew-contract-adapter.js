import { buildBrewResult } from '../brew-result-schema.js';

export const BREW_PLAN_SCHEMA_VERSION = 'brew-plan/1.0';
export const BREW_CONTRACT_ADAPTER_VERSION = 'luckybean-brew-contract-adapter/1.24P.1';

const STAGE_TYPES = new Set(['BLOOM', 'POUR', 'STEEP', 'STIR', 'RELEASE', 'DRAIN', 'COOL']);
const MOTIONS = new Set(['CENTER', 'SMALL_CIRCLE', 'CIRCLE', 'SPIRAL_OUT', 'SPIRAL_IN', 'NONE']);

function finiteOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeStageType(stage = {}, index = 0) {
  const explicit = String(stage.stageType || '').toUpperCase();
  if (STAGE_TYPES.has(explicit)) return explicit;
  const text = `${stage.name || ''} ${stage.method || ''} ${stage.notice || ''}`.toLowerCase();
  if (/闷蒸|bloom|预浸|pre[- ]?infusion/.test(text)) return 'BLOOM';
  if (/浸泡|steep|immersion/.test(text)) return 'STEEP';
  if (/搅拌|stir|swirl/.test(text)) return 'STIR';
  if (/释放|开阀|release/.test(text)) return 'RELEASE';
  if (/排液|滤完|drain/.test(text)) return 'DRAIN';
  if (/降温|冷却|加冰|cool|ice/.test(text)) return 'COOL';
  return index === 0 && Number(stage.stageWaterG || 0) > 0 && /润湿|排气/.test(text) ? 'BLOOM' : 'POUR';
}

function normalizeMotion(stage = {}) {
  const explicit = String(stage.motion || '').toUpperCase();
  if (MOTIONS.has(explicit)) return explicit;
  const text = `${stage.method || ''} ${stage.notice || ''}`.toLowerCase();
  if (/螺旋.*向外|spiral.*out/.test(text)) return 'SPIRAL_OUT';
  if (/螺旋.*向内|spiral.*in/.test(text)) return 'SPIRAL_IN';
  if (/小圈|small circle/.test(text)) return 'SMALL_CIRCLE';
  if (/绕圈|圆周|circle|circular/.test(text)) return 'CIRCLE';
  if (/中心|center/.test(text)) return 'CENTER';
  return 'NONE';
}

function normalizeValveState(stage = {}) {
  const explicit = String(stage.valveState || '').toUpperCase();
  if (explicit === 'OPEN' || explicit === 'CLOSED') return explicit;
  const text = `${stage.name || ''} ${stage.method || ''} ${stage.notice || ''}`.toLowerCase();
  if (/关阀|关闭|closed/.test(text)) return 'CLOSED';
  return 'OPEN';
}

function inferBrewType(plan = {}, input = {}, canonicalStages = []) {
  const serveMode = String(input?.brew?.serveMode || plan?.serveMode || '').toLowerCase();
  const profileId = String(plan?.profile?.id || input?.brew?.profileId || '').toLowerCase();
  if (serveMode === 'cold' || /ice|iced|flash/.test(profileId)) return 'ICE_BREW';
  if (/switch|immersion/.test(profileId) || canonicalStages.some(stage => stage.valveState === 'CLOSED' || stage.stageType === 'STEEP' || stage.stageType === 'RELEASE')) {
    return 'IMMERSION_RELEASE';
  }
  return 'POUR_OVER';
}

export function toCanonicalBrewPlan(plan = {}, input = {}) {
  const sourceStages = Array.isArray(plan.stages) ? plan.stages : [];
  const stages = sourceStages.map((stage, index) => {
    const canonical = {
      stageType: normalizeStageType(stage, index),
      waterG: finiteOrUndefined(stage.stageWaterG ?? stage.waterG),
      temperatureC: finiteOrUndefined(stage.temperatureC),
      durationSec: finiteOrUndefined(stage.durationSec),
      motion: normalizeMotion(stage),
      valveState: normalizeValveState(stage)
    };
    return Object.fromEntries(Object.entries(canonical).filter(([, value]) => value !== undefined));
  });
  return {
    schemaVersion: BREW_PLAN_SCHEMA_VERSION,
    brewType: inferBrewType(plan, input, stages),
    stages
  };
}

function findFlavorSource(plan = {}) {
  const sources = [plan.flavor, plan.analysis?.flavor, plan.professional?.flavor, plan.optimizer?.flavor];
  return sources.find(source => source && typeof source === 'object' && !Array.isArray(source)) || {};
}

function inferUncertainty(plan = {}) {
  if (plan.uncertainty && typeof plan.uncertainty === 'object') return plan.uncertainty;
  const authoritative = plan.executionSource === 'brew-profiles-authoritative';
  return { level: authoritative ? 'medium' : 'high', range: null };
}

export function attachBrewContracts(plan = {}, input = {}) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new TypeError('冲煮结果必须是对象');
  const brewPlan = toCanonicalBrewPlan(plan, input);
  const brewResult = buildBrewResult({
    input,
    physical: {
      temperature: plan.temperature || plan.professional?.temperature || null,
      trajectory: Array.isArray(plan.trajectory) ? plan.trajectory : [],
      stages: brewPlan.stages,
      extraction: plan.extraction || plan.analysis?.extraction || null
    },
    flavor: findFlavorSource(plan),
    uncertainty: inferUncertainty(plan)
  });
  return {
    ...plan,
    contracts: {
      ...(plan.contracts || {}),
      adapterVersion: BREW_CONTRACT_ADAPTER_VERSION,
      brewPlan,
      brewResult
    }
  };
}
