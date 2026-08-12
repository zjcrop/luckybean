import { createHash } from 'node:crypto';

export const BREWPROFILES_ENDPOINT = 'https://vaxwncdcuvbpvdbbketb.supabase.co/**';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function fingerprint(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

const profileIds = [
  'one-pour', 'two-pulse', 'three-pulse', 'four-stage', 'four-six-v17',
  'four-six-33666', 'flat46-clean', 'five-pulse', 'pulse-30x15',
  'cbrc-2026-01-zhong-jingjing', 'cbrc-2026-02-liang-baoyi',
  'cbrc-2026-03-wu-minwei', 'cbrc-2026-04-yang-xiao',
  'cbrc-2026-05-zhang-xiaobo', 'cbrc-2026-06-qu-yongxiang'
];

const catalog = {
  contract: 'brew-profile-catalog/1.0',
  apiVersion: '2.0.0',
  engineVersion: 'brewprofiles-test-fixture/1.0.0',
  generatedAt: '2026-08-07T00:00:00.000Z',
  catalogHash: 'sha256:browser-fixture',
  profiles: profileIds.map(id => ({
    id, version: '2.0.0', label: id, status: 'published', category: 'test',
    tags: [], compatibleDripperGroups: [], autoRecommend: false
  }))
};

function analysisFor(input) {
  const inputFingerprint = fingerprint(input);
  const profileId = String(input?.brew?.profileId || 'recommended');
  const planFingerprint = `sha256:plan-${inputFingerprint.slice(7)}`;
  const dose = Number(input?.brew?.doseG || 15);
  const ratio = Number(input?.brew?.ratio || 15.5);
  const water = Math.round(dose * ratio);
  const expectedStageCounts = {
    'one-pour': 1, 'two-pulse': 2, 'three-pulse': 3, 'four-stage': 4,
    'four-six-v17': 5, 'four-six-33666': 5, 'flat46-clean': 5, 'five-pulse': 5,
    'hoffmann-one-cup': 5, 'april-two-pour': 2, 'matt-winton-five': 5,
    'lance-daily-two': 2, 'switch-hybrid-50-50': 2, 'mugen-one-pour': 1,
    'onyx-center-spiral': 5
  };
  const stageCount = expectedStageCounts[profileId] || 3;
  const stages = Array.from({ length: stageCount }, (_, index) => {
    const start = index === 0 ? 0 : Math.round((125 * index) / stageCount);
    const end = index === stageCount - 1 ? 125 : Math.round((125 * (index + 1)) / stageCount);
    const cumulative = Math.round((water * (index + 1)) / stageCount);
    const previous = index === 0 ? 0 : Math.round((water * index) / stageCount);
    return {
      index: index + 1, name: index === 0 ? '闷蒸' : `主体${index}`,
      start, end, pour: cumulative - previous, cumulative,
      temperatureC: index === 0 ? 88 : 90, bedTemperatureEnd: 72 + index * 4, flow: 4.2
    };
  });
  const path = Array.from({ length: 24 }, (_, index) => [
    index * 5,
    25 + Math.min(62, index * 2.8),
    Math.min(water, Math.round((water * index) / 23))
  ]);
  const targets = ['acidity', 'floral', 'fruity', 'sweetness', 'bitterness', 'astringency']
    .map((id, targetIndex) => ({
      id, label: id, points: Array.from({ length: 12 }, (_, index) => [
        index / 11, (targetIndex + 1) / 6, (index + targetIndex) / 18
      ]), extractionStages: [1, 2, 3], risk: 'fixture'
    }));
  const trajectory = {
    schemaVersion: 'brew-spatial/1.2',
    generatedBy: 'brewprofiles-browser-fixture/1.0.0',
    planFingerprint,
    axes: {
      x: { id: 'time_s', label: '时间', unit: 's' },
      y: { id: 'bed_temperature_c', label: '粉床温度', unit: '°C' },
      z: { id: 'cumulative_water_g', label: '累计注水量', unit: 'g' }
    },
    path, targets, signals: {}, aggregate: { positive: [], negative: [], net: [] },
    summary: [], prediction: { suitability: 0.8, verdict: 'browser fixture', strengths: [], risks: [], confidence: 'test' }
  };
  const plan = {
    metadata: { fingerprint: planFingerprint, profileId, profileVersion: '2.0.0' },
    profile: { id: profileId, version: '2.0.0', label: profileId },
    stages,
    totals: { doseG: dose, waterG: water, ratio, targetTimeSec: 125 },
    summary: { dose, totalWater: water, ratio, totalTime: 125 },
    warnings: [],
    temperature: { model: { markers: [], sensitivityText: 'fixture', execution: 'fixture' } },
    professional: { calculationModelVersion: 'fixture/1.0.0' }
  };
  return {
    contract: 'brew-analysis/2.0',
    requestId: `fixture-${inputFingerprint.slice(7, 23)}`,
    generatedAt: '2026-08-07T00:00:00.000Z',
    analysisFingerprint: fingerprint({ input, planFingerprint }),
    metadata: {
      inputFingerprint, planFingerprint, requestedProfileId: profileId,
      resolvedProfileId: profileId, resolvedProfileVersion: '2.0.0', engineVersion: 'fixture/1.0.0'
    },
    input, plan, trajectory,
    prediction: trajectory.prediction, integrations: {}, warnings: []
  };
}

export async function installBrewProfilesBrowserFixture(page) {
  // These tests exercise a specific feature after startup. Suppress the first-use guide in the
  // isolated test context so it cannot intercept unrelated control clicks while remaining unchanged
  // in production.
  await page.addInitScript(() => {
    const removeGuide = () => document.querySelector('[data-lb-onboarding]')?.remove();
    document.addEventListener('DOMContentLoaded', () => {
      removeGuide();
      new MutationObserver(removeGuide).observe(document.documentElement, { childList: true, subtree: true });
    }, { once: true });
  });
  await page.route(BREWPROFILES_ENDPOINT, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.searchParams.get('mode') === 'profiles') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) });
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/brew-analyze-v2')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFor(JSON.parse(request.postData() || '{}'))) });
    }
    return route.abort('failed');
  });
}
