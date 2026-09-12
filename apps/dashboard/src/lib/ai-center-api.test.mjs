import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const path = new URL('./ai-center-api.ts', import.meta.url);
const result = { result: 'Sample', confidence: 87, humanReviewRequired: true, reviewStatus: 'pending', auditId: 'sample-1' };
const snapshot = { model: { name: 'Catalog', status: 'available', providers: [] }, capabilities: [], agents: [], skills: [], mcpConnectors: [], sampleResult: result };

async function load(fetch, timers = {}) {
  assert.ok(fs.existsSync(path), 'AI transport with supported business-token authentication is missing');
  const context = vm.createContext({ fetch, AbortController, DOMException, setTimeout, clearTimeout, ...timers });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(path, 'utf8')), {
    context, initializeImportMeta: (meta) => { meta.env = { VITE_API_BASE_URL: '/custom/api/' }; },
  });
  await module.link(() => { throw new Error('Transport must not need dependencies'); });
  await module.evaluate();
  return module.namespace;
}

test('anonymous identity is read through GET auth/me without credentials', async () => {
  const calls = [];
  const api = await load(async (url, init) => {
    calls.push({ url, init });
    return Response.json({ user: { openid: 'sample-reviewer', displayName: 'Reviewer', permissions: ['review'] } });
  });
  const user = await api.authenticateAiReviewer();
  assert.equal(user.openid, 'sample-reviewer');
  assert.deepEqual(Array.from(user.permissions), ['review']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/custom/api/auth/me');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(new Headers(calls[0].init.headers).has('Authorization'), false);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.doesNotMatch(fs.readFileSync(path, 'utf8'), /localStorage|sessionStorage|wechat-login|operatorId|X-Admin-Token/);
});

test('anonymous identity needs no token and malformed review drafts never issue requests', async () => {
  let calls = 0;
  const api = await load(async () => {
    calls += 1;
    return Response.json({ user: { openid: 'sample', role: '管理员' } });
  });
  await assert.rejects(api.submitAiReview('', 'confirmed', 'Checked'), (error) => error.status === 422);
  assert.equal(calls, 0);
  assert.deepEqual(Array.from((await api.authenticateAiReviewer()).permissions), []);
});

test('invalid identities and permissions cannot become authenticated users', async () => {
  for (const user of [null, {}, { openid: '' }, { openid: 'sample', permissions: 'review' }, { openid: 'sample', permissions: [7] }]) {
    const api = await load(async () => Response.json({ user }));
    await assert.rejects(api.authenticateAiReviewer(), (error) => error.status === 502);
  }
});

test('reviews send only server-owned identity contract fields and require matching acknowledgment', async () => {
  let body;
  const api = await load(async (url, init) => {
    assert.equal(url, '/custom/api/ai-center/review');
    assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    body = JSON.parse(init.body);
    return Response.json({ ...result, reviewStatus: 'confirmed' });
  });
  assert.equal((await api.submitAiReview('sample-1', 'confirmed', ' Checked ')).reviewStatus, 'confirmed');
  assert.deepEqual(body, { auditId: 'sample-1', decision: 'confirmed', reason: 'Checked' });
  for (const next of [{}, { ...result, auditId: 'other', reviewStatus: 'confirmed' }, result]) {
    const invalid = await load(async () => Response.json(next));
    await assert.rejects(invalid.submitAiReview('sample-1', 'confirmed', 'Checked'), (error) => error.status === 502);
  }
});

test('runtime can retry after failure, is uncached and never receives a business token', async () => {
  let count = 0;
  const api = await load(async (url, init) => {
    assert.equal(url, '/custom/api/ai-center/runtime');
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    return ++count === 1 ? new Response('down', { status: 503 }) : Response.json(snapshot);
  });
  await assert.rejects(api.getAiRuntime(), (error) => error.status === 503);
  assert.equal((await api.getAiRuntime()).sampleResult.auditId, 'sample-1');
  for (const status of [401, 403, 404, 422]) {
    const failed = await load(async () => new Response('private upstream detail', { status }));
    await assert.rejects(failed.getAiRuntime(), (error) => error.status === status && !error.message.includes('private'));
  }
});

test('malformed runtime is an explicit error instead of crashing the render or showing success', async () => {
  for (const payload of [{}, { ...snapshot, agents: [null] }, { ...snapshot, model: { ...snapshot.model, providers: null } }, { ...snapshot, sampleResult: { ...result, reviewStatus: 'unknown' } }]) {
    const api = await load(async () => Response.json(payload));
    await assert.rejects(api.getAiRuntime(), (error) => error.status === 502);
  }
});

test('cancellation covers pre-abort and responses arriving after abort', async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = await load(async () => {
    calls += 1;
    controller.abort();
    return Response.json(snapshot);
  });
  await assert.rejects(api.getAiRuntime(controller.signal), (error) => error.name === 'AbortError');
  await assert.rejects(api.getAiRuntime(controller.signal), (error) => error.name === 'AbortError');
  assert.equal(calls, 1);
});

test('request timeout covers body reads and always clears its timer', async () => {
  let expire;
  let cleared = 0;
  const api = await load(async (_url, init) => ({
    ok: true, status: 200,
    json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })),
  }), {
    setTimeout: (callback, delay) => { assert.equal(delay, 15000); expire = callback; return 1; },
    clearTimeout: () => { cleared += 1; },
  });
  const pending = api.getAiRuntime();
  await new Promise(setImmediate);
  expire();
  await assert.rejects(pending, (error) => error.status === 408);
  assert.equal(cleared, 1);
});
