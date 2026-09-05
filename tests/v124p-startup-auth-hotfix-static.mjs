import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const startup = read('src/core/startup-controller.js');
const auth = read('src/services/cloud-auth-service.js');

assert.match(startup, /typeof globalThis\.structuredClone !== 'function'/, 'startup must install a structuredClone compatibility fallback');
assert.match(startup, /globalThis\.structuredClone = cloneFallback/, 'structuredClone fallback must be installed before app import');
assert.match(startup, /dataset\.cloneCompatibility = 'fallback'/, 'startup must expose compatibility diagnostics');
assert.match(startup, /dataset\.localDeviceStorage = 'fallback'/, 'device-id persistence failure must degrade instead of aborting startup');
assert.match(startup, /await import\(`\.\.\/app\.js\?v=/, 'app import must remain behind startup compatibility setup');

assert.match(auth, /mode === 'register' && input\.password\.length < 8/, 'eight-character minimum must apply only to registration');
assert.doesNotMatch(auth, /if \(input\.password\.length < 8\)/, 'legacy account login must not be blocked by the registration password rule');
assert.match(auth, /email_not_confirmed/, 'email verification state must be translated explicitly');
assert.match(auth, /invalid_credentials/, 'invalid credentials state must be translated explicitly');
assert.match(auth, /over_email_send_rate_limit/, 'email rate-limit state must be translated explicitly');
assert.match(auth, /typeof AbortController === 'function'/, 'auth requests must degrade when AbortController is unavailable');
assert.match(auth, /cloud-auth-service-v4-ios-callback/, 'current auth revision marker must be present');
assert.match(auth, /consumeAuthCallback/, 'email verification callback must be consumed before normal warm-up');
assert.match(auth, /volatileSession/, 'storage failure must preserve a non-destructive volatile session');

console.log('LuckyBean P0 startup/auth v4 hotfix static contract passed');
