from pathlib import Path

pipeline = Path('src/domain/recognition/recognition-pipeline.js')
text = pipeline.read_text(encoding='utf-8')
old = """  const parsed = parseNaturalLanguage(semanticText, book);
  const fields = buildFieldRows(document, parsed, book);
  const reviewFields = fields.filter(item => item.status === 'review');
  parsed.parseMetadata ||= {};
"""
new = """  const parsed = parseNaturalLanguage(semanticText, book);
  const fields = buildFieldRows(document, parsed, book);
  const reviewFields = fields.filter(item => item.status === 'review');

  // A field can be semantically identified by the relation resolver while remaining
  // unresolved by the codebook (for example: COUNTRY ATLANTIS). Preserve that raw
  // relation evidence for the bean-form confirmation UI instead of losing the field
  // between package analysis and form handoff. Confidence remains the measured
  // parser/relation confidence; manual confirmation must never fabricate confidence=1.
  parsed.evidence ||= {};
  parsed.confidence ||= {};
  for (const item of reviewFields) {
    const rawValue = clean(item.rawValue);
    if (!rawValue) continue;
    const currentEvidence = parsed.evidence[item.field];
    const missingEvidence = currentEvidence === undefined
      || currentEvidence === null
      || currentEvidence === ''
      || (Array.isArray(currentEvidence) && currentEvidence.length === 0);
    if (missingEvidence) parsed.evidence[item.field] = rawValue;
    const currentConfidence = Number(parsed.confidence[item.field]);
    if (!Number.isFinite(currentConfidence) || currentConfidence <= 0) {
      parsed.confidence[item.field] = Number(item.confidence || 0);
    }
  }

  parsed.parseMetadata ||= {};
"""
if old not in text:
    raise SystemExit('recognition pipeline review section changed unexpectedly')
pipeline.write_text(text.replace(old, new, 1), encoding='utf-8')

regression = Path('test/v124b-main6-ui-regression.test.js')
text = regression.read_text(encoding='utf-8')
extra = r'''

test('main.6 unresolved semantic fields preserve raw evidence for explicit bean-form confirmation', () => {
  const pipeline = read('src/domain/recognition/recognition-pipeline.js');
  assert.match(pipeline, /for \(const item of reviewFields\)/);
  assert.match(pipeline, /if \(missingEvidence\) parsed\.evidence\[item\.field\] = rawValue/);
  assert.match(pipeline, /parsed\.confidence\[item\.field\] = Number\(item\.confidence \|\| 0\)/);
  assert.equal(pipeline.includes('parsed.confidence[item.field] = 1'), false);
});
'''
if 'main.6 unresolved semantic fields preserve raw evidence' not in text:
    regression.write_text(text.rstrip() + extra + '\n', encoding='utf-8')

Path('scripts/luckybean-main6-review-evidence-fix.py').unlink(missing_ok=True)
