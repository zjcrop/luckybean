import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Gecko native transport preserves mixed arrays, null, Unicode and native arguments', async () => {
  let receive;
  const sent = [];
  const callbacks = [];
  const listeners = new Map();
  const port = {
    postMessage(envelope) {
      // GeckoBundle sees a single string, never arbitrary application arrays.
      assert.deepEqual(Object.keys(envelope), ['json']);
      assert.equal(typeof envelope.json, 'string');
      sent.push(JSON.parse(envelope.json));
    },
    onMessage: { addListener(callback) { receive = callback; } },
    onDisconnect: { addListener() {} }
  };
  const context = vm.createContext({
    browser: { runtime: { connectNative() { return port; } } },
    document: { addEventListener(type, callback) { listeners.set(type, callback); } },
    window: { addEventListener() {} },
    LuckyBeanStoreBridge: { resolve(id, value) { callbacks.push({ id, value }); } },
    console, setTimeout, clearTimeout
  });
  vm.runInContext(await readFile(new URL('../android/gecko/bridge.js', import.meta.url), 'utf8'), context);
  const payload = { nested: [true, 3, '原样保留', null, { x: [1, 'two'] }] };
  context.LuckyBeanRoomNative.request('room-1', JSON.stringify({ method: 'put', store: 'beans', value: payload }));
  assert.deepEqual(JSON.parse(sent.pop().json).value, payload);
  receive({ json: JSON.stringify({ type: 'callback', callback: 'store.resolve', id: 'room-1', value: payload }) });
  assert.deepEqual(JSON.parse(JSON.stringify(callbacks.pop())), { id: 'room-1', value: payload });
  receive({ json: JSON.stringify({ type: 'callback', callback: 'store.resolve', id: 'room-2', value: null }) });
  assert.equal(callbacks.pop().value, null);
  const binding = context.LuckyBeanNative.bindImageSource('photo-1', true);
  const request = sent.pop();
  assert.deepEqual(request.args, ['photo-1', true]);
  receive({ json: JSON.stringify({ type: 'result', id: request.id, value: 'data:image/jpeg;base64,AA==', error: null }) });
  assert.equal(await binding, 'data:image/jpeg;base64,AA==');
  listeners.get('luckybean:local-app-ready')();
  assert.deepEqual(sent.pop(), { type: 'ready' });
});
