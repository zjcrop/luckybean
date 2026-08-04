from pathlib import Path
import re

path = Path('src/codebook.js')
text = path.read_text(encoding='utf-8')
pattern = r'''  for \(const \[table, field, labelKey, customField\] of definitions\) \{.*?\n  \}\n\n  const roastSource'''
replacement = r'''  for (const [table, field, labelKey, customField] of definitions) {
    const labeledValue = labeled[labelKey] || '';
    if (labeledValue) {
      const labeledMatch = bestTableMatch(labeledValue, book[table]);
      if (labeledMatch) {
        recordMatch(result, field, labeledMatch, true);
      } else {
        result[customField] = labeledValue;
        result.confidence[customField] = 0.86;
        result.evidence[customField] = labeledValue;
      }
      continue;
    }

    let best = directCodeMatch(normalizedCodes, book[table]);
    if (!best) {
      for (const row of book[table] || []) {
        const aliases = row.slice(1)
          .filter(value => typeof value === 'string' && value && !['active', 'candidate'].includes(value))
          .flatMap(value => value.split(/[\\/、,，;；|]/))
          .map(value => value.trim())
          .filter(value => value.length >= 2);
        for (const alias of aliases) {
          const needle = alias.toLocaleLowerCase('zh-CN');
          if (lower.includes(needle) && (!best || needle.length > best.alias.length)) best = { code: row[0], alias, row, direct: false };
        }
      }
    }
    recordMatch(result, field, best, false);
  }

  const roastSource'''
updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'failed to apply explicit-label precedence: {count}')
for marker in [
    "if (labeledValue)",
    "result[customField] = labeledValue",
    "continue;",
]:
    if marker not in updated:
        raise SystemExit(f'missing precedence marker: {marker}')
path.write_text(updated, encoding='utf-8')
print('Applied explicit-label precedence for OCR field parsing.')
