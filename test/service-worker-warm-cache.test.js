import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('sw.js', 'utf8');
const release = JSON.parse(readFileSync('release.json', 'utf8'));
function harness(networkHtml = '', delayMs = 0) {
  const handlers = {}, writes = [], calls = [];
  const context = { URL, Request, Response, setTimeout, clearTimeout,
    self:{location:{origin:'https://example.test'},addEventListener:(name,handler)=>handlers[name]=handler},
    caches:{open:async name=>({match:async request=>new Response(String(request).includes('index.html') ? `<meta name="release-revision" content="${release.revision}">` : 'cached module'),put:async(_request,response)=>writes.push(await response.text())})},
    fetch:async request=>{calls.push(request.url);if(delayMs) await new Promise(resolve=>setTimeout(resolve,delayMs));return new Response(networkHtml || 'fresh module');}
  };
  vm.runInNewContext(source, context);
  async function fetchEvent(url, {navigate=false,clientId='old',resultingClientId=''}={}) {
    const request = new Request(url);
    if (navigate) Object.defineProperty(request,'mode',{value:'navigate'});
    const pending=[];let result;
    handlers.fetch({request,clientId,resultingClientId,respondWith:value=>result=value,waitUntil:task=>pending.push(task)});
    const response = await result;
    const text = await response.text();
    await Promise.all(pending);
    return text;
  }
  return {fetchEvent,calls,writes};
}

test('warm app assets are returned from the current revision cache without network requests', async()=>{
  const h = harness();
  assert.equal(await h.fetchEvent('https://example.test/src/app.js'),'cached module');
  assert.equal(h.calls.length,0);
});

test('newer HTML cannot load an unversioned module from the old revision cache', async()=>{
  const newer = '1.24P-main.999';
  const h = harness(`<meta name="release-revision" content="${newer}">`);
  await h.fetchEvent('https://example.test/',{navigate:true,resultingClientId:'new'});
  assert.equal(h.writes.length,0);
  await h.fetchEvent('https://example.test/src/app.js',{clientId:'new'});
  assert.equal(h.calls.length,2);
  assert.equal(h.writes.length,0);
});

test('late background discovery of a new release cannot change the modules of cached HTML already served', async()=>{
  const h = harness('<meta name="release-revision" content="1.24P-main.999">',900);
  await h.fetchEvent('https://example.test/',{navigate:true,resultingClientId:'old-served'});
  assert.equal(await h.fetchEvent('https://example.test/src/app.js',{clientId:'old-served'}),'cached module');
  assert.equal(h.calls.length,1);
});
