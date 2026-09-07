export const BREW_STRATEGY_ORCHESTRATOR_CONTRACT = 'luckybean-brew-strategy/1.0';

const SHARED_TARGET_IDS = Object.freeze(['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']);
const DEFAULT_TARGETS = Object.freeze({ acidity: 1.5, floral: 2, fruity: 2, sweetness: 2, bitterness: 2, astringency: 2 });

const STRATEGIES = Object.freeze([
  Object.freeze({
    id: 'clarity-aroma',
    label: '清晰香气',
    objective: '优先花果层次、明亮度与尾段洁净，方法层主动回避高体感遮蔽。',
    sharedShift: Object.freeze({ acidity: 0.35, floral: 0.75, fruity: 0.45, sweetness: 0.10, bitterness: 0.45, astringency: 0.55 }),
    internalBody: 0.8
  }),
  Object.freeze({
    id: 'sweet-balance',
    label: '甜感平衡',
    objective: '优先中段甜感回收与酸甜平衡，同时保留明确的抑苦、抑涩约束。',
    sharedShift: Object.freeze({ acidity: -0.05, floral: 0.10, fruity: 0.20, sweetness: 0.80, bitterness: 0.35, astringency: 0.35 }),
    internalBody: 1.5
  }),
  Object.freeze({
    id: 'body-extraction',
    label: '醇厚高萃',
    objective: '优先结构感、浓度与充分萃取的方法形态，但不取消苦涩风险约束。',
    sharedShift: Object.freeze({ acidity: -0.30, floral: -0.35, fruity: -0.10, sweetness: 0.35, bitterness: 0.10, astringency: 0.10 }),
    internalBody: 2.8
  })
]);

const clamp03 = value => Math.min(3, Math.max(0, Number(value) || 0));
const clone = value => structuredClone(value || {});

function normalizeTargets(targets = {}) {
  return Object.fromEntries(SHARED_TARGET_IDS.map(id => [id, clamp03(targets[id] ?? DEFAULT_TARGETS[id])]));
}

function projectedSharedTargets(baseTargets, strategy) {
  const base = normalizeTargets(baseTargets);
  return Object.fromEntries(SHARED_TARGET_IDS.map(id => [id, clamp03(base[id] + Number(strategy.sharedShift[id] || 0))]));
}

function methodRecommendationInput(input, strategy) {
  const next = clone(input);
  next.targets = {
    ...projectedSharedTargets(input?.targets, strategy),
    // body is deliberately local-only. The stable cross-project BrewProfiles
    // contract has six targets and must not be changed by LuckyBean P2.
    body: clamp03(strategy.internalBody)
  };
  return next;
}

function candidateId(candidate = {}) {
  return String(candidate.id || candidate.profileId || candidate.profile?.id || '').trim();
}

function normalizeCandidate(candidate = {}, authoritativeById = new Map()) {
  const id = candidateId(candidate);
  if (!id) return null;
  const authoritative = authoritativeById.get(id) || {};
  const profile = {
    ...(candidate.profile || {}),
    ...(authoritative.profile || {}),
    id
  };
  const score = Number(candidate.score ?? authoritative.score ?? 0);
  return {
    id,
    score: Number.isFinite(score) ? score : 0,
    reason: String(candidate.reason || authoritative.reason || ''),
    profile
  };
}

function pickDistinctCandidate(recommendation, authoritativeById, used) {
  const ranked = [recommendation?.selected, ...(recommendation?.candidates || [])]
    .map(candidate => normalizeCandidate(candidate, authoritativeById))
    .filter(Boolean);
  const unique = [...new Map(ranked.map(candidate => [candidate.id, candidate])).values()];
  return unique.find(candidate => !used.has(candidate.id)) || unique[0] || null;
}

function strategyLabel(strategy, selected) {
  const method = String(selected?.profile?.label || selected?.id || '').trim();
  return method ? `${strategy.label} · ${method}` : strategy.label;
}

/**
 * Outer-layer method orchestration for LuckyBean.
 *
 * Each strategy gets an independent local method-selection objective. The selected
 * profile is then handed back to the existing BrewProfiles path, which performs the
 * authoritative parameter calculation against the user's actual six-target contract.
 * This yields structurally different plans without mutating the shared protocol or
 * pretending a local trajectory is professional spatial output.
 */
export function buildDifferentiatedBrewStrategies(input = {}, {
  recommend,
  authoritativeCandidates = []
} = {}) {
  if (typeof recommend !== 'function') throw new TypeError('三策略编排需要方法推荐函数');

  const authoritativeById = new Map(
    (Array.isArray(authoritativeCandidates) ? authoritativeCandidates : [])
      .map(candidate => [candidateId(candidate), candidate])
      .filter(([id]) => id)
  );
  const used = new Set();
  const choices = [];

  for (const strategy of STRATEGIES) {
    const recommendationInput = methodRecommendationInput(input, strategy);
    const recommendation = recommend(recommendationInput) || {};
    const selected = pickDistinctCandidate(recommendation, authoritativeById, used);
    if (!selected) continue;
    used.add(selected.id);

    const sharedTargetProjection = projectedSharedTargets(input?.targets, strategy);
    choices.push({
      id: selected.id,
      score: selected.score,
      reason: `${strategy.objective} 方法层先锁定“${selected.profile?.label || selected.id}”，选择后仍由 BrewProfiles 按当前个人风味目标重新求解温度、研磨、流量、时间与分段。`,
      profile: { ...selected.profile, id: selected.id, label: strategyLabel(strategy, selected) },
      strategy: {
        contract: BREW_STRATEGY_ORCHESTRATOR_CONTRACT,
        id: strategy.id,
        label: strategy.label,
        objective: strategy.objective,
        sharedTargetProjection
      }
    });
  }

  return choices.slice(0, 3);
}

export function brewStrategyDefinitions() {
  return STRATEGIES.map(strategy => ({
    id: strategy.id,
    label: strategy.label,
    objective: strategy.objective,
    sharedShift: { ...strategy.sharedShift }
  }));
}
