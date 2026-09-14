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
    inventory: { bindings, items: [
      { id: 'third', name: 'Dahua', kind: 'dahua' },
      { id: 'dog', name: 'Robot', kind: 'go2' },
      { id: 'second', name: 'Hikvision', kind: 'hikvision' },
    ] },
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
      if (name.endsWith('ThermalMonitor')) return { ThermalMonitor: 'ThermalMonitor' };
      if (name.endsWith('training-camera-sources')) {
        const selection = { exports: {} };
        vm.runInNewContext(transformSync(
          fs.readFileSync(new URL('./training-camera-sources.ts', import.meta.url), 'utf8'),
          { loader: 'ts', format: 'cjs' },
        ).code, { module: selection, exports: selection.exports });
        return selection.exports;
      }
      if (name.endsWith('BridgePreview')) return { BridgePreview: 'BridgePreview', BridgeLogin: 'BridgeLogin' };
      return {};
    },
  });
  const render = (subject = '单警装备快速取用') => {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      walk(node.props?.children);
    }
    walk(module.exports.TrainingCameraPreview({ taskId: 'task', subject, officer: 'Officer', teamName: 'Team' }));
    return nodes;
  };
  return { bridge, render };
}
const feeds = nodes => nodes.filter(node => node.type === 'BridgePreview');
const fakeFeeds = nodes => nodes.filter(node => node.type === 'FakeThermalMonitor');
const thermalFeeds = nodes => nodes.filter(node => node.type === 'ThermalMonitor');

test('normal training uses Dahua 02 and Hikvision 03', () => {
  const f = fixture();
  const nodes = f.render();
  assert.equal(fakeFeeds(nodes).length, 0);
  assert.deepEqual(feeds(nodes).map(n => n.props.device?.id), ['third', 'second']);
  assert.deepEqual(thermalFeeds(nodes).map(n => n.props.device?.id), []);
  assert.deepEqual(nodes.filter(n => n.props?.className === 'ot-monitor').map(n => n.props['aria-label']), ['02路监控', '03路监控']);
  assert.equal(f.render().filter(n => n.type === 'video').length, 0);
});

test('refreshing 03 reconnects the real Hikvision bridge', () => {
  const f = fixture();
  let refreshCalls = 0;
  f.bridge.refresh = () => { refreshCalls += 1; };
  const retry = f.render().find(node => node.props?.['aria-label'] === '重连03路监控');
  assert.ok(retry, '03 must have a reconnect control');
  retry.props.onClick();
  assert.equal(refreshCalls, 1);
});

test('unbound Hikvision 03 remains unavailable without fabricated pixels', () => {
  const f = fixture();
  f.bridge.inventory.bindings[1] = null;
  f.bridge.available = false;
  const nodes = f.render();
  const previews = feeds(nodes);
  assert.equal(previews.length, 2);
  assert.equal(previews[0].props.device.id, 'third');
  assert.equal(previews[0].props.available, false);
  assert.equal(previews[1].props.device, undefined);
  assert.equal(previews[1].props.available, false);
  assert.equal(fakeFeeds(nodes).length, 0);
});

test('enlargement follows binding changes without duplicating the active source', () => {
  const f = fixture();
  f.render().find(n => n.props?.['aria-label'] === '放大03路监控').props.onClick();
  assert.equal(feeds(f.render()).at(-1).props.device.id, 'second');
  assert.equal(feeds(f.render()).at(-1).props.compact, false);
  f.bridge.inventory.bindings[1] = 'third';
  assert.equal(feeds(f.render()).at(-1).props.device.id, 'third');
  f.bridge.authRequired = true;
  assert.equal(feeds(f.render()).length, 2);
  assert.equal(f.render().filter(n => n.type === 'BridgeLogin').length, 0);
  assert.equal(f.render().filter(n => n.props?.className === 'ot-monitor-locked').length, 1);
  assert.ok(f.render().filter(n => /^(放大|重连)/.test(n.props?.['aria-label'] ?? '')).every(n => !n.props.disabled));
});

