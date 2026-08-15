from pathlib import Path

p = Path('src/codebook.js')
text = p.read_text(encoding='utf-8')
anchor = """  for (const [regex, code] of roastMap) {
    if (regex.test(roastSource)) {
      result.roastCode = code;
      result.confidence.roastCode = labeled.roast ? 0.96 : 0.9;
      result.evidence.roastCode = roastSource.match(regex)?.[0];
      break;
    }
  }
  const roastCode = normalizeCodeSource(roastSource).match(/(?:^|[^A-Z0-9])(RL-L[0-6])(?:$|[^A-Z0-9])/);"""
replacement = """  for (const [regex, code] of roastMap) {
    if (regex.test(roastSource)) {
      result.roastCode = code;
      result.confidence.roastCode = labeled.roast ? 0.96 : 0.9;
      result.evidence.roastCode = roastSource.match(regex)?.[0];
      break;
    }
  }
  // Numeric roast levels are accepted only when an explicit roast label owns the value.
  // This deliberately does not scan unlabeled body text, so crop years and other numbers
  // cannot become roast levels by proximity or fallback inference.
  if (labeled.roast) {
    const numericRoast = normalizeLabelValue(labeled.roast).match(/^(?:RL[-\\s]?)?L?([0-6])$/i);
    if (numericRoast) {
      result.roastCode = `RL-L${numericRoast[1]}`;
      result.confidence.roastCode = 0.99;
      result.evidence.roastCode = labeled.roast;
    }
  }
  const roastCode = normalizeCodeSource(roastSource).match(/(?:^|[^A-Z0-9])(RL-L[0-6])(?:$|[^A-Z0-9])/);"""
if anchor not in text:
    raise SystemExit('roast parser anchor missing')
p.write_text(text.replace(anchor, replacement, 1), encoding='utf-8')

# Add a focused regression assertion to the multilingual recognition test.
t = Path('test/harvest-multilingual-preflight.test.js')
s = t.read_text(encoding='utf-8')
append = r'''

test('explicit labeled numeric roast level is normalized without scanning crop numbers', () => {
  const result = parseNaturalLanguage('CROP YEAR: 2025/26\nROAST LEVEL: L2', emptyBook);
  assert.equal(result.harvestSeason, '2025/2026');
  assert.equal(result.roastCode, 'RL-L2');
});
'''
if "explicit labeled numeric roast level is normalized" not in s:
    t.write_text(s + append, encoding='utf-8')
