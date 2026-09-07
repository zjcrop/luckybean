import { recommendProfile } from '../brew-engine-core.js';
import {
  BREW_STRATEGY_ORCHESTRATOR_CONTRACT,
  buildDifferentiatedBrewStrategies
} from '../services/brew-strategy-orchestrator.js';

export const BREW_STRATEGY_CONTROLLER_REVISION = 'p2-brew-strategy-controller/1.3';

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
      objective: choice.strategy?.objective || '',
      rankingDrivers: [...(choice.strategy?.rankingDrivers || [])],
      downstreamTargets: [...(choice.strategy?.downstreamTargets || [])]
    }))
  };
}

function applyStrategies(event) {
  const plan = event.detail?.plan;
  const input = event.detail?.input;
  if (!plan || !input || plan.correction || hasStrategyMetadata(plan)) return;
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

function surfaceStrategyOptions(root = document) {
  const planHost = root.querySelector?.('#planResult') || (root.id === 'planResult' ? root : document.querySelector('#planResult'));
  const section = planHost?.querySelector?.('.recommended-profile-options');
  const heading = section?.querySelector?.('h3');
  if (!section || !heading) return;
  const text = section.textContent || '';
  if (!/清晰香气|甜感平衡|醇厚高萃/.test(text)) return;

  const alreadySurfaced = section.classList.contains('brew-strategy-options')
    && !section.closest('details.professional-result')
    && heading.textContent === '三种冲煮倾向'
    && section.dataset.strategyContract === BREW_STRATEGY_ORCHESTRATOR_CONTRACT;
  if (alreadySurfaced) return;

  if (heading.textContent !== '三种冲煮倾向') heading.textContent = '三种冲煮倾向';
  if (!section.classList.contains('brew-strategy-options')) section.classList.add('brew-strategy-options');
  if (section.dataset.strategyContract !== BREW_STRATEGY_ORCHESTRATOR_CONTRACT) {
    section.dataset.strategyContract = BREW_STRATEGY_ORCHESTRATOR_CONTRACT;
  }

  const details = section.closest('details.professional-result');
  if (details?.parentNode) details.parentNode.insertBefore(section, details);
}

document.addEventListener('luckybean:plan-ready', applyStrategies);

let currentPlanHost = null;
let surfaceFrame = 0;
const planObserver = new MutationObserver(() => scheduleSurface());

function scheduleSurface() {
  if (surfaceFrame) return;
  surfaceFrame = requestAnimationFrame(() => {
    surfaceFrame = 0;
    surfaceStrategyOptions(currentPlanHost || document);
  });
}

function bindPlanHost() {
  const next = document.querySelector('#planResult');
  if (next === currentPlanHost) return;
  planObserver.disconnect();
  currentPlanHost = next;
  if (!currentPlanHost) return;
  planObserver.observe(currentPlanHost, { childList: true, subtree: true });
  scheduleSurface();
}

function recordTouchesPlanHost(record) {
  if (!currentPlanHost?.isConnected) return true;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return nodes.some(node => {
    if (node === currentPlanHost) return true;
    if (node?.nodeType !== 1) return false;
    return node.id === 'planResult' || Boolean(node.querySelector?.('#planResult')) || Boolean(node.contains?.(currentPlanHost));
  });
}

const shellRoot = document.querySelector('#appShell') || document.body;
const shellObserver = new MutationObserver(records => {
  if (!records.some(recordTouchesPlanHost)) return;
  bindPlanHost();
});
if (shellRoot) shellObserver.observe(shellRoot, { childList: true, subtree: true });
bindPlanHost();

globalThis.LuckyBeanBrewStrategies = Object.freeze({
  revision: BREW_STRATEGY_CONTROLLER_REVISION,
  contract: BREW_STRATEGY_ORCHESTRATOR_CONTRACT
});