test('subject matrix uses 02/03 normally and 01/02 for bomb disposal', () => {
  const f = fixture();
  const before = JSON.stringify(f.bridge.inventory.bindings);
  assert.deepEqual(feeds(f.render('单警装备快速取用')).map(n => n.props.device?.id), ['third', 'second']);
  assert.deepEqual(feeds(f.render('弱光执法场景战术协同')).map(n => n.props.device?.id), ['third', 'second']);
  assert.deepEqual(feeds(f.render('防爆先期处置')).map(n => n.props.device?.id), ['third']);
  assert.deepEqual(thermalFeeds(f.render('防爆先期处置')).map(n => n.props.device?.id), ['dog']);
  assert.deepEqual(nodesByMonitor(f.render('防爆先期处置')).map(n => n.props['aria-label']), ['01路监控', '02路监控']);
  assert.equal(JSON.stringify(f.bridge.inventory.bindings), before);
});

test('training sources keep the established global binding slots per camera identity', () => {
  const f = fixture();
  const normal = nodesByMonitor(f.render('单警装备快速取用'));
  const bomb = nodesByMonitor(f.render('防爆先期处置'));
  assert.deepEqual(normal.map(n => [n.props['aria-label'], n.props['data-bridge-slot']]), [['02路监控', 3], ['03路监控', 2]]);
  assert.deepEqual(bomb.map(n => [n.props['aria-label'], n.props['data-bridge-slot']]), [['01路监控', 1], ['02路监控', 3]]);
});

test('an unbound robot remains missing instead of being sourced outside global bindings', () => {
  const f = fixture();
  f.bridge.inventory.bindings[0] = null;
  assert.equal(thermalFeeds(f.render('防爆先期处置'))[0].props.device, undefined);
});

test('missing or ambiguous robot sources never silently show Dahua instead', () => {
  const f = fixture();
  f.bridge.inventory.bindings[0] = null;
  f.bridge.inventory.items = f.bridge.inventory.items.filter(n => n.kind !== 'go2');
  assert.equal(thermalFeeds(f.render('防爆先期处置'))[0].props.device, undefined);
  f.bridge.inventory.items.push({ id: 'r1', kind: 'go2', name: 'Robot 1' }, { id: 'r2', kind: 'go2', name: 'Robot 2' });
  assert.equal(thermalFeeds(f.render('防爆先期处置'))[0].props.device, undefined);
});

test('thermal enlargement owns one feed and keeps mode controls synchronized', () => {
  const f = fixture();
  const expand = f.render('防爆先期处置').find(n => n.props?.['aria-label'] === '放大01路监控');
  assert.ok(expand, '01 must have an enlargement control');
  expand.props.onClick();
  assert.equal(thermalFeeds(f.render('防爆先期处置')).length, 1);
  assert.equal(thermalFeeds(f.render('防爆先期处置'))[0].props.compact, false);
  thermalFeeds(f.render('防爆先期处置'))[0].props.onModeChange('original');
  assert.equal(thermalFeeds(f.render('防爆先期处置'))[0].props.mode, 'original');
  f.render('防爆先期处置').find(n => n.props?.['aria-label'] === '关闭画面').props.onClick();
  assert.equal(thermalFeeds(f.render('防爆先期处置'))[0].props.compact, true);
  assert.equal(thermalFeeds(f.render('防爆先期处置'))[0].props.mode, 'original');
});

function nodesByMonitor(nodes) {
  return nodes.filter(node => node.props?.className === 'ot-monitor');
}

test('training page passes the canonical current subject rather than guessing from task ids', () => {
  const source = fs.readFileSync(new URL('../pages/OfficerTrainingPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /<TrainingCameraPreview[^>]*subject=\{currentSubject\??\.subject\}/);
});
