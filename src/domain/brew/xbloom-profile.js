// xBloom Studio / J15 recipe adaptation and BLE frame builders.
// Command layout is based on the hardware-tested V12.0D.500 protocol documented
// by Janczykkkko/xbloom-ble; this is an unofficial, firmware-sensitive protocol.

export const XBLOOM_STUDIO_CAPABILITIES = Object.freeze({
  id: 'xbloom-studio-v12',
  label: 'xBloom Studio / J15',
  doseMinG: 1,
  doseTypicalMinG: 5,
  doseMaxG: 18,
  grindMin: 1,
  grindMax: 80,
  rpmMin: 60,
  rpmMax: 120,
  rpmStep: 10,
  pourMinMl: 1,
  pourMaxMl: 240, // DS-B editor safety cap; the wire protocol can split larger pours.
  pourMaxCount: 16,
  temperatureMinC: 40,
  temperatureMaxC: 95,
  temperatureStepC: 1,
  stageTemperatureMinC: 40,
  stageTemperatureMaxC: 130,
  flowMinMlS: 3,
  flowMaxMlS: 3.5,
  flowStepMlS: 0.1,
  pauseMinS: 0,
  pauseMaxS: 99, // Wire byte supports 0–255; the machine countdown is about 99 s.
  stageTemperaturesC: Object.freeze([110, 90]),
  maxFrameBytes: 244 // ATT payload after requesting MTU 247 in the Android client.
});

export const XBLOOM_COMMANDS = Object.freeze({
  SESSION_START: 0xa4,
  STATUS_QUERY: 0x56,
  DOSE: 0xa6,
  STAGE_TEMPERATURES: 0xa8,
  POURS_AND_GRIND: 0x41,
  POURS_NO_GRIND: 0x44,
  COMMIT: 0x42,
  START: 0x46,
  CANCEL: 0x47
});

const LOAD_SEQUENCE = 0x1f;
const BREW_SEQUENCE = 0x9e;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundTo = (value, step) => Math.round(value / step) * step;

function int32le(value) {
  const bytes = new ArrayBuffer(4);
  new DataView(bytes).setInt32(0, Math.round(value), true);
  return [...new Uint8Array(bytes)];
}

function float32le(value) {
  const bytes = new ArrayBuffer(4);
  new DataView(bytes).setFloat32(0, Number(value), true);
  return [...new Uint8Array(bytes)];
}

function patternForStage(stage) {
  const text = String(stage?.method || '').toLowerCase();
  if (text.includes('中心注水') || text.includes('中心小圈润湿') || text.includes('center')) return 'center';
  if (text.includes('外圈') || text.includes('circular') || text.includes('环绕')) return 'ring';
  return 'spiral';
}

function flowSettingForStage(stage) {
  // These are relative recipe settings, not unit conversion: LuckyBean's flow
  // values are mass-flow levels (g/s); xBloom accepts 3.0–3.5 ml/s.
  const sourceFlow = clamp(Number(stage?.flowGPerSec || 4.4), 3, 6);
  return roundTo(3 + (sourceFlow - 3) / 6, 0.1);
}

