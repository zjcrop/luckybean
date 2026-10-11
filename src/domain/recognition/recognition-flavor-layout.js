const openFlavorTerms = ['月季花', '蔓越莓', '杏桃', '车厘子'];
const termsByBook = new WeakMap();

// These open descriptors retain their original names; they do not invent codes.
export function splitContinuousFlavorList(text, book) {
  const source = String(text || '').trim();
  if (!source || /[\d:：=]/.test(source)) return null;
  let terms = termsByBook.get(book);
  if (!terms) {
    terms = [...new Set([...openFlavorTerms, ...(book?.flavors || []).flatMap(row => (row.length >= 9 ? row.slice(4, 8) : row.slice(1, 4))
      .filter(value => typeof value === 'string').flatMap(value => value.split(/[/、,，;；|]/)).map(value => value.trim()).filter(value => value.length >= 2))])]
      .sort((a, b) => b.length - a.length);
    if (book && typeof book === 'object') termsByBook.set(book, terms);
  }
  const values = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (/[\s·•、,，;；/|]/.test(source[cursor])) { cursor += 1; continue; }
    const term = terms.find(value => source.slice(cursor, cursor + value.length).toLocaleLowerCase('zh-CN') === value.toLocaleLowerCase('zh-CN'));
    if (!term) return null;
    values.push(source.slice(cursor, cursor + term.length));
    cursor += term.length;
  }
  return values.length >= 2 ? values : null;
}
