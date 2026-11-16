// Presentation only: never rewrite the plan's stages, indices or timings.
const LEADING_STAGE_NUMBER = /^第\s*[0-9０-９零〇一二两三四五六七八九十百]+\s*段(?:\s*[·•｜|:：、，,.．\-—]\s*|\s+|(?=[（(])|$)/u;
const CUE_PREFIX = Object.freeze({ start:'开始', advance:'进入', switch:'切换到', prepare:'下一段：' });

function stageTitle(stage) {
  let title = String(stage?.name ?? '').trim();
  // Accept historic names such as “第一段·闷蒸”, including repeated prefixes.
  while (LEADING_STAGE_NUMBER.test(title)) title = title.replace(LEADING_STAGE_NUMBER, '').trim();
  return title;
}

export function formatStageLabel(stage, stageIndex = 0, { speech = false } = {}) {
  const position = Number.isInteger(stageIndex) && stageIndex >= 0 ? stageIndex + 1 : 1;
  const ordinal = `第${position}段`;
  const title = stageTitle(stage);
  return title ? `${ordinal}${speech ? '，' : ' · '}${title}` : ordinal;
}

function finiteValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function formatStageSpeech(stage = {}, stageIndex = 0, { cue = '', duration = false, notice = true } = {}) {
  const parts = [`${CUE_PREFIX[cue] || ''}${formatStageLabel(stage, stageIndex, { speech:true })}`];
  if (finiteValue(stage.stageWaterG)) parts.push(`注水${Math.round(Number(stage.stageWaterG))}克`);
  if (finiteValue(stage.temperatureC)) parts.push(`水温${Math.round(Number(stage.temperatureC))}度`);
  if (duration && finiteValue(stage.durationSec)) parts.push(`用时${Math.round(Number(stage.durationSec))}秒`);
  if (String(stage.method || '').trim()) parts.push(String(stage.method).trim());
  const instruction = parts.join('，');
  const extra = notice ? String(stage.notice || '').trim() : '';
  return extra ? `${instruction}。${extra}` : instruction;
}

// Compatibility for the exact first-stage fragment emitted by the existing
// server. Preserve surrounding equipment/ice instructions and authored speech.
export function normalizePreparationSpeech(value, firstStage) {
  const text = String(value ?? '');
  if (!firstStage || ![firstStage.stageWaterG, firstStage.temperatureC, firstStage.durationSec].every(finiteValue)) return text;
  const legacy = `第一段是${firstStage.name}，注水${Math.round(Number(firstStage.stageWaterG))}克，水温${Math.round(Number(firstStage.temperatureC))}度，用时${Math.round(Number(firstStage.durationSec))}秒，${firstStage.method}`;
  return text.replace(legacy, formatStageSpeech(firstStage, 0, { duration:true, notice:false }));
}

// Do not clamp a cue to a stage's start: that would interrupt its own start cue.
export function canAnnounceNextStage(durationSec) { return Number(durationSec) > 8; }
export function canAnnounceStageCountdown(durationSec) { return Number(durationSec) > 3.2; }
