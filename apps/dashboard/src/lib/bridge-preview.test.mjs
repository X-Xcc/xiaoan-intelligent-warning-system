import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Run the real preview effect with a deterministic clock and image decoder.
function previewLoop({ latency = 20, failure = false } = {}) {
  let now = 0;
  let requests = 0;
  let pending = 0;
  let maxPending = 0;
  let signal;
  const timers = [];
  const effects = [];
  const revoked = [];
  const api = {
    hasFreshFrame: () => true,
    bridgeSourceKey: () => 'camera',
    bridgeErrorMessage: () => 'unavailable',
    requestBridgeSnapshot: async (_id, abortSignal) => {
      signal = abortSignal;
      requests++;
      maxPending = Math.max(maxPending, ++pending);
      now += latency;
      await Promise.resolve();
      pending--;
      if (failure) throw new Error('offline');
      return {};
    },
  };
  const hooks = {
    useRef: (value) => ({ current: value }),
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: (effect) => effects.push(effect),
  };
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('../components/BridgePreview.tsx', import.meta.url), 'utf8');
  const compiled = transformSync(source, {
    loader: 'tsx', format: 'cjs', jsx: 'automatic',
  }).code;
  vm.runInNewContext(compiled, {
    exports: module.exports, module,
    require: (name) => name === 'react' ? hooks
      : name === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
        : name.includes('device-bridges-api') ? api : {},
    Date: { now: () => now },
    performance: { now: () => now },
    AbortController,
    URL: { createObjectURL: () => `blob:${requests}`, revokeObjectURL: (url) => revoked.push(url) },
    Image: class { async decode() {} },
    window: { setInterval: () => 1, clearInterval: () => {} },
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
  });
  const element = module.exports.BridgePreview({
    compact: true, available: true, authorized: true, device: { id: 'camera', fps: 10 },
  });
  element.type(element.props);
  const cleanup = effects.map((effect) => effect()).filter(Boolean);
  return {
    timers, revoked,
    get requests() { return requests; },
    get maxPending() { return maxPending; },
    get aborted() { return signal.aborted; },
    get now() { return now; },
    async next() {
      await new Promise(setImmediate);
      const timer = timers.shift();
      assert.ok(timer, 'preview should schedule its next frame');
      now += timer.delay;
      timer.callback();
      await new Promise(setImmediate);
    },
    stop() { cleanup.forEach((fn) => fn()); },
  };
}

test('compact previews sustain at least 8 refreshes/sec on a fast local connection', async () => {
  const loop = previewLoop();
  for (let i = 0; i < 10; i++) await loop.next();
  assert.ok(loop.now <= 1250, `10 refresh intervals took ${loop.now}ms`);
  assert.equal(loop.maxPending, 1);
  loop.stop();
  assert.equal(loop.aborted, true);
  assert.equal(loop.timers.length, 0);
  assert.equal(loop.revoked.length, loop.requests);
});

test('slow responses do not add a full idle interval or overlap requests', async () => {
  const loop = previewLoop({ latency: 200 });
  await new Promise(setImmediate);
  assert.ok(loop.timers[0].delay <= 16, 'request time should count toward the refresh interval');
  await loop.next();
  assert.equal(loop.maxPending, 1);
  loop.stop();
});

test('failed snapshots back off instead of retrying at video cadence', async () => {
  const loop = previewLoop({ failure: true });
  await new Promise(setImmediate);
  assert.ok(loop.timers[0].delay >= 500);
  loop.stop();
  assert.equal(loop.timers.length, 0);
});