export function convertPlanToXbloom(plan, saved = {}) {
  if (!plan || !Array.isArray(plan.stages) || !plan.stages.length) throw new Error('冲煮方案缺少有效注水阶段');
  const originalDose = Number(plan.totals?.doseG || plan.input?.brew?.doseG || 15);
  const sourceWater = Number(plan.totals?.brewWaterG || plan.totals?.waterG || 0);
  if (!(originalDose > 0) || !(sourceWater > 0)) throw new Error('冲煮方案缺少粉量或注水量');

  const doseG = clamp(Math.round(Number(saved.doseG ?? originalDose)),
    XBLOOM_STUDIO_CAPABILITIES.doseMinG, XBLOOM_STUDIO_CAPABILITIES.doseMaxG);
  const sourceRatio = sourceWater / originalDose;
  const targetWaterMl = Math.round(doseG * sourceRatio);
  let sourceStages = plan.stages.filter(stage => Number(stage?.stageWaterG) > 0);
  if (!sourceStages.length) throw new Error('冲煮方案没有可转换的注水阶段');

  const autoSplitSingleStage = sourceStages.length === 1 && Number(sourceStages[0].stageWaterG) >= 2;
  if (autoSplitSingleStage) {
    const only = sourceStages[0];
    const firstVolume = Math.max(1, Math.round(Number(only.stageWaterG) * 0.35));
    sourceStages = [
      { ...only, name: '闷蒸', stageWaterG: firstVolume },
      { ...only, name: '注水 2', stageWaterG: Number(only.stageWaterG) - firstVolume, drainWaitSec: 0 }
    ];
  }

  const rawTotal = sourceStages.reduce((sum, stage) => sum + Number(stage.stageWaterG), 0);
  let allocated = 0;
  const pours = sourceStages.map((stage, index) => {
    const volumeMl = index === sourceStages.length - 1
      ? targetWaterMl - allocated
      : Math.max(1, Math.round(targetWaterMl * Number(stage.stageWaterG) / rawTotal));
    allocated += volumeMl;
    const sourceTemperature = Number(stage.temperatureC || plan.temperature?.mainC || 92);
    const savedPour = saved.pours?.[index] || {};
    const savedPattern = savedPour.pattern === 'circular' ? 'ring' : savedPour.pattern;
    const pattern = savedPattern || patternForStage(stage);
    const stageHasAgitation = String(stage.agitation || '').toLowerCase() !== 'none' && Boolean(stage.agitation);
    return {
      name: String(stage.name || `注水 ${index + 1}`),
      volumeMl: Number(savedPour.volumeMl ?? volumeMl),
      temperatureC: Number(savedPour.temperatureC ?? clamp(Math.round(sourceTemperature), 40, 95)),
      flowMlS: Number(savedPour.flowMlS ?? flowSettingForStage(stage)),
      pattern,
      pauseSeconds: Number(savedPour.pauseSeconds ?? (index === 0
        ? clamp(Math.round(stage.durationSec || 0), 0, 99)
        : clamp(Math.round(stage.drainWaitSec || 0), 0, 99))),
      agitation: Boolean(savedPour.agitation ?? (index === 0 && pattern === 'spiral' && stageHasAgitation)),
      sourceTemperatureC: sourceTemperature,
      sourceFlowGPerSec: Number(stage.flowGPerSec || 0)
    };
  });

  const machineRecipe = {
    schema: 'luckybean-xbloom-recipe/2',
    device: XBLOOM_STUDIO_CAPABILITIES.id,
    name: String(plan.beanName || plan.bean?.name || plan.profile?.label || 'LuckyBean 冲煮方案'),
    beanId: String(plan.beanId || ''),
    doseG,
    grinding: saved.grinding ?? true,
    grindSize: clamp(Math.round(Number(saved.grindSize ?? plan.grinder?.recommended ?? 55)), 1, 80),
    rpm: clamp(roundTo(Number(saved.rpm ?? 90), 10), 60, 120),
    stageTemperaturesC: [
      Number(saved.stageTemperaturesC?.[0] ?? 110),
      Number(saved.stageTemperaturesC?.[1] ?? 90)
    ],
    ratio: targetWaterMl / doseG,
    totalWaterMl: pours.reduce((sum, pour) => sum + Number(pour.volumeMl), 0),
    pours,
    source: {
      planVersion: String(plan.engineVersion || plan.profileVersion || ''),
      originalDoseG: originalDose,
      originalWaterG: sourceWater,
      hotOnly: Boolean(plan.totals?.iceG),
      iceG: Number(plan.totals?.iceG || 0),
      autoSplitSingleStage
    }
  };
  return { recipe: machineRecipe, warnings: conversionWarnings(machineRecipe, plan) };
}

export function conversionWarnings(recipe, plan = {}) {
  const warnings = [];
  if (Number(recipe.source?.originalDoseG) < 1 || Number(recipe.source?.originalDoseG) > 18) {
    warnings.push(`原方案粉量 ${recipe.source.originalDoseG}g 超出设备配方 1–18g 范围，已限制为 ${recipe.doseG}g 并按粉水比调整总水量。`);
  } else if (Number(recipe.source?.originalDoseG) !== Number(recipe.doseG)) {
    warnings.push(`设备粉量按整数克编码，原方案 ${recipe.source.originalDoseG}g 已取整为 ${recipe.doseG}g，并按原粉水比调整注水量。`);
  }
  if (Number(recipe.doseG) < 5) warnings.push('1–4g 可通过配方字段校验，但低于 xBloom App 常见的 5–18g 使用范围，请确认实际投豆量。');
  if (recipe.source?.autoSplitSingleStage) warnings.push('设备配方至少需要两段注水；单阶段方案已按 35%/65% 拆成两段并保持总水量，请复核闷蒸段。');
  if (recipe.source?.hotOnly) warnings.push(`冰冲方案只发送热水注水段；请先在接液杯中加入 ${recipe.source.iceG}g 冰，机器不会自动加冰。`);
  if ((plan.stages || []).some(stage => Number(stage.temperatureC) > 95)) {
    warnings.push('原方案高于 95°C 的阶段已限制为数字温度上限 95°C；RT/BP 是特殊温度模式，当前 BLE 配方编码未确认，未自动替代。');
  }
  warnings.push('流量将 LuckyBean 的低/中/高质量流速档映射为 xBloom 的 3.0–3.5 ml/s 相对档位，不是质量流量到体积流量的物理等值换算；请逐段复核。');
  warnings.push('配方发送会等待设备进入“已装载”状态；本功能不会发送启动指令，开始冲煮仍须在设备上确认。');
  return warnings;
}

