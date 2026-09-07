import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesBeanSelection, queryBeansForSelection } from '../src/domain/beans/bean-selection-query.js';

const beans = [
  { id:'a', createdAt:'2026-08-01T10:00:00.000Z', roastDate:'2026-07-28', remainingWeight:90, countryCode:'ET', regionCode:'GUJI' },
  { id:'b', createdAt:'2026-09-01T10:00:00.000Z', roastDate:'2026-08-30', remainingWeight:20, countryCode:'CO', regionCode:'HUILA' }
];
const facts = bean => bean.id === 'a' ? { country:'埃塞俄比亚', origin:'古吉' } : { country:'哥伦比亚', origin:'慧兰' };

test('selection query combines date, remaining, country and origin filters with AND semantics', () => {
  const result = queryBeansForSelection(beans, {
    addedFrom:'2026-07-01', addedTo:'2026-08-31', roastFrom:'2026-07-01', roastTo:'2026-08-01',
    remainingMin:50, remainingMax:100, country:'埃塞俄比亚', origin:'古吉'
  }, facts);
  assert.deepEqual(result.map(bean => bean.id), ['a']);
});

test('zero remaining threshold is treated as an explicit numeric boundary', () => {
  assert.equal(matchesBeanSelection({ id:'x', remainingWeight:0 }, { remainingMax:0 }), true);
  assert.equal(matchesBeanSelection({ id:'x', remainingWeight:1 }, { remainingMax:0 }), false);
});
