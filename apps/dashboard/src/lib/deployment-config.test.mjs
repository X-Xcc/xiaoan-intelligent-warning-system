import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const plain = value => JSON.parse(JSON.stringify(value));
const devEnv = { DEV: true, VITE_AMAP_KEY: 'dev-key', VITE_AMAP_SECURITY_JS_CODE: 'dev-code' };
const emptyMap = { key: '', securityJsCode: '' };
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

async function harness({ env = {}, fetch = async () => new Response('{}') } = {}) {
  const source = new URL('./deployment-config.ts', import.meta.url);
  assert.ok(fs.existsSync(source), 'The runtime deployment config loader is missing');
  const timers = new Map();
  const calls = [];
  const context = vm.createContext({
    AbortController,
    fetch: (...args) => { calls.push(args); return fetch(...args); },
    setTimeout: (callback, delay) => {
      const id = Symbol('timer');
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    console: new Proxy({}, { get: () => () => assert.fail('Config must not be logged') }),
  });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(read('./deployment-config.ts')), {
    context, initializeImportMeta: meta => { meta.env = env; },
  });
  await module.link(() => assert.fail('Config loader should have no runtime imports'));
  await module.evaluate();
  return { api: module.namespace, calls, timers };
}

test('fetches once, uses API prefix, and stores only the browser allowlist in memory', async () => {
  const { api, calls, timers } = await harness({
    env: { ...devEnv, VITE_API_BASE_URL: ' /public-security/api/// ' },
    fetch: async () => Response.json({
      amap: { key: ' runtime-key ', securityJsCode: ' runtime-code ', serverKey: 'ignore' },
      modelApiKey: 'ignore',
    }),
  });
  assert.deepEqual(plain(api.getAmapConfig()), { key: 'dev-key', securityJsCode: 'dev-code' });
  const first = api.loadDeploymentConfig();
  assert.equal(api.loadDeploymentConfig(), first);
  await first;
  await api.loadDeploymentConfig();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/public-security/api/deployment/client-config');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].redirect, 'error');
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.equal(calls[0][1].headers, undefined);
  assert.deepEqual(plain(api.getAmapConfig()), { key: 'runtime-key', securityJsCode: 'runtime-code' });
  assert.ok(Object.isFrozen(api.getAmapConfig()));
  assert.equal(timers.size, 0);
});

test('runtime key never inherits a security code from a different development key', async () => {
  const { api } = await harness({
    env: devEnv,
    fetch: async () => Response.json({ amap: { key: 'runtime-key' } }),
  });
  await api.loadDeploymentConfig();
  assert.deepEqual(plain(api.getAmapConfig()), { key: 'runtime-key', securityJsCode: '' });
});

test('absent, malformed, HTTP and network failures retain the development fallback', async () => {
  const responses = [
    () => Response.json({ amap: emptyMap }),
    () => Response.json({}),
    () => Response.json(null),
    () => Response.json({ amap: { key: 123, securityJsCode: 'code' } }),
    () => Response.json({ amap: { key: 'key', securityJsCode: {} } }),
    () => new Response('<html>not an API</html>'),
    () => new Response('unavailable', { status: 503 }),
    () => { throw new Error('offline'); },
  ];
  for (const response of responses) {
    const { api, calls, timers } = await harness({ env: devEnv, fetch: response });
    await api.loadDeploymentConfig();
    await api.loadDeploymentConfig();
    assert.deepEqual(plain(api.getAmapConfig()), { key: 'dev-key', securityJsCode: 'dev-code' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/api/deployment/client-config');
    assert.equal(timers.size, 0);
  }
});

test('production ignores Vite map values when runtime config is unavailable', async () => {
  const { api } = await harness({ env: { ...devEnv, DEV: false } });
  await api.loadDeploymentConfig();
  assert.deepEqual(plain(api.getAmapConfig()), emptyMap);
});

test('development fallback is trimmed and a security code alone does not enable a map', async () => {
  const { api } = await harness({
    env: { DEV: true, VITE_AMAP_KEY: ' dev-key ', VITE_AMAP_SECURITY_JS_CODE: ' dev-code ' },
  });
  await api.loadDeploymentConfig();
  assert.deepEqual(plain(api.getAmapConfig()), { key: 'dev-key', securityJsCode: 'dev-code' });
  const { api: noKey } = await harness({
    env: { DEV: true, VITE_AMAP_KEY: ' ', VITE_AMAP_SECURITY_JS_CODE: 'unpaired-code' },
  });
  assert.deepEqual(plain(noKey.getAmapConfig()), emptyMap);
});

test('timeout aborts a hung fetch, resolves startup, and ignores late config', async () => {
  let finishFetch;
  const { api, calls, timers } = await harness({
    fetch: () => new Promise(resolve => { finishFetch = resolve; }),
  });
  const pending = api.loadDeploymentConfig();
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 3000);
  timer.callback();
  await pending;
  assert.ok(calls[0][1].signal.aborted);
  assert.deepEqual(plain(api.getAmapConfig()), emptyMap);
  finishFetch(Response.json({ amap: { key: 'too-late-key' } }));
  await new Promise(resolve => setImmediate(resolve));
  await api.loadDeploymentConfig();
  assert.deepEqual(plain(api.getAmapConfig()), emptyMap);
  assert.equal(calls.length, 1);
  assert.equal(timers.size, 0);
});

test('timeout also bounds JSON body reading and keeps the development fallback', async () => {
  let finishBody;
  const { api, timers } = await harness({
    env: devEnv,
    fetch: async () => ({ ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) }),
  });
  const pending = api.loadDeploymentConfig();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finishBody, 'function');
  [...timers.values()][0].callback();
  await pending;
  finishBody({ amap: { key: 'too-late-key' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(plain(api.getAmapConfig()), { key: 'dev-key', securityJsCode: 'dev-code' });
});

test('startup waits for config and the map reads it without HTML or persistent storage', () => {
  assert.match(read('../main.tsx'), /loadDeploymentConfig\(\)\.then\(/);
  const map = read('../components/NanchangAmapMap.tsx');
  assert.match(map, /getAmapConfig\(\)/);
  assert.doesNotMatch(map, /import\.meta\.env\.VITE_AMAP/);
  assert.match(map, /encodeURIComponent\(key\)/);
  for (const source of [map, read('./deployment-config.ts')]) {
    assert.doesNotMatch(source, /innerHTML|dangerouslySetInnerHTML|localStorage|sessionStorage|console\./);
  }
  assert.match(map, /state === 'missing-key'/);
  assert.match(map, /state === 'error'/);
  assert.match(map, /selectedIncident\.longitude, selectedIncident\.latitude/);
});
