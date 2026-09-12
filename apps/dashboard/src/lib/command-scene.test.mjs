import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const dog = { id: 'go2-real', name: 'Go2', kind: 'go2', status: 'online' };
const camera = { id: 'hik-real', name: 'Hikvision', kind: 'hikvision', status: 'online' };

function scene(overrides = {}, event = { id: 'real-event' }) {
  const bindings = Array(16).fill(null);
  bindings[0] = dog.id;
  bindings[1] = camera.id;
  let refreshes = 0;
  const bridge = {
    inventory: { items: [camera, dog], bindings },
    available: true, busy: false, refreshing: false, previewReady: true, previewEpoch: 4,
    authRequired: false, auth: { enabled: true, tokenConfigured: true },
    error: '', refresh: () => refreshes++, login: async () => {}, lock: async () => {},
    ...overrides,
  };
  const states = [];
  let cursor = 0;
  let inventoryHooks = 0;
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('../components/CommandScene.tsx', import.meta.url), 'utf8');
  const compiled = transformSync(source, {
    loader: 'tsx', format: 'cjs', jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
  }).code;
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    window: { location: { origin: 'http://localhost', href: 'http://localhost/command' } },
    require: (name) => {
      if (name === 'react') return {
        useEffect() {}, useRef: () => ({ current: null }),
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
          return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
        },
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name.endsWith('device-bridges-api')) return {
        useBridgeInventory: () => { inventoryHooks++; return bridge; },
        bridgeErrorMessage: () => 'Video unavailable',
      };
      if (name.endsWith('BridgePreview')) return { BridgePreview: 'BridgePreview', BridgeLogin: 'BridgeLogin' };
      if (name.endsWith('scene-video')) return { sceneFeedUrl: () => undefined };
      return {};
    },
  });
  const render = () => {
    cursor = 0;
    inventoryHooks = 0;
    const tree = module.exports.CommandScene({ event, draft: {}, onNext() {} });
    const nodes = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      walk(node.props?.children);
    };
    walk(tree);
    return nodes;
  };
  return { render, bridge, get refreshes() { return refreshes; }, get inventoryHooks() { return inventoryHooks; } };
}

const feeds = (nodes) => nodes.filter((node) => node.type === 'BridgePreview');
const button = (nodes, label) => nodes.find((node) => node.type === 'button' && node.props['aria-label'] === label);

test('barbecue demo shows a labeled fictional identity without inventing a record', () => {
  const nodes = scene({}, { id: 'alarm-demo-005', sourceMode: 'desensitized_demo' }).render();
  const content = JSON.stringify(nodes);
  for (const text of ['模拟演示', '演示用', '陈某', '34岁', 'DEMO-ID-001', '未核验，不作推断']) {
    assert.ok(content.includes(text), `Missing ${text}`);
  }
});

test('live events never receive the barbecue demo identity', () => {
  const content = JSON.stringify(scene({}, { id: 'alarm-demo-005', sourceMode: 'live' }).render());
  assert.ok(!content.includes('DEMO-ID-001'));
  assert.ok(!content.includes('演示用'));
  assert.ok(content.includes('待核验'));
});

test('scene uses one inventory and resolves dog 01 and CCTV 02 by binding, not item order', () => {
  const fixture = scene();
  const nodes = fixture.render();
  assert.deepEqual(feeds(nodes).map((node) => node.props.device?.id), [dog.id, camera.id]);
  assert.equal(fixture.inventoryHooks, 1);
  for (const node of feeds(nodes)) {
    assert.equal(node.props.available, true);
    assert.equal(node.props.authorized, true);
    assert.equal(node.props.epoch, 4);
  }
  assert.equal(nodes.filter((node) => node.type === 'img').length, 0);
});

test('both enlarged previews use the same current slot and close cleanly', () => {
  const fixture = scene();
  for (const [label, id] of [['机械狗画面', dog.id], ['监控画面', camera.id]]) {
    button(fixture.render(), `放大${label}`).props.onClick();
    const enlarged = feeds(fixture.render()).at(-1);
    assert.equal(enlarged.props.device.id, id);
    assert.equal(enlarged.props.compact, false);
    button(fixture.render(), '关闭画面').props.onClick();
    assert.equal(feeds(fixture.render()).length, 2);
  }
});

test('rebinding updates an already enlarged feed; an empty slot never picks another device', () => {
  const fixture = scene();
  button(fixture.render(), '放大监控画面').props.onClick();
  fixture.bridge.inventory.items.push({ ...camera, id: 'replacement' });
  fixture.bridge.inventory.bindings[1] = 'replacement';
  assert.equal(feeds(fixture.render()).at(-1).props.device.id, 'replacement');
  fixture.bridge.inventory.bindings[1] = null;
  const nodes = fixture.render();
  assert.equal(feeds(nodes)[1].props.device, undefined);
  assert.equal(feeds(nodes).at(-1).props.device, undefined);
  assert.equal(nodes.filter((node) => node.type === 'img').length, 0);
});

test('legacy authorization flags do not hide feeds or offer a login', () => {
  const fixture = scene();
  button(fixture.render(), '放大监控画面').props.onClick();
  fixture.bridge.authRequired = true;
  const nodes = fixture.render();
  assert.equal(feeds(nodes).length, 3);
  const logins = nodes.filter((node) => node.type === 'BridgeLogin');
  assert.equal(logins.length, 0);
});

test('stale inventory and mutations pause previews; reconnect refreshes bridge inventory', () => {
  for (const overrides of [{ available: false }, { busy: true }]) {
    const fixture = scene(overrides);
    for (const node of feeds(fixture.render())) assert.equal(node.props.available, false);
  }
  const fixture = scene();
  button(fixture.render(), '重连监控画面').props.onClick();
  assert.equal(fixture.refreshes, 1);
});
