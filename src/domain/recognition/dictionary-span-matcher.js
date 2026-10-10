/**
 * Character-stream matching for coffee dictionary terms.
 *
 * OCR layout separators are not token boundaries: spaces, punctuation, and line
 * breaks are ignored for lookup while source offsets remain available for audit.
 * The automaton is cached by the rows array so each active codebook is indexed once.
 */
const automata = new WeakMap();
const ignoredValues = new Set(['active', 'candidate']);

function normalizeCharacter(character) {
  return character.normalize('NFKC').toLocaleLowerCase('zh-CN');
}

function isSeparator(character) {
  return /[\s\p{P}\p{S}]/u.test(character);
}

function normalizeWithOffsets(value) {
  const source = String(value ?? '');
  const characters = [];
  const sourceOffsets = [];
  let sourceOffset = 0;

  for (const original of source) {
    const start = sourceOffset;
    sourceOffset += original.length;
    const normalized = normalizeCharacter(original);
    for (const character of normalized) {
      if (isSeparator(character)) continue;
      characters.push(character);
      sourceOffsets.push({ start, end:sourceOffset });
    }
  }

  return { text:characters.join(''), characters, sourceOffsets };
}

function aliasesForRow(row) {
  const result = [];
  for (const value of Array.isArray(row) ? row.slice(1) : []) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || ignoredValues.has(trimmed.toLocaleLowerCase('en-US')) || trimmed.includes('_')) continue;
    for (const alias of trimmed.split(/[\\/、,，;；|]+/).map(item => item.trim()).filter(Boolean)) {
      const normalized = normalizeWithOffsets(alias).text;
      if ([...normalized].length >= 2) result.push({ alias, normalized });
    }
  }
  return result;
}

function buildAutomaton(rows) {
  const root = { next:new Map(), fail:null, outputs:[] };
  for (const row of rows || []) {
    const code = String(row?.[0] || '');
    if (!code) continue;
    for (const { alias, normalized } of aliasesForRow(row)) {
      let node = root;
      for (const character of normalized) {
        if (!node.next.has(character)) node.next.set(character, { next:new Map(), fail:null, outputs:[] });
        node = node.next.get(character);
      }
      node.outputs.push({ code, alias, row, normalized, normalizedLength:[...normalized].length });
    }
  }

  root.fail = root;
  const queue = [];
  let queueIndex = 0;
  for (const child of root.next.values()) { child.fail = root; queue.push(child); }
  while (queueIndex < queue.length) {
    const node = queue[queueIndex++];
    for (const [character, child] of node.next) {
      let fallback = node.fail;
      while (fallback !== root && !fallback.next.has(character)) fallback = fallback.fail;
      child.fail = fallback.next.get(character) || root;
      child.outputs.push(...child.fail.outputs);
      queue.push(child);
    }
  }
  return root;
}

function automatonFor(rows) {
  if (!Array.isArray(rows)) return buildAutomaton([]);
  let value = automata.get(rows);
  if (!value) { value = buildAutomaton(rows); automata.set(rows, value); }
  return value;
}

/**
 * Return exact dictionary spans found in an OCR character stream. Matching spans
 * may cross arbitrary whitespace, punctuation, or line boundaries.
 */
export function findDictionarySpans(text, rows, { limit = 32 } = {}) {
  const normalized = normalizeWithOffsets(text);
  if (!normalized.text) return [];
  const root = automatonFor(rows);
  const matches = [];
  let node = root;

  for (let index = 0; index < normalized.characters.length; index += 1) {
    const character = normalized.characters[index];
    while (node !== root && !node.next.has(character)) node = node.fail;
    node = node.next.get(character) || root;
    for (const output of node.outputs) {
      const normalizedStart = index - output.normalizedLength + 1;
      if (normalizedStart < 0) continue;
      const first = normalized.sourceOffsets[normalizedStart];
      const last = normalized.sourceOffsets[index];
      matches.push({
        code:output.code,
        alias:output.alias,
        row:output.row,
        start:first.start,
        end:last.end,
        normalizedLength:output.normalizedLength
      });
    }
  }

  matches.sort((left, right) =>
    right.normalizedLength - left.normalizedLength
    || left.start - right.start
    || left.code.localeCompare(right.code)
  );
  const unique = [];
  const seen = new Set();
  for (const match of matches) {
    const key = `${match.code}\u0000${match.start}\u0000${match.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(match);
    if (unique.length >= Math.max(1, Number(limit) || 32)) break;
  }
  return unique;
}

/** Select the longest unambiguous canonical row match from one field's evidence. */
export function bestDictionarySpan(text, rows) {
  const matches = findDictionarySpans(text, rows);
  if (!matches.length) return null;
  const longest = matches[0].normalizedLength;
  const top = matches.filter(match => match.normalizedLength === longest);
  const codes = new Set(top.map(match => match.code));
  if (codes.size !== 1) return null;
  return top[0];
}
