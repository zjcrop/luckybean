import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const bootstrap = read('src/core/auth-callback-bootstrap.js');
const startup = read('src/core/startup-controller.js');
const auth = read('src/services/cloud-auth-service.js');

const snapshotPos = index.indexOf('src/core/auth-callback-bootstrap.js');
const headEnd = index.indexOf('</head>');
const authPos = index.indexOf('src/services/cloud-auth-service.js');
const startupPos = index.indexOf('src/core/startup-controller.js');
const snapshotScript = index.match(/<script[^>]*src="\.\/src\/core\/auth-callback-bootstrap\.js\?v=[^"]+"[^>]*><\/script>/)?.[0] || '';
const authScript = index.match(/<script[^>]*src="\.\/src\/services\/cloud-auth-service\.js\?v=[^"]+"[^>]*><\/script>/)?.[0] || '';

assert.ok(snapshotPos >= 0 && snapshotPos < headEnd, 'auth callback snapshot must execute in head before deferred application startup');
assert.ok(snapshotPos < authPos && authPos < startupPos, 'auth snapshot, auth module and local startup must keep deterministic order');
assert.ok(snapshotScript, 'head auth callback snapshot script must be present');
assert.doesNotMatch(snapshotScript, /type="module"/, 'callback snapshot must execute synchronously before deferred module scripts');
assert.match(authScript, /type="module"/, 'full cloud auth service must remain module-scheduled so Safari startup does not block later runtime modules');
assert.match(bootstrap, /__LuckyBeanInitialAuthCallbackHash/, 'head bootstrap must snapshot a relevant callback hash');
assert.match(bootstrap, /if \(!location\.hash\)/, 'head bootstrap must restore a callback hash if Safari drops it before auth initialization');
assert.match(bootstrap, /globalThis\.LuckyBeanCloudAuth/, 'head guard must release as soon as the auth service is initialized');
assert.match(bootstrap, /delete globalThis\.__LuckyBeanInitialAuthCallbackHash/, 'callback snapshot must be removed after auth initialization');

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
assert.match(auth, /INITIAL_AUTH_CALLBACK_PARAMS = parseAuthCallbackHash\(location\.hash\)/, 'auth service must still capture the guarded callback before normal session warm-up');
assert.match(auth, /volatileStorage/, 'Safari/localStorage failure must retain a non-destructive volatile auth fallback');
assert.match(auth, /writeSession\(provisional\);[\s\S]*clearAuthCallbackUrl\(\);/, 'callback session must be accepted before profile/network enrichment');
assert.match(auth, /void warmSession\(\)\.catch/, 'callback consumption must begin immediately instead of waiting for a later microtask');
assert.doesNotMatch(auth, /queueMicrotask\(\(\) => warmSession/, 'Safari callback acceptance must not depend on microtask scheduling');

console.log('LuckyBean P0 head callback snapshot, module auth and startup compatibility contract passed');
