import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const flush = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function dashboard() {
  const slots = [], effects = [], requests = [], updates = [];
  const timers = new Map();
  let cursor = 0, timerId = 0, tree;
  const voice = { stop() {}, speak() {}, setEnabled() {} };
  const jsx = (type, props, key) => ({ type, props, key });
  const hooks = {
    lazy: load => ({ load }), Suspense: 'Suspense',
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        updates.push(slots[index]);
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        const entry = { effect, deps, cleanup: undefined };
        effects.push(() => { previous?.cleanup?.(); entry.cleanup = effect(); });
        slots[index] = entry;
      }
    },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
        slots[index] = { deps, value: callback() };
      }
      return slots[index].value;
    },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
  };
  const window = {
    location: { pathname: '/platform', search: '' },
    setInterval(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, interval: true }); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(new URL('../pages/DashboardApp.tsx', import.meta.url), 'utf8'), {
    loader: 'tsx', format: 'cjs', jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: '/api' }) },
  }).code, {
    module, exports: module.exports, window, URLSearchParams, AbortController,
    fetch(url, options) {
      const response = deferred();
      requests.push({ url, signal: options?.signal, ...response });
      return response.promise;
    },
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name.endsWith('/XiaoanVoice')) return { useXiaoanVoice: () => voice };
      if (name.endsWith('/presentation')) return { viewForPath: () => 'platform' };
      if (name.endsWith('/platform-overview')) return { normalizeLiveOverview: value => value };
      if (name === './PublicSecurityPlatformPage') return { PublicSecurityPlatformPage: 'Overview' };
      return {};
    },
  });
  function render() {
    cursor = 0;
    tree = module.exports.DashboardApp();
    while (effects.length) effects.shift()();
  }
  function find(node, type) {
    if (Array.isArray(node)) return node.map(child => find(child, type)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return node.type === type ? node : find(node.props?.children, type);
  }
  function cleanup() { slots.filter(slot => slot?.effect).forEach(slot => slot.cleanup?.()); }
  render();
  return {
    requests, timers, updates,
    page() { render(); return find(tree, 'Overview').props; },
    poll() { [...timers.values()].filter(timer => timer.interval && timer.delay === 30000).forEach(timer => timer.fn()); },
    expire() {
      const entry = [...timers].find(([, timer]) => !timer.interval && timer.delay === 15000);
      assert.ok(entry, 'overview requests need a 15-second deadline');
      timers.delete(entry[0]);
      entry[1].fn();
    },
    restartEffects() {
      cleanup();
      slots.filter(slot => slot?.effect).forEach(slot => { slot.cleanup = slot.effect(); });
    },
    cleanup,
  };
}

const response = value => ({ ok: true, json: async () => ({ stats: { today_events: value } }) });

test('polling and manual refresh share the pending request and resume after completion', async () => {
  const app = dashboard();
  try {
    const first = app.page().refresh();
    const second = app.page().refresh();
    app.poll();
    assert.equal(app.requests.length, 1);
    assert.equal(first, second);
    assert.equal(app.page().refreshing, true);
    app.requests[0].resolve(response(42));
    await first;
    assert.equal(app.page().overview.stats.today_events, 42);
    assert.equal(app.page().refreshing, false);
    app.poll();
    assert.equal(app.requests.length, 2);
  } finally { app.cleanup(); }
});

test('deadline aborts a pending response body, retains data, and permits another refresh', async () => {
  const app = dashboard();
  try {
    app.requests[0].resolve(response(42));
    await flush();
    const refresh = app.page().refresh();
    const request = app.requests[1];
    assert.ok(request.signal instanceof AbortSignal);
    const body = deferred();
    request.signal.addEventListener('abort', () => body.reject(request.signal.reason), { once: true });
    request.resolve({ ok: true, json: () => body.promise });
    await flush();
    app.expire();
    await refresh;
    assert.equal(request.signal.aborted, true);
    assert.equal(app.page().refreshing, false);
    assert.equal(app.page().overview.stats.today_events, 42);
    app.poll();
    assert.equal(app.requests.length, 3);
  } finally { app.cleanup(); }
});

test('unmount aborts fetch, clears timers, and prevents late updates or refreshes', async () => {
  const app = dashboard();
  const refresh = app.page().refresh;
  app.cleanup();
  assert.equal(app.requests[0].signal?.aborted, true);
  assert.equal(app.timers.size, 0);
  const updates = app.updates.length;
  app.requests[0].resolve(response(99));
  await flush();
  await refresh();
  assert.equal(app.updates.length, updates);
  assert.equal(app.requests.length, 1);
});

test('StrictMode restart ignores an old response and its finally while the new request is pending', async () => {
  const app = dashboard();
  try {
    const old = app.requests[0];
    app.restartEffects();
    assert.equal(old.signal?.aborted, true);
    assert.equal(app.requests.length, 2);
    assert.equal(app.requests[1].signal.aborted, false);
    old.resolve(response(99));
    await flush();
    assert.equal(app.page().refreshing, true);
    assert.notEqual(app.page().overview.stats.today_events, 99);
    app.poll();
    assert.equal(app.requests.length, 2);
    app.requests[1].resolve(response(42));
    await flush();
    assert.equal(app.page().overview.stats.today_events, 42);
    assert.equal(app.page().refreshing, false);
  } finally { app.cleanup(); }
});

test('HTTP failure settles refresh and keeps the last successful overview', async () => {
  const app = dashboard();
  try {
    app.requests[0].resolve(response(42));
    await flush();
    const refresh = app.page().refresh();
    app.requests[1].resolve({ ok: false, status: 503 });
    await refresh;
    assert.equal(app.page().overview.stats.today_events, 42);
    assert.equal(app.page().refreshing, false);
    assert.equal([...app.timers.values()].filter(timer => !timer.interval).length, 0);
  } finally { app.cleanup(); }
});
