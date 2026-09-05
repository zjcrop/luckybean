import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const startup = read('src/core/startup-controller.js');
const auth = read('src/services/cloud-auth-service.js');

const authScript = index.match(/<script[^>]*src="\.\/src\/services\/cloud-auth-service\.js\?v=[^"]+"[^>]*><\/script>/)?.[0] || '';
assert.ok(index.indexOf('src/services/cloud-auth-service.js') < index.indexOf('src/core/startup-controller.js'), 'auth callback capture must load before local app startup can advance URL/application state');
assert.ok(authScript, 'cloud auth bootstrap script must be present');
assert.doesNotMatch(authScript, /type="module"/, 'Safari auth callback capture must execute synchronously as a classic same-origin script, not enter the deferred module queue');
assert.match(startup, /typeof globalThis\.structuredClone !== 'function'/, 'startup must install a structuredClone compatibility fallback');
assert.match(startup, /globalThis\.structuredClone = cloneFallback/, 'structuredClone fallback must be installed before app import');
assert.match(startup, /dataset\.cloneCompatibility = 'fallback'/, 'startup must expose compatibility diagnostics');
assert.match(startup, /dataset\.localDeviceStorage = 'fallback'/, 'device-id persistence failure must degrade instead of aborting startup');
assert.match(startup, /await import\(`\.\.\/app\.js\?v=/, 'app import must remain behind startup compatibility setup');
assert.match(startup, /1\.24P-main\.3/, 'startup fallback revision must match the current release');

assert.match(auth, /mode === 'register' && input\.password\.length < 8/, 'eight-character minimum must apply only to registration');
assert.doesNotMatch(auth, /if \(input\.password\.length < 8\)/, 'legacy account login must not be blocked by the registration password rule');
assert.match(auth, /email_not_confirmed/, 'email verification state must be translated explicitly');
assert.match(auth, /invalid_credentials/, 'invalid credentials state must be translated explicitly');
assert.match(auth, /over_email_send_rate_limit/, 'email rate-limit state must be translated explicitly');
assert.match(auth, /typeof AbortController === 'function'/, 'auth requests must degrade when AbortController is unavailable');
assert.match(auth, /cloud-auth-service-v7-immediate-atomic-callback/, 'current immediate atomic callback auth revision marker must be present');
assert.match(auth, /INITIAL_AUTH_CALLBACK_PARAMS = parseAuthCallbackHash\(location\.hash\)/, 'email verification callback must be captured before normal session warm-up');
assert.match(auth, /volatileStorage/, 'Safari/localStorage failure must retain a non-destructive volatile auth fallback');
assert.match(auth, /writeSession\(provisional\);[\s\S]*clearAuthCallbackUrl\(\);/, 'callback session must be accepted before profile/network enrichment');
assert.match(auth, /void warmSession\(\)\.catch/, 'callback consumption must begin immediately instead of waiting for a later microtask');
assert.doesNotMatch(auth, /queueMicrotask\(\(\) => warmSession/, 'Safari callback acceptance must not depend on microtask scheduling');

console.log('LuckyBean P0 synchronous Safari auth callback and startup compatibility contract passed');
