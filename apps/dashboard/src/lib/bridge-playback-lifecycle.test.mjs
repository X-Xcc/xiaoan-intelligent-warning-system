import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function playback() {
  const slots = [], effects = [], timers = new Map();
  let cursor = 0, timerId = 0, dirty = false, tree, listener, released = 0;
  const props = { device: { id: 'fixture', name: 'Fixture', online: true, webrtc: true }, available: true, authorized: true, compact: true };
  const element = { srcObject: null, play: async () => {} };
  const jsx = (type, props) => ({ type, props });
  const hooks = {
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(slots[index], next)) { slots[index] = next; dirty = true; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        const next = { deps, cleanup: undefined };
        effects.push(() => { previous?.cleanup?.(); next.cleanup = effect(); });
        slots[index] = next;
      }
    },
  };
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('../components/BridgePreview.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module, exports: module.exports, RTCPeerConnection: class {},
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name.endsWith('/bridge-webrtc')) return {
        subscribeBridgeVideo(_id, _key, callback) { listener = callback; return () => { released++; }; },
      };
      return {};
    },
    window: {
      setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
  });
  const Component = module.exports.BridgePreview(props).type;
  function findVideo(node) {
    if (Array.isArray(node)) return node.map(findVideo).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return node.type === 'video' ? node : findVideo(node.props?.children);
  }
  function render() {
    let attempts = 0;
    do {
      assert.ok(++attempts < 10, 'effects should settle');
      dirty = false;
      cursor = 0;
      tree = Component(props);
      const video = findVideo(tree);
      if (video) video.props.ref.current = element;
      while (effects.length) effects.shift()();
    } while (dirty);
    return tree;
  }
  render();
  return {
    timers, render, props,
    get released() { return released; },
    playing() {
      listener({ stream: {}, fps: 25, bufferMs: 0, dropped: 0, error: '' });
      render();
      findVideo(tree).props.onPlaying();
      render();
    },
    expire() {
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
      render();
    },
    stop() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('successful WebRTC playback cancels startup fallback and retains its subscription', () => {
  const app = playback();
  try {
    app.playing();
    assert.equal(app.render().props['data-preview-state'], 'live');
    assert.equal(app.timers.size, 0);
    app.expire();
    assert.equal(app.render().props['data-preview-mode'], 'webrtc');
    assert.equal(app.released, 0);
  } finally { app.stop(); }
});

test('stalled startup still falls back and releases WebRTC', () => {
  const app = playback();
  try {
    app.expire();
    assert.equal(app.render().type.name, 'SnapshotSource');
    assert.equal(app.released, 1);
  } finally { app.stop(); }
});

test('unmount clears startup timers and releases the subscription', () => {
  const app = playback();
  app.stop();
  assert.equal(app.timers.size, 0);
  assert.equal(app.released, 1);
});

test('a new source epoch gets its own startup deadline', () => {
  const app = playback();
  try {
    app.playing();
    app.props.epoch = 1;
    app.render();
    assert.equal(app.timers.size, 1);
    app.expire();
    assert.equal(app.render().type.name, 'SnapshotSource');
  } finally { app.stop(); }
});