function pourBodyLength(pour) {
  const volume = Number(pour.volumeMl);
  const leadingChunks = Math.floor((volume - 1) / 127);
  return leadingChunks * 4 + 8;
}

export function validateXbloomRecipe(recipe) {
  const cap = XBLOOM_STUDIO_CAPABILITIES;
  const errors = [];
  const dose = Number(recipe?.doseG);
  if (!Number.isInteger(dose) || dose < cap.doseMinG || dose > cap.doseMaxG) errors.push(`粉量须为 ${cap.doseMinG}–${cap.doseMaxG}g 整数`);
  if (!Number.isInteger(Number(recipe?.grindSize)) || recipe.grindSize < cap.grindMin || recipe.grindSize > cap.grindMax) errors.push('研磨度须为 1–80 的整数');
  const rpm = Number(recipe?.rpm);
  const firstPattern = recipe?.pours?.[0]?.pattern;
  const validPositiveRpm = Number.isInteger(rpm) && rpm >= cap.rpmMin && rpm <= cap.rpmMax && rpm % cap.rpmStep === 0;
  if (!validPositiveRpm && !(rpm === 0 && firstPattern === 'center')) errors.push('首段旋转转速须为 60–120 RPM、每 10 RPM 一档；中心注水使用 0 RPM');
  const stageTemps = recipe?.stageTemperaturesC || [];
  if (stageTemps.length !== 2 || stageTemps.some(value => !Number.isFinite(Number(value)) || Number(value) < cap.stageTemperatureMinC || Number(value) > cap.stageTemperatureMaxC)) {
    errors.push(`设备预热设定须为 ${cap.stageTemperatureMinC}–${cap.stageTemperatureMaxC}°C 两个数值`);
  }
  if (!Array.isArray(recipe?.pours) || recipe.pours.length < 2 || recipe.pours.length > cap.pourMaxCount) errors.push(`注水段数须为 2–${cap.pourMaxCount}`);
  let bodyLength = 0;
  (recipe?.pours || []).forEach((pour, index) => {
    const n = index + 1;
    const volume = Number(pour.volumeMl);
    if (!Number.isInteger(volume) || volume < cap.pourMinMl || volume > cap.pourMaxMl) errors.push(`第 ${n} 段水量须为 1–${cap.pourMaxMl}ml 整数`);
    if (!Number.isInteger(Number(pour.temperatureC)) || pour.temperatureC < cap.temperatureMinC || pour.temperatureC > cap.temperatureMaxC) errors.push(`第 ${n} 段数字水温须为 40–95°C 整数`);
    const flowTicks = Math.round((Number(pour.flowMlS) - cap.flowMinMlS) / cap.flowStepMlS);
    if (Math.abs(cap.flowMinMlS + flowTicks * cap.flowStepMlS - Number(pour.flowMlS)) > 1e-6 || flowTicks < 0 || flowTicks > 5) errors.push(`第 ${n} 段流量须为 3.0–3.5 ml/s，每 0.1 ml/s 一档`);
    if (!['center', 'ring', 'spiral'].includes(pour.pattern)) errors.push(`第 ${n} 段注水模式无效`);
    if (pour.agitation && pour.pattern !== 'spiral') errors.push(`第 ${n} 段只有螺旋注水可启用搅动`);
    if (!Number.isInteger(Number(pour.pauseSeconds)) || pour.pauseSeconds < cap.pauseMinS || pour.pauseSeconds > cap.pauseMaxS) errors.push(`第 ${n} 段暂停须为 0–99 秒整数`);
    if (Number.isInteger(volume) && volume > 0) bodyLength += pourBodyLength(pour);
  });
  const totalWater = (recipe?.pours || []).reduce((sum, pour) => sum + Number(pour.volumeMl || 0), 0);
  const ratioByte = Math.round(totalWater / dose * 10);
  if (!Number.isFinite(ratioByte) || ratioByte < 1 || ratioByte > 255) errors.push('总注水量与粉量换算后的粉水比超出设备配方字节范围');
  const recipePayloadLength = 1 + 1 + bodyLength + 2;
  if (bodyLength > 255 || 11 + recipePayloadLength > cap.maxFrameBytes) errors.push('注水段编码超出当前 BLE 帧可承载长度');
  return errors;
}

