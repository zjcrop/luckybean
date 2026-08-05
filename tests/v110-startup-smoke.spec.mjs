import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const SUPABASE_PATTERN = 'https://vaxwncdcuvbpvdbbketb.supabase.co/**';

function diagnosticsCollector(page) {
  const pageErrors = [];
  const missingResponses = [];
  const failedRequests = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('response', response => {
    if (response.status() === 404) missingResponses.push(response.url());
  });
  page.on('requestfailed', request => failedRequests.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`));
  return {
    pageErrors,
    missingResponses,
    failedRequests,
    uniqueErrors: () => [...new Set(pageErrors)],
    unique404s: () => [...new Set(missingResponses)]
  };
}

async function openLocalApp(page, suffix) {
  await page.goto(`${BASE_URL}/?${suffix}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#splashScreen')).toBeVisible();
  await expect(page.locator('#splashImage')).toBeVisible();
  await page.locator('#splashScreen').click();
  await expect(page.locator('#appShell')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#loginScreen')).toBeHidden();
  await expect(page.locator('#pageBeans')).toBeVisible();
  await page.waitForFunction(() => Boolean(globalThis.LuckyBeanCompatibilityLayer), null, { timeout: 15000 });
}

function jwt(expSeconds) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: expSeconds, sub: 'sync-user' })}.signature`;
}

test('server failure never blocks local startup', async ({ page }) => {
  const capture = diagnosticsCollector(page);
  await page.addInitScript(() => {
    localStorage.setItem('luckybean.supabase.session.v099d', JSON.stringify({
      refresh_token: 'smoke-test-invalid-refresh-token',
      access_token: '',
      user: { id: 'smoke-user', email: 'smoke@example.com' }
    }));
    localStorage.setItem('luckybean.cloud.remember.until.v1', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  });
  await page.route(SUPABASE_PATTERN, route => route.abort('failed'));

  await openLocalApp(page, 'offline-smoke=1');
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => ({
    startup: document.documentElement.dataset.startup,
    cloudAuth: document.documentElement.dataset.cloudAuth,
    compatibilityFailures: globalThis.LuckyBeanCompatibilityLayer?.failures || [],
    syncServiceLoaded: Boolean(globalThis.LuckyBeanCloudSync),
    authServiceLoaded: Boolean(globalThis.LuckyBeanCloudAuth),
    appearanceLoaded: Boolean(globalThis.LuckyBeanAppearanceController)
  }));

  expect(state.startup).toBe('ready');
  expect(['offline', 'reauth-required', 'signed-out']).toContain(state.cloudAuth);
  expect(state.compatibilityFailures).toEqual([]);
  expect(state.syncServiceLoaded).toBe(true);
  expect(state.authServiceLoaded).toBe(true);
  expect(state.appearanceLoaded).toBe(true);
  expect(capture.uniqueErrors()).toEqual([]);
  expect(capture.unique404s()).toEqual([]);
});

test('expired seven-day cloud memory never blocks local startup', async ({ page }) => {
  const capture = diagnosticsCollector(page);
  let cloudRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem('luckybean.supabase.session.v099d', JSON.stringify({
      refresh_token: 'expired-refresh-token',
      access_token: '',
      user: { id: 'expired-user', email: 'expired@example.com' }
    }));
    localStorage.setItem('luckybean.cloud.remember.until.v1', String(Date.now() - 1000));
  });
  await page.route(SUPABASE_PATTERN, route => {
    cloudRequests += 1;
    route.abort('failed');
  });

  await openLocalApp(page, 'expired-smoke=1');

  const state = await page.evaluate(() => ({
    cloudAuth: document.documentElement.dataset.cloudAuth,
    storedSession: localStorage.getItem('luckybean.supabase.session.v099d'),
    publicId: globalThis.LuckyBeanCloudAuth?.getSession?.()?.user?.id || ''
  }));

  expect(state.cloudAuth).toBe('expired');
  expect(state.storedSession).toBeNull();
  expect(state.publicId).toBe('');
  expect(cloudRequests).toBe(0);
  expect(capture.uniqueErrors()).toEqual([]);
  expect(capture.unique404s()).toEqual([]);
});

test('local changes are saved first and batch-synced after debounce', async ({ page }) => {
  const capture = diagnosticsCollector(page);
  const token = jwt(Math.floor(Date.now() / 1000) + 3600);
  const session = {
    access_token: token,
    refresh_token: 'refresh-token-v1',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'sync-user', email: 'sync@example.com', user_metadata: { nickname: '同步测试' } }
  };
  const requests = { refresh: 0, manifestReads: 0, manifestWrites: [], chunkWrites: [] };

  await page.addInitScript(({ initialSession }) => {
    localStorage.setItem('luckybean.supabase.session.v099d', JSON.stringify(initialSession));
    localStorage.setItem('luckybean.cloud.remember.until.v1', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  }, { initialSession: session });

  await page.route(SUPABASE_PATTERN, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON?.() || null;
    if (url.pathname === '/auth/v1/token') {
      requests.refresh += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
      return;
    }
    if (url.pathname === '/rest/v1/luckybean_sync_manifests' && request.method() === 'GET') {
      requests.manifestReads += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (url.pathname === '/rest/v1/luckybean_sync_chunks' && request.method() === 'POST') {
      requests.chunkWrites.push(body);
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    if (url.pathname === '/rest/v1/luckybean_sync_manifests' && request.method() === 'POST') {
      requests.manifestWrites.push(body);
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    if (request.method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await openLocalApp(page, 'sync-smoke=1');
  await page.waitForFunction(() => ['synced', 'idle'].includes(document.documentElement.dataset.cloudSync), null, { timeout: 25000 });
  requests.manifestWrites.length = 0;
  requests.chunkWrites.length = 0;

  const localResult = await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const record = {
      id: 'smoke-bean-001',
      name: '增量同步测试豆',
      roastDate: '2026-08-01',
      initialWeight: 100,
      remainingWeight: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await db.put('beans', record);
    return {
      stored: await db.get('beans', record.id),
      dirty: JSON.parse(localStorage.getItem('luckybean.cloud.dirty.v3') || 'null')
    };
  });

  expect(localResult.stored?.id).toBe('smoke-bean-001');
  expect(localResult.dirty?.dirty).toBe(true);
  expect(localResult.dirty?.stores).toContain('beans');

  await page.waitForFunction(() => !localStorage.getItem('luckybean.cloud.dirty.v3') && document.documentElement.dataset.cloudSync === 'synced', null, { timeout: 25000 });

  expect(requests.refresh).toBeGreaterThanOrEqual(1);
  expect(requests.manifestReads).toBeGreaterThanOrEqual(1);
  expect(requests.chunkWrites).toHaveLength(1);
  expect(Array.isArray(requests.chunkWrites[0])).toBe(true);
  expect(requests.chunkWrites[0].length).toBeGreaterThan(0);
  expect(requests.manifestWrites).toHaveLength(1);
  expect(requests.manifestWrites[0]?.source_device_id).toBeTruthy();
  expect(capture.uniqueErrors()).toEqual([]);
  expect(capture.unique404s()).toEqual([]);
});
