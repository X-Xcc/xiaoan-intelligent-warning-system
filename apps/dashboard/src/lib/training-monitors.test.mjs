import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function fixture() {
  const bindings = Array(16).fill(null);
  bindings[0] = 'dog';
  bindings[1] = 'second';
  bindings[2] = 'third';
  const bridge = {
    inventory: { bindings, items: ['third', 'dog', 'second'].map(id => ({ id, name: id })) },
    available: true, busy: false, previewReady: true, previewEpoch: 3,
    authRequired: false, refresh() {}, login() {},
  };
  const states = [];
  let cursor = 0;
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('../components/TrainingCameraPreview.tsx', import.meta.url), 'utf8');
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module, exports: module.exports,
    require(name) {
      if (name === 'react') return {
        useEffect() {}, useRef: () => ({ current: null }),
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
        },
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name.endsWith('use-training-media')) return { useTrainingMedia: () => ({ cameras: [] }) };
      if (name.endsWith('device-bridges-api')) return { useBridgeInventory: () => bridge };
      if (name.endsWith('FakeThermalMonitor')) return { FakeThermalMonitor: 'FakeThermalMonitor' };
      if (name.endsWith('BridgePreview')) return { BridgePreview: 'BridgePreview', BridgeLogin: 'BridgeLogin' };
      return {};
    },
  });
  const render = () => {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      walk(node.props?.children);
    }
    walk(module.exports.TrainingCameraPreview({ taskId: 'task', officer: 'Officer', teamName: 'Team' }));
    return nodes;
  };
  return { bridge, render };
}
const feeds = nodes => nodes.filter(node => node.type === 'BridgePreview');
const fakeFeeds = nodes => nodes.filter(node => node.type === 'FakeThermalMonitor');

test('training uses a fake thermal feed for 02 and the bound bridge feed for 03', () => {
  const f = fixture();
  const nodes = f.render();
  assert.equal(fakeFeeds(nodes).length, 1);
  assert.deepEqual(feeds(nodes).map(n => n.props.device?.id), ['third']);
  assert.equal(f.render().filter(n => n.type === 'video').length, 0);
});

test('refreshing the fake 02 feed resets only local animation state', () => {
  const f = fixture();
  let refreshCalls = 0;
  f.bridge.refresh = () => { refreshCalls += 1; };
  const before = fakeFeeds(f.render())[0].props.animationKey;
  f.render().find(node => node.props?.['aria-label'] === '重连02路监控').props.onClick();
  const after = fakeFeeds(f.render())[0].props.animationKey;
  assert.equal(refreshCalls, 0);
  assert.equal(after, before + 1);
});

test('empty bridge channel stays empty while the fake thermal feed remains local', () => {
  const f = fixture();
  f.bridge.inventory.bindings[1] = null;
  f.bridge.available = false;
  const nodes = f.render();
  const previews = feeds(nodes);
  assert.equal(previews.length, 1);
  assert.equal(previews[0].props.device.id, 'third');
  assert.equal(previews[0].props.available, false);
  assert.equal(fakeFeeds(nodes).length, 1);
});

test('enlargement follows binding changes and ignores obsolete authorization flags', () => {
  const f = fixture();
  f.render().find(n => n.props?.['aria-label'] === '放大03路监控').props.onClick();
  assert.equal(feeds(f.render()).at(-1).props.device.id, 'third');
  assert.equal(feeds(f.render()).at(-1).props.compact, false);
  f.bridge.inventory.bindings[2] = 'second';
  assert.equal(feeds(f.render()).at(-1).props.device.id, 'second');
  f.bridge.authRequired = true;
  assert.equal(feeds(f.render()).length, 2);
  assert.equal(f.render().filter(n => n.type === 'BridgeLogin').length, 0);
  assert.equal(f.render().filter(n => n.props?.className === 'ot-monitor-locked').length, 0);
  assert.ok(f.render().filter(n => /^(放大|重连)/.test(n.props?.['aria-label'] ?? '')).every(n => !n.props.disabled));
});
