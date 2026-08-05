import { readFile, writeFile } from 'node:fs/promises';

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label} marker not found`);
  return source.replace(before, after);
}

async function patchModel() {
  const path = 'src/brew-model-v09.js';
  let source = await readFile(path, 'utf8');
  const start = source.indexOf('export function professionalTemperatureModel(');
  const end = source.indexOf('\nexport function applyTemperatureOverrides', start);
  if (start < 0 || end < 0) throw new Error('professionalTemperatureModel block not found');
  const formal = `export function professionalTemperatureModel(bean = {}, waterProfile = {}, targets = {}) {
  const model = varietyModelForBean(bean);
  const roast = Number(String(bean.roastCode || 'RL-L2').replace(/\\D/g, '')) || 2;
  const light = ({ 0: 1, 1: .85, 2: .55, 3: .25, 4: 0, 5: -.25, 6: -.45 })[roast] ?? .55;
  const hints = waterProfile.modelHints || {};
  const buffer = String(hints.buffer || 'medium');
  const aromaDrive = String(hints.aromaDrive || 'medium');
  const tendency = waterProfile.tendency || {};
  const floral = clamp(Number(targets.floral ?? 1.5), 0, 3) / 3;
  const bitternessSuppression = clamp(Number(targets.bitterness ?? 1.5), 0, 3) / 3;
  const volatilityBias = model.volatility * .55 + floral * .42 + clamp(Number(tendency.floral || 0), -2, 2) * .08;
  const riskBias = model.sensitivity.temp * .28 + light * .35 + bitternessSuppression * .15;
  const bufferBias = /high/.test(buffer) ? -.25 : buffer === 'low' ? .12 : 0;
  const aromaBias = aromaDrive === 'high' ? -.12 : aromaDrive === 'low' ? .10 : 0;
  const mainC = round(clamp(90 - volatilityBias + riskBias + bufferBias + aromaBias, 84, 96), 1);
  const firstDrop = round(clamp(1.5 + model.sensitivity.temp * 2.7 + light * .8, 1, 5), 1);
  const tailDrop = round(clamp(.8 + model.sensitivity.tail * 2.2 + Math.max(0, model.bitter) * 1.8, 1, 4), 1);
  const tempBand = round(clamp(1.75 - model.sensitivity.temp * .8 - model.sensitivity.tail * .18, .55, 1.8), 2);
  const flowBand = round(clamp(.52 - model.sensitivity.pulse * .28, .16, .55), 2);
  const waterBand = Math.round(clamp(8 - model.sensitivity.temp * 2.1 - model.sensitivity.tail * 2.4, 3, 8));
  const levelName = value => value >= .88 ? '极高' : value >= .72 ? '高' : value >= .58 ? '中高' : value >= .42 ? '中' : '低';
  const waterAdvice = buffer === 'low'
    ? '该水型偏向明亮与香气表达，尾段需注意避免酸质尖锐。'
    : /high/.test(buffer)
      ? '该水型偏向圆润与结构，可能降低部分明亮感。'
      : '该水型以平衡表达为主，按实际杯测微调。';
  return {
    model: model.label,
    markers: model.markers || [],
    execution: model.execution || '',
    sensitivity: { ...model.sensitivity },
    sensitivityText: \`温度 \${levelName(model.sensitivity.temp)} / 水型缓冲 \${buffer} / 尾段 \${levelName(model.sensitivity.tail)} / 脉冲 \${levelName(model.sensitivity.pulse)}\`,
    tolerance: { temperatureC: tempBand, flowGPerSec: flowBand, waterG: waterBand },
    waterAdvice,
    mainC,
    firstC: round(clamp(mainC - firstDrop, 80, mainC), 1),
    tailC: round(clamp(mainC - tailDrop, 80, mainC), 1),
    firstDropC: firstDrop,
    tailDropC: tailDrop,
    lowFirstRecommended: model.sensitivity.temp >= .68 || light >= .55,
    tailCoolingRecommended: model.sensitivity.tail >= .65 || model.bitter > .1,
    reason: \`\${model.label}；温度敏感度\${model.sensitivity.temp >= .8 ? '高' : '中'}，尾段敏感度\${model.sensitivity.tail >= .8 ? '高' : '中'}；水型“\${waterProfile.name || '未命名'}”，参考TDS \${Number(waterProfile.tdsMid || 85)}。\`
  };
}`;
  source = source.slice(0, start) + formal + source.slice(end);
  source = source.replace(
    "    water: { ca: Number(waterProfile.ca || 0), mg: Number(waterProfile.mg || 0), hco3: Number(waterProfile.hco3 || 0) },",
    "    water: { name: waterProfile.name || '未命名水型', tds: Number(waterProfile.tdsMid || 85), tendency: structuredClone(waterProfile.tendency || {}), modelHints: structuredClone(waterProfile.modelHints || {}) },"
  );
  if (/waterProfile\.(?:ca|mg|hco3)/.test(source)) throw new Error('precise ion dependency remains in brew model');
  await writeFile(path, source);
}

async function patchEngineCore() {
  const path = 'src/brew-engine-core.js';
  let source = await readFile(path, 'utf8');
  const start = source.indexOf('  const customWater = waterProfileId === \'custom\' && input.water?.customProfile;');
  const end = source.indexOf('  const legacyTemperature = resolveTemperature', start);
  if (start < 0 || end < 0) throw new Error('custom water engine block not found');
  const block = `  const customWater = waterProfileId === 'custom' && input.water?.customProfile;
  const water = calculateWaterRecipe(waterProfileId, {
    volumeL: Number(input.water?.recipeVolumeL || 5),
    targets,
    customProfile: customWater || null
  });
`;
  source = source.slice(0, start) + block + source.slice(end);
  source = source.replace(
    "      'TDS为电导换算量；pH不能由TDS或HCO₃⁻可靠反推。',",
    "      'LuckyBean仅使用水型、参考TDS和风味倾向；精确配方请在“萃离”中完成。',"
  );
  if (/targetIonsMgL|totalDoseG|\.doses\b|customProfile\.(?:ca|mg|hco3)/.test(source)) throw new Error('precise water recipe fields remain in fallback engine');
  await writeFile(path, source);
}

async function patchApp() {
  const path = 'src/app.js';
  let source = await readFile(path, 'utf8');
  source = replaceRequired(
    source,
    "    customWater: { tds: 85, ca: 9, mg: 12, hco3: 28 }, flavorTargets: { floral: 2, acidity: 1.5, sweetness: 2, body: 1, bitterness: 2 },",
    "    customWater: { name: '我的水型', tds: 85, tendency: { floral: 0, acidity: 0, sweetness: 0, body: 0, bitterness: 0, astringency: 0 }, note: '' }, flavorTargets: { floral: 2, acidity: 1.5, sweetness: 2, body: 1, bitterness: 2 },",
    'custom water defaults'
  );
  source = replaceRequired(
    source,
    "    temperatureTune: 0, grindTune: 0, bloomTune: 0, repeatability: false",
    "    temperatureTune: 0, grindTune: 0, bloomTune: 0, repeatability: false,\n    environment: { ambientTemperatureC: 25, relativeHumidityPct: null, initialBedTemperatureC: 25 }",
    'environment defaults'
  );
  source = replaceRequired(
    source,
    "      customWater: { ...DEFAULT_SETTINGS.brew.customWater, ...(saved?.brew?.customWater || {}) },\n      flavorTargets:",
    "      customWater: { ...DEFAULT_SETTINGS.brew.customWater, ...(saved?.brew?.customWater || {}), tendency: { ...DEFAULT_SETTINGS.brew.customWater.tendency, ...(saved?.brew?.customWater?.tendency || {}) } },\n      environment: { ...DEFAULT_SETTINGS.brew.environment, ...(saved?.brew?.environment || {}) },\n      flavorTargets:",
    'settings merge'
  );

  const dialogStart = source.indexOf('function openCustomWaterDialog() {');
  const dialogEnd = source.indexOf('\nfunction openFlavorTargetDialog()', dialogStart);
  if (dialogStart < 0 || dialogEnd < 0) throw new Error('custom water dialog block not found');
  const customDialog = `function waterDirectionOptions(value = 0) {
  return [[-2,'明显降低'],[-1,'略有降低'],[0,'基本不变'],[1,'略有增强'],[2,'明显增强']]
    .map(([number,label]) => \`<option value="\${number}"\${Number(value)===number?' selected':''}>\${label}</option>\`).join('');
}

function openCustomWaterDialog() {
  const water = state.settings.brew.customWater || DEFAULT_SETTINGS.brew.customWater;
  const tendency = { ...DEFAULT_SETTINGS.brew.customWater.tendency, ...(water.tendency || {}) };
  const overlay = showOverlay(\`\${dialogHeader('自定义水型', '仅保存名称、TDS和风味倾向；精确配方请在“萃离”中调整', { centered: true })}<div class="grid-2"><label class="field"><span>水型名称</span><input id="customWaterName" class="control" maxlength="40" value="\${esc(water.name || '我的水型')}"></label><label class="field"><span>参考TDS mg/L</span><input id="customWaterTds" class="control" type="number" min="0" max="300" value="\${Number(water.tds||85)}"></label><label class="field"><span>花香倾向</span><select id="customWaterFloral" class="control">\${waterDirectionOptions(tendency.floral)}</select></label><label class="field"><span>酸质倾向</span><select id="customWaterAcidity" class="control">\${waterDirectionOptions(tendency.acidity)}</select></label><label class="field"><span>甜感倾向</span><select id="customWaterSweetness" class="control">\${waterDirectionOptions(tendency.sweetness)}</select></label><label class="field"><span>醇厚倾向</span><select id="customWaterBody" class="control">\${waterDirectionOptions(tendency.body)}</select></label><label class="field"><span>苦感倾向</span><select id="customWaterBitterness" class="control">\${waterDirectionOptions(tendency.bitterness)}</select></label><label class="field"><span>涩感倾向</span><select id="customWaterAstringency" class="control">\${waterDirectionOptions(tendency.astringency)}</select></label></div><label class="field"><span>备注</span><textarea id="customWaterNote" class="control" rows="3" placeholder="例如：在萃离中微调后，花香更突出、涩感降低">\${esc(water.note || '')}</textarea></label><p class="muted small">LuckyBean不记录盐类、离子浓度和精确投加量。</p><div class="row end"><button id="saveCustomWaterBtn" class="button primary" type="button">确定</button></div>\`, { id: 'custom-water', backdropClose: true });
  bindClose(overlay);
  $('#saveCustomWaterBtn').addEventListener('click', async () => {
    state.settings.brew.customWater = {
      name: $('#customWaterName').value.trim() || '我的水型',
      tds: parseNumber($('#customWaterTds').value,85),
      tendency: {
        floral: parseNumber($('#customWaterFloral').value,0), acidity: parseNumber($('#customWaterAcidity').value,0),
        sweetness: parseNumber($('#customWaterSweetness').value,0), body: parseNumber($('#customWaterBody').value,0),
        bitterness: parseNumber($('#customWaterBitterness').value,0), astringency: parseNumber($('#customWaterAstringency').value,0)
      },
      note: $('#customWaterNote').value.trim()
    };
    state.settings.brew.waterProfileId='custom'; await saveSettings(); closeOverlay(); renderBrew();
  });
}`;
  source = source.slice(0, dialogStart) + customDialog + source.slice(dialogEnd);

  source = replaceRequired(
    source,
    "    water: { profileId: resolvedWater, recipeVolumeL: Number(state.settings.brew.waterVolumeL || 5), tdsMgL: Number(customWater.tds || 85), customProfile: resolvedWater === 'custom' ? customWater : undefined },\n    targets:",
    "    water: { profileId: resolvedWater, recipeVolumeL: Number(state.settings.brew.waterVolumeL || 5), tdsMgL: Number(customWater.tds || 85), customProfile: resolvedWater === 'custom' ? customWater : undefined },\n    environment: { ...state.settings.brew.environment },\n    targets:",
    'brew input environment'
  );
  source = source.replace("  const customWaterLabel = currentWater === 'custom' ? '自定义' : '';", "  const customWaterLabel = currentWater === 'custom' ? `${settings.customWater?.name || '自定义'} · TDS ${Number(settings.customWater?.tds || 85)}` : '';");
  const generateRow = '    <div class="brew-generate-row menu-row"><button id="generatePlanBtn"';
  const environmentUi = `    <details class="brew-environment-details"><summary>环境细节（默认25°C，可选）</summary><div class="brew-row three"><label class="field"><span>室温 °C</span><input id="ambientTemperatureC" class="control" type="number" min="5" max="40" step="0.5" value="\${Number(settings.environment?.ambientTemperatureC ?? 25)}"></label><label class="field"><span>相对湿度 %</span><input id="relativeHumidityPct" class="control" type="number" min="0" max="100" step="1" placeholder="可留空" value="\${settings.environment?.relativeHumidityPct == null ? '' : Number(settings.environment.relativeHumidityPct)}"></label><label class="field"><span>初始粉床温度 °C</span><input id="initialBedTemperatureC" class="control" type="number" min="5" max="40" step="0.5" value="\${Number(settings.environment?.initialBedTemperatureC ?? 25)}"></label></div></details>\n`;
  if (!source.includes('id="ambientTemperatureC"')) {
    if (!source.includes(generateRow)) throw new Error('brew generate row marker not found');
    source = source.replace(generateRow, environmentUi + generateRow);
  }
  const eventMarker = "  $('#generatePlanBtn')?.addEventListener('click', generatePlan);";
  const environmentEvents = `  ['ambientTemperatureC','relativeHumidityPct','initialBedTemperatureC'].forEach(id => $('#'+id)?.addEventListener('change', async () => {
    const humidityRaw = $('#relativeHumidityPct')?.value;
    state.settings.brew.environment = {
      ambientTemperatureC: parseNumber($('#ambientTemperatureC')?.value, 25),
      relativeHumidityPct: humidityRaw === '' ? null : clamp(parseNumber(humidityRaw, 50), 0, 100),
      initialBedTemperatureC: parseNumber($('#initialBedTemperatureC')?.value, 25)
    };
    await saveSettings();
  }));
`;
  if (!source.includes("humidityRaw === '' ? null")) {
    if (!source.includes(eventMarker)) throw new Error('brew event marker not found');
    source = source.replace(eventMarker, environmentEvents + eventMarker);
  }
  source = source.replace(
    "      temperatureTune: input.brew.temperatureTune, grindTune: input.brew.grindTune, bloomTune: input.brew.bloomTune, repeatability: input.brew.repeatability,\n      flavorTargets:",
    "      temperatureTune: input.brew.temperatureTune, grindTune: input.brew.grindTune, bloomTune: input.brew.bloomTune, repeatability: input.brew.repeatability,\n      environment: { ...input.environment },\n      flavorTargets:"
  );
  if (/customWater(?:Ca|Mg|Hco3)|customWater:\s*\{[^}]*\b(?:ca|mg|hco3)\b/i.test(source)) throw new Error('precise custom water UI remains in app');
  await writeFile(path, source);
}

async function patchStyles() {
  const path = 'styles.css';
  let source = await readFile(path, 'utf8');
  const css = `\n.brew-environment-details{margin:10px 0 4px;border:0;background:transparent}.brew-environment-details>summary{cursor:pointer;color:var(--muted);font-size:12px;padding:6px 0;list-style:none}.brew-environment-details>summary::-webkit-details-marker{display:none}.brew-environment-details[open]>summary{color:var(--text);border-bottom:1px dashed var(--active);margin-bottom:12px}\n`;
  if (!source.includes('.brew-environment-details{')) source += css;
  await writeFile(path, source);
}

await patchModel();
await patchEngineCore();
await patchApp();
await patchStyles();
console.log('LuckyBean water selection simplified and optional environment fields integrated.');
