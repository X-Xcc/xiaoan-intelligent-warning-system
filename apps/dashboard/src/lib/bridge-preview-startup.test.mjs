import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Execute the real component with deterministic hooks, media events, and time.
function preview() {
  let slots = [], effects = [], cursor = 0, dirty = false, mounted = true;
  let now = 0, timerId = 0, tree, identity, updates = 0;
  let props = {
    device: { id: 'camera-a', name: 'Camera A', online: true, webrtc: true },
    available: true, authorized: true, epoch: 0,
  };
  const timers = new Map(), subscriptions = [];
  const media = { srcObject: null, play: () => Promise.resolve() };
  const jsx = (type, props, key) => ({ type, props, key });
  const hooks = {
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {
        updates++;
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        const entry = { deps, effect };
        slots[index] = entry;
        effects.push(() => { previous?.cleanup?.(); entry.cleanup = effect(); });
      }
    },
  };
  const window = {
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(
    fs.readFileSync(new URL('../components/BridgePreview.tsx', import.meta.url), 'utf8'),
    { loader: 'tsx', format: 'cjs', jsx: 'automatic' },
  ).code, {
    module, exports: module.exports, window, RTCPeerConnection: class {},
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'antd') return { Button: 'button' };
      if (name === 'lucide-react') return { CameraOff: 'CameraOff', RefreshCw: 'RefreshCw' };
      if (name === '../lib/device-bridges-api') return {};
      if (name === '../lib/bridge-webrtc') return {
        subscribeBridgeVideo(id, key, publish) {
          const subscription = { id, key, publish, stopped: false };
          subscriptions.push(subscription);
          publish({ stream: null, fps: null, bufferMs: null, dropped: 0, error: '' });
          return () => { subscription.stopped = true; };
        },
      };
      assert.fail(`Unexpected import: ${name}`);
    },
  });
  function findVideo(node) {
    if (Array.isArray(node)) return node.map(findVideo).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return node.type === 'video' ? node : findVideo(node.props?.children);
  }
  function cleanup() { slots.filter(slot => slot?.effect).forEach(slot => slot.cleanup?.()); }
  function render() {
    assert.ok(mounted);
    const element = module.exports.BridgePreview(props);
    if (identity !== element.key) {
      cleanup();
      slots = [];
      identity = element.key;
    }
    let renders = 0;
    do {
      assert.ok(++renders < 20, 'component should settle');
      dirty = false;
      cursor = 0;
      tree = element.type(element.props);
      const video = findVideo(tree);
      if (video) video.props.ref.current = media;
      while (effects.length) effects.shift()();
    } while (dirty);
  }
  render();
  return {
    timers, subscriptions, media,
    get tree() { return tree; },
    get updates() { return updates; },
    update(next) { props = { ...props, ...next }; render(); },
    stream() {
      const stream = {};
      subscriptions.at(-1).publish({ stream, fps: 25, bufferMs: 10, dropped: 0, error: '' });
      render();
      return stream;
    },
    event(name) { findVideo(tree).props[name](); render(); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        now = entry[1].at;
        timers.delete(entry[0]);
        entry[1].callback();
        if (mounted) render();
      }
      now = end;
    },
    unmount() { cleanup(); mounted = false; },
  };
}

test('successful playback survives the startup deadline without releasing WebRTC', t => {
  const app = preview();
  t.after(() => app.unmount());
  const stream = app.stream();
  app.advance(2400);
  app.event('onPlaying');
  app.advance(10000);
  assert.equal(app.tree.props['data-preview-mode'], 'webrtc');
  assert.equal(app.tree.props['data-preview-state'], 'live');
  assert.equal(app.subscriptions[0].stopped, false);
  assert.equal(app.media.srcObject, stream);
  assert.equal(app.timers.size, 0);
});

test('playing clears the deadline and a later waiting event does not restart it', t => {
  const app = preview();
  t.after(() => app.unmount());
  app.stream();
  app.event('onPlaying');
  assert.equal(app.timers.size, 0);
  app.event('onWaiting');
  app.advance(3000);
  assert.equal(app.tree.props['data-preview-mode'], 'webrtc');
  assert.equal(app.tree.props['data-preview-state'], 'unavailable');
  assert.equal(app.subscriptions[0].stopped, false);
});

for (const compact of [false, true]) {
  test(`stalled startup falls back at 2500ms (compact=${compact})`, t => {
    const app = preview();
    t.after(() => app.unmount());
    app.update({ compact });
    app.stream();
    app.advance(2499);
    assert.equal(app.tree.props['data-preview-mode'], 'webrtc');
    app.advance(1);
    assert.equal(app.tree.type.name, compact ? 'SnapshotSource' : 'PreviewSource');
    assert.equal(app.subscriptions[0].stopped, true);
    assert.equal(app.media.srcObject, null);
    assert.equal(app.timers.size, 0);
  });
}

test('unmount clears the startup deadline, subscription, and attached stream', () => {
  const app = preview();
  app.stream();
  app.unmount();
  assert.equal(app.timers.size, 0);
  assert.equal(app.subscriptions[0].stopped, true);
  assert.equal(app.media.srcObject, null);
  const updates = app.updates;
  app.advance(10000);
  assert.equal(app.updates, updates);
});

for (const change of ['device', 'epoch']) {
  test(`${change} change cleans the old deadline and resets a previous fallback`, t => {
    const app = preview();
    t.after(() => app.unmount());
    const reset = value => app.update(change === 'epoch' ? { epoch: value } : {
      device: { id: `camera-${value}`, name: 'New camera', online: true, webrtc: true },
    });
    app.advance(1000);
    reset(1);
    assert.equal(app.subscriptions[0].stopped, true);
    assert.equal(app.timers.size, 1);
    app.advance(1500);
    assert.equal(app.tree.props['data-preview-mode'], 'webrtc');
    app.advance(1000);
    assert.equal(app.tree.type.name, 'PreviewSource');
    reset(2);
    assert.equal(app.tree.props['data-preview-mode'], 'webrtc');
    assert.equal(app.tree.props['data-preview-state'], 'unavailable');
    app.stream();
    app.event('onPlaying');
    app.advance(3000);
    assert.equal(app.tree.props['data-preview-state'], 'live');
    assert.equal(app.subscriptions.at(-1).stopped, false);
  });
}

test('deactivation cancels the deadline and reactivation gets a new startup window', t => {
  const app = preview();
  t.after(() => app.unmount());
  app.advance(1000);
  app.update({ available: false });
  assert.equal(app.timers.size, 0);
  assert.equal(app.subscriptions[0].stopped, true);
  app.advance(3000);
  app.update({ available: true });
  app.advance(2499);
  assert.equal(app.tree.props['data-preview-mode'], 'webrtc');
  app.advance(1);
  assert.equal(app.tree.type.name, 'PreviewSource');
});
