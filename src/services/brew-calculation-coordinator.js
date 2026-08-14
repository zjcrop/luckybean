export const BREW_CALCULATION_COORDINATOR_CONTRACT = 'brew-calculation-coordinator/1.0';

function clone(value) { return structuredClone(value); }

function preserveExecutedProfile(input, previousPlan, beanId) {
  const next = clone(input);
  const previousBeanId = String(previousPlan?.beanId || '');
  const selected = String(next?.brew?.profileId || 'recommended');
  const previousProfileId = String(previousPlan?.profile?.id || '');
  if (selected === 'recommended' && previousProfileId && previousBeanId === String(beanId || '')) {
    next.brew.profileId = previousProfileId;
    next.calculation = {
      contract: BREW_CALCULATION_COORDINATOR_CONTRACT,
      mode: 'parameter-recalculation',
      preservedProfileId: previousProfileId
    };
  }
  return next;
}

export class BrewCalculationCoordinator {
  constructor(request) {
    if (typeof request !== 'function') throw new TypeError('计算协调器需要权威计算函数');
    this.request = request;
    this.revision = 0;
  }

  async calculate({ endpoint = '', input, previousPlan = null, beanId = '' }) {
    const revision = ++this.revision;
    const authoritativeInput = preserveExecutedProfile(input, previousPlan, beanId);
    const startedAt = performance.now();
    const plan = await this.request(endpoint, authoritativeInput);
    return {
      contract: BREW_CALCULATION_COORDINATOR_CONTRACT,
      plan,
      input: authoritativeInput,
      revision,
      latest: revision === this.revision,
      elapsedMs: Math.max(0, performance.now() - startedAt)
    };
  }

  invalidate() { this.revision += 1; }
}
