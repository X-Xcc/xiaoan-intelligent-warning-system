import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';

const sourcePath = new URL('./admin-request.ts', import.meta.url);
test('admin transport is anonymous and restricted to its configured API', async () => {
  assert.ok(fs.existsSync(sourcePath), 'Authenticated admin transport is missing');
  const output = stripTypeScriptTypes(fs.readFileSync(sourcePath, 'utf8'));
  const { createAdminRequest } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const request = createAdminRequest('http://localhost:8080/api');
    assert.deepEqual(await request('/overview'), { ok: true });
    assert.equal(calls[0].url, 'http://localhost:8080/api/admin/overview');
    assert.equal(new Headers(calls[0].init.headers).has('X-Admin-Token'), false);
    await request('http://localhost:8080/api/events/alarm-pushes');
    await assert.rejects(request('https://example.com/api/events'), /API/);
    await assert.rejects(request('http://localhost:8080/not-api'), /API/);
    assert.equal(calls.length, 2);
    globalThis.fetch = async () => new Response('unauthorized', { status: 401 });
    await assert.rejects(request('/overview'), (error) => error.status === 401);
  } finally {
    globalThis.fetch = original;
  }
});
