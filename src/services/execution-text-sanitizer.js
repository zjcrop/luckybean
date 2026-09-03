const OBSOLETE_EXECUTION_SENTENCES = Object.freeze([
  /按\s*Excel\s*方案表的累计时间[、，,\s]*温度(?:与|和|及)累计注水量执行本段[。.!！?？]?/gi,
  /按\s*Excel\s*方案表[^。.!！?？\n]{0,120}执行本段[。.!！?？]?/gi
]);

export function sanitizeExecutionText(value) {
  let text = String(value ?? '');
  for (const pattern of OBSOLETE_EXECUTION_SENTENCES) text = text.replace(pattern, ' ');
  return text
    .replace(/[ \t]+([，。！？；：])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^\s*[，。；：]+\s*/g, '')
    .trim();
}

export function sanitizeExecutionAction(action) {
  if (!action || typeof action !== 'object') return action;
  return { ...action, speech: sanitizeExecutionText(action.speech), label: sanitizeExecutionText(action.label) };
}

export function sanitizeExecutionPlanText(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  return {
    ...plan,
    stages: Array.isArray(plan.stages)
      ? plan.stages.map(stage => ({ ...stage, notice: sanitizeExecutionText(stage?.notice), advanceSpeech: sanitizeExecutionText(stage?.advanceSpeech) }))
      : plan.stages,
    executionActions: Array.isArray(plan.executionActions)
      ? plan.executionActions.map(sanitizeExecutionAction)
      : plan.executionActions
  };
}
