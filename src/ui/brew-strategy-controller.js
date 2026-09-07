import { recommendProfile } from '../brew-engine-core.js';
import {
  BREW_STRATEGY_ORCHESTRATOR_CONTRACT,
  buildDifferentiatedBrewStrategies
} from '../services/brew-strategy-orchestrator.js';

export const BREW_STRATEGY_CONTROLLER_REVISION = 'p2-brew-strategy-controller/1.2';

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

let surfaceQueued = false;
function scheduleSurface() {
  if (surfaceQueued) return;
  surfaceQueued = true;
  requestAnimationFrame(() => {
    surfaceQueued = false;
    surfaceStrategyOptions(document);
  });
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

  // plan-ready is emitted before the normal renderer has necessarily committed
  // its DOM. Queue a post-render pass; the stable-root observer below covers
  // subsequent #planResult replacement as well.
  scheduleSurface();
}

function surfaceStrategyOptions(root = document) {
  const planHost = root.querySelector?.('#planResult') || document.querySelector('#planResult');
  const section = planHost?.querySelector?.('.recommended-profile-options');
  const heading = section?.querySelector?.('h3');
  if (!section || !heading) return;
  const text = section.textContent || '';
  if (!/清晰香气|甜感平衡|醇厚高萃/.test(text)) return;

  heading.textContent = '三种冲煮倾向';
  section.classList.add('brew-strategy-options');
  section.dataset.strategyContract = BREW_STRATEGY_ORCHESTRATOR_CONTRACT;

  // The original plan renderer places candidate buttons inside the professional
  // details block. Move the same live nodes above that block so existing click
  // listeners remain attached and the choices are visible before deep details.
  const details = section.closest('details.professional-result');
  if (!details) return;
  if (details.parentNode) details.parentNode.insertBefore(section, details);
}

document.addEventListener('luckybean:plan-ready', applyStrategies);

// #planResult may be replaced by page rendering. Observe a stable ancestor
// instead of retaining a reference to a stale result node.
const observerRoot = document.querySelector('#appShell') || document.body || document.documentElement;
const observer = new MutationObserver(records => {
  if (records.some(record => record.type === 'childList')) scheduleSurface();
});
if (observerRoot) observer.observe(observerRoot, { childList: true, subtree: true });
scheduleSurface();

globalThis.LuckyBeanBrewStrategies = Object.freeze({
  revision: BREW_STRATEGY_CONTROLLER_REVISION,
  contract: BREW_STRATEGY_ORCHESTRATOR_CONTRACT
});
