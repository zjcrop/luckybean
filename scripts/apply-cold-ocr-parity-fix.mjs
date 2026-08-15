import fs from 'node:fs';

// One-shot deterministic source repair; idempotent by construction. Trigger 2.
function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text;
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one source anchor, found ${count}`);
  return text.replace(before, after);
}

const appPath = 'src/app.js';
let app = fs.readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
  "      ${source.evidence ? evidenceHtml(source.evidence, source.confidence) : ''}",
  "      ${source.showRecognitionEvidence === true && source.evidence ? evidenceHtml(source.evidence, source.confidence) : ''}",
  'hide confirmed recognition evidence'
);
app = replaceOnce(
  app,
  "  openBeanForm(merged, { type: 'text', text: sourceText, recognitionDocument, evidence: parsed.evidence, confidence: parsed.confidence, parseMetadata: parsed.parseMetadata });",
  "  openBeanForm(merged, { type: 'text', text: sourceText, recognitionDocument, evidence: parsed.evidence, confidence: parsed.confidence, parseMetadata: parsed.parseMetadata, showRecognitionEvidence: false });",
  'mark recognition review as finalized'
);
app = replaceOnce(
  app,
  '识别证据和置信度会在表单中显示。',
  '低置信度字段会要求人工确认；确认后表单仅显示最终值，识别证据保留为内部来源记录。',
  'recognition helper copy'
);
app = replaceOnce(
  app,
  "      flavorCodes: selectedSummaryCodes(), archived: Boolean(bean.archived), source: source.type || bean.source || 'manual',",
  "      flavorCodes: selectedSummaryCodes(), recognitionProvenance: source.parseMetadata ? { parseMetadata: structuredClone(source.parseMetadata), evidence: structuredClone(source.evidence || {}), confidence: structuredClone(source.confidence || {}), confirmedAt: source.parseMetadata?.dateReview?.confirmedAt || now } : (bean.recognitionProvenance || null), archived: Boolean(bean.archived), source: source.type || bean.source || 'manual',",
  'persist recognition provenance without rendering it'
);
fs.writeFileSync(appPath, app);

const buildPath = '.github/workflows/build-main.yml';
let build = fs.readFileSync(buildPath, 'utf8');
build = replaceOnce(
  build,
  '          test -f "$apk"\n',
  `          test -f "$apk"\n          source_app_sha=$(sha256sum src/app.js | awk '{print $1}')\n          apk_app_sha=$(unzip -p "$apk" assets/web-cache/src/app.js | sha256sum | awk '{print $1}')\n          test "$source_app_sha" = "$apk_app_sha"\n          source_engine_sha=$(sha256sum src/brew-engine.js | awk '{print $1}')\n          apk_engine_sha=$(unzip -p "$apk" assets/web-cache/src/brew-engine.js | sha256sum | awk '{print $1}')\n          test "$source_engine_sha" = "$apk_engine_sha"\n          source_catalog_sha=$(sha256sum src/services/brew-profile-catalog-service.js | awk '{print $1}')\n          apk_catalog_sha=$(unzip -p "$apk" assets/web-cache/src/services/brew-profile-catalog-service.js | sha256sum | awk '{print $1}')\n          test "$source_catalog_sha" = "$apk_catalog_sha"\n          printf 'verified_web_asset_sha=%s\\n' "$source_app_sha"\n`,
  'APK/Web byte parity gate'
);
fs.writeFileSync(buildPath, build);

console.log('Applied OCR final-state and APK/Web parity fixes.');
