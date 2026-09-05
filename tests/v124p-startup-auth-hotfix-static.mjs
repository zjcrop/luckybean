import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const startup = read('src/core/startup-controller.js');
const auth = read('src/services/cloud-auth-service.js');

assert.match(startup, /typeof globalThis\.structuredClone !== 'function'/, 'startup must install a structuredClone compatibility fallback');
assert.match(startup, /globalThis\.structuredClone = cloneFallback/, 'structuredClone fallback must be installed before app import');
assert.match(startup, /dataset\.cloneCompatibility = 'fallback'/, 'startup must expose compatibility diagnostics');
assert.match(startup, /dataset\.localDeviceStorage = 'fallback'/, 'device-id persistence failure must degrade instead of aborting startup');
assert.match(startup, /LOCAL_DEVICE_TIMEOUT_MS = 2500/, 'IndexedDB bootstrap must have a short hard deadline');
assert.match(startup, /Promise\.race\(\[storageTask, timeout\]\)/, 'startup must continue when IndexedDB stalls');
assert.match(startup, /dataset\.localDeviceStorage = 'fallback-timeout'/, 'storage timeout degradation must be observable');
assert.match(startup, /await ensureLocalDevice\(\);[\s\S]*await import\(`\.\.\/app\.js\?v=/, 'app import must follow a bounded device bootstrap rather than an unbounded IndexedDB wait');
assert.match(startup, /\|\| '1\.24P-main\.2'/, 'startup fallback revision must match the current release');

assert.match(auth, /mode === 'register' && input\.password\.length < 8/, 'eight-character minimum must apply only to registration');
assert.doesNotMatch(auth, /if \(input\.password\.length < 8\)/, 'legacy account login must not be blocked by the registration password rule');
assert.match(auth, /email_not_confirmed/, 'email verification state must be translated explicitly');
assert.match(auth, /invalid_credentials/, 'invalid credentials state must be translated explicitly');
assert.match(auth, /over_email_send_rate_limit/, 'email rate-limit state must be translated explicitly');
assert.match(auth, /typeof AbortController === 'function'/, 'auth requests must degrade when AbortController is unavailable');
assert.match(auth, /cloud-auth-service-v6-atomic-callback/, 'current auth revision marker must be present');
assert.match(auth, /INITIAL_AUTH_CALLBACK_PARAMS = parseAuthCallbackHash\(location\.hash\)/, 'auth callback must be captured synchronously at module evaluation');
assert.match(auth, /if \(authCallbackPromise\) return authCallbackPromise/, 'concurrent callback consumers must share one promise');
assert.match(auth, /authCallbackConsumed/, 'callback state must prevent replay after URL cleanup');
assert.match(auth, /writeSession\(provisional\);[\s\S]*clearAuthCallbackUrl\(\);[\s\S]*rawRequest\('\/auth\/v1\/user'/, 'callback tokens must be persisted and URL scrubbed before profile fetch');
assert.match(auth, /profilePending:true/, 'auth state must expose profile enrichment without blocking session acceptance');
assert.match(auth, /consumeAuthCallback/, 'email verification callback must be consumed before normal warm-up');
assert.match(auth, /volatileSession/, 'storage failure must preserve a non-destructive volatile session');

console.log('LuckyBean P0 startup/auth v6 atomic callback contract passed');