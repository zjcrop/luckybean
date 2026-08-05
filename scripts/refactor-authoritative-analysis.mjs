import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/brew-engine.js';
let source = await readFile(path, 'utf8');

const importMarker = "import * as core from './brew-engine-core.js';\n";
const serviceImport = "import { requestAuthoritativePlan } from './services/brew-analysis-service.js';\n";
if (!source.includes(serviceImport)) {
  if (!source.includes(importMarker)) throw new Error('brew-engine import marker not found');
  source = source.replace(importMarker, importMarker + serviceImport);
}

const legacy = `export async function requestPrivatePlan(endpoint, input, timeoutMs = 9000) {
  const selected = explicitProfileId(input);
  if (selected && CORE_PROFILE_ALIAS[selected]) return computeOptimizedPlan(input, { forceProfile: selected });
  const normalized = normalizeExplicitInput(input);
  const privatePlan = await core.requestPrivatePlan(endpoint, normalized, timeoutMs);
  const semanticPlan = normalizeStageSemantics(privatePlan, selected);
  let optimized = optimizeBrewPlan(normalized, semanticPlan);
  optimized = normalizeStageSemantics(optimized, selected);
  assertProfileIntegrity(normalized, optimized);
  return attachLegacyTrajectory(optimized);
}`;

const replacement = `export async function requestPrivatePlan(endpoint, input, timeoutMs = 9000) {
  const normalized = normalizeExplicitInput(input);
  const plan = await requestAuthoritativePlan(normalized, {
    endpoint: endpoint || undefined,
    timeoutMs: Math.min(Math.max(Number(timeoutMs) || 6500, 2500), 12000)
  });
  const requested = explicitProfileId(normalized);
  const resolved = String(plan.profile?.id || String(plan.profileVersion || '').split('@')[0] || '');
  const expectedStages = EXPECTED_STAGE_COUNTS[requested];
  const actualStages = Array.isArray(plan.stages) ? plan.stages.length : 0;
  plan.profileIntegrity = {
    requestedProfileId: requested || 'recommended',
    resolvedProfileId: resolved,
    expectedStageCount: expectedStages || null,
    actualStageCount: actualStages,
    preserved: !requested || !resolved || requested === resolved,
    stageCountValid: !expectedStages || expectedStages === actualStages,
    countIncludesBloom: true
  };
  if (!plan.profileIntegrity.preserved) {
    throw new Error(\`专业引擎方案不一致：请求 \${requested}，返回 \${resolved || '未知方案'}\`);
  }
  if (!plan.profileIntegrity.stageCountValid) {
    throw new Error(\`专业引擎分段不一致：\${requested} 应为 \${expectedStages} 段，返回 \${actualStages} 段\`);
  }
  plan.clientAdjusted = false;
  plan.executionSource = 'brew-profiles-authoritative';
  return plan;
}`;

if (source.includes(legacy)) source = source.replace(legacy, replacement);
else if (!source.includes("executionSource = 'brew-profiles-authoritative'")) throw new Error('legacy requestPrivatePlan block not found');

if (/requestPrivatePlan[\s\S]*optimizeBrewPlan\(normalized, semanticPlan\)/.test(source)) {
  throw new Error('authoritative request path still invokes client optimizer');
}

await writeFile(path, source);
console.log('Authoritative BrewProfiles request path migrated.');
