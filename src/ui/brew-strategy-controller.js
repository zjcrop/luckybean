import { recommendProfile } from '../brew-engine-core.js';
import {
  BREW_STRATEGY_ORCHESTRATOR_CONTRACT,
  buildDifferentiatedBrewStrategies
} from '../services/brew-strategy-orchestrator.js';

export const BREW_STRATEGY_CONTROLLER_REVISION = 'p2-brew-strategy-controller/1.0';

function hasStrategyMetadata(plan) {
  return plan?.professional?.luckyBeanStrategies?.contract === BREW_STRATEGY_ORCHESTRATOR_CONTRACT;
}

function strategyMetadata(choices) {
  return {
    contract: BREW_STRATEGY_ORCHESTRATOR_CONTRACT,
    controller: BREW_STRATEGY_CONTROLLER_REVISION,
    architecture: 'outer-method-objective -> authoritative-parameter-fit',
    choices: choices.map(choice => ({
      strategyId: choice.strategy?.id || '',
      strategyLabel: choice.strategy?.label || '',
      profileId: choice.id,
      objective: choice.strategy?.objective || ''
    }))
  };
}

function applyStrategies(event) {
  const plan = event.detail?.plan;
  const input = event.detail?.input;
  if (!plan || !input || plan.correction || hasStrategyMetadata(plan)) return;

  // Cold recipes already carry dedicated ice/bypass semantics from BrewProfiles.
  // Do not force hot-filter structural profiles into that path in this iteration.
  if (String(input?.brew?.serveMode || 'hot') === 'cold') return;

  const authoritativeCandidates = Array.isArray(plan.recommendation?.candidates)
    ? plan.recommendation.candidates
    : [];
  const choices = buildDifferentiatedBrewStrategies(input, {
    recommend: recommendProfile,
    authoritativeCandidates
  });
  if (choices.length !== 3) return;

  plan.recommendation = {
    ...(plan.recommendation || {}),
    candidates: choices,
    candidateMode: 'luckybean-three-strategy'
  };
  plan.professional ||= {};
  plan.professional.luckyBeanStrategies = strategyMetadata(choices);
}

function decorateStrategyHeading(root = document) {
  const section = root.querySelector?.('.recommended-profile-options');
  const heading = section?.querySelector?.('h3');
  if (!heading) return;
  const text = section.textContent || '';
  if (!/清晰香气|甜感平衡|醇厚高萃/.test(text)) return;
  heading.textContent = '三种冲煮倾向';
}

document.addEventListener('luckybean:plan-ready', applyStrategies);

const observer = new MutationObserver(records => {
  for (const record of records) {
    if (record.type !== 'childList') continue;
    decorateStrategyHeading(document);
    break;
  }
});

const planHost = document.querySelector('#planResult');
if (planHost) observer.observe(planHost, { childList: true, subtree: true });
decorateStrategyHeading(document);

globalThis.LuckyBeanBrewStrategies = Object.freeze({
  revision: BREW_STRATEGY_CONTROLLER_REVISION,
  contract: BREW_STRATEGY_ORCHESTRATOR_CONTRACT
});