export function crc16Xbloom(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? ((crc >>> 1) ^ 0x8408) : (crc >>> 1);
  }
  return crc & 0xffff;
}

export function buildXbloomFrame(command, payload = [], sequence = LOAD_SEQUENCE) {
  const length = 11 + payload.length;
  if (length > 0xffff) throw new Error('xBloom BLE 帧过长');
  const body = [0x58, 0x01, 0x01, command & 0xff, sequence & 0xff, length & 0xff, (length >>> 8) & 0xff, 0x00, 0x00, ...payload];
  const crc = crc16Xbloom(body);
  return Uint8Array.from([...body, crc & 0xff, crc >>> 8]);
}

function buildDoseFrame(doseG) {
  const payload = new Array(13).fill(0);
  payload[0] = 0x01;
  payload[9] = Math.round(doseG);
  return buildXbloomFrame(XBLOOM_COMMANDS.DOSE, payload);
}

function buildStageTemperaturesFrame(temperatures) {
  return buildXbloomFrame(XBLOOM_COMMANDS.STAGE_TEMPERATURES,
    [0x01, ...float32le(temperatures[0]), ...float32le(temperatures[1])]);
}

function patternCode(pattern, agitation) {
  if (pattern === 'center') return [0x00, 0x01];
  if (pattern === 'ring') return [0x01, 0x00];
  return [0x02, agitation ? 0x02 : 0x00];
}

export function buildXbloomRecipePayload(recipe) {
  const errors = validateXbloomRecipe(recipe);
  if (errors.length) throw new Error(errors.join('；'));
  const body = [];
  for (let index = 0; index < recipe.pours.length; index++) {
    const pour = recipe.pours[index];
    let remaining = Number(pour.volumeMl);
    const [pattern, agitation] = patternCode(pour.pattern, Boolean(pour.agitation));
    const temperature = Number(pour.temperatureC);
    while (remaining > 127) {
      body.push(127, temperature, pattern, agitation);
      remaining -= 127;
    }
    const pause = Number(pour.pauseSeconds);
    const rpm = index === 0 ? Number(recipe.rpm) : 0;
    body.push(remaining, temperature, pattern, agitation,
      (256 - pause) & 0xff, 0x00, rpm, Math.round(Number(pour.flowMlS) * 10));
  }
  const grindByte = recipe.grinding ? Number(recipe.grindSize) : 0xfe;
  const ratioByte = Math.round(recipe.pours.reduce((sum, pour) => sum + Number(pour.volumeMl), 0) / Number(recipe.doseG) * 10);
  return Uint8Array.from([0x01, body.length, ...body, grindByte, ratioByte]);
}

export function buildXbloomLoadFrames(recipe) {
  const payload = buildXbloomRecipePayload(recipe);
  const poursCommand = recipe.grinding ? XBLOOM_COMMANDS.POURS_AND_GRIND : XBLOOM_COMMANDS.POURS_NO_GRIND;
  const sessionPayload = [0x01, 0xb9, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00];
  return [
    buildXbloomFrame(XBLOOM_COMMANDS.SESSION_START, sessionPayload),
    buildXbloomFrame(XBLOOM_COMMANDS.STATUS_QUERY, [0x01]),
    buildDoseFrame(recipe.doseG),
    buildStageTemperaturesFrame(recipe.stageTemperaturesC),
    buildXbloomFrame(poursCommand, [...payload])
  ];
}

export function parseXbloomStatusNotification(bytes) {
  if (!bytes || bytes.length < 12 || bytes[0] !== 0x58 || bytes[1] !== 0x02 || bytes[2] !== 0x07 || bytes[3] !== 0x57) return null;
  const storedCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
  if (crc16Xbloom(bytes.subarray(0, bytes.length - 2)) !== storedCrc) return null;
  const payloadStart = bytes.indexOf(0xc1, 9);
  if (payloadStart < 0 || payloadStart + 1 >= bytes.length - 2) return null;
  return { state: bytes[payloadStart + 1] };
}
