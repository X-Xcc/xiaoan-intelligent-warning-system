import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
function load(relative) {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module, exports: module.exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react') return {
        useEffect() {}, useLayoutEffect() {}, useRef: value => ({ current: value }),
        useCallback: fn => fn, useState: value => [typeof value === 'function' ? value() : value, () => {}],
      };
      if (name.endsWith('XiaoanVoice')) return { useXiaoanVoice: () => ({}) };
      if (name.endsWith('training-navigation')) return {
        readSituationView: () => ({ phase: 'idle', paused: false, remainingMs: 0, panels: [] }),
      };
      if (name.endsWith('DutyCompositionChart')) return load('../components/DutyCompositionChart.tsx');
      return {};
    },
  });
  return module.exports;
}

function nodesOf(tree) {
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return nodes;
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!node || typeof node !== 'object') return String(node ?? '');
  return textOf(node.props?.children);
}
const render = () => nodesOf(load('../pages/DutySituationPage.tsx').DutySituationPage({ onBack() {}, onTraining() {} }));

test('duty page removes recommendations, composition list and both training notes', () => {
  const nodes = render();
  for (const removed of ['duty-training-ticker', 'duty-composition-list', 'duty-risk-note', 'duty-trend-note']) {
    assert.equal(nodes.some(n => n.props?.className === removed), false, `${removed} must be removed`);
  }
  assert.equal(nodes.filter(n => n.props?.className?.includes('duty-hour-column')).length, 8);
  assert.ok(nodes.some(n => n.props?.className === 'duty-trend-summary'));
});

test('large filled pie contains every category name and percentage inside the chart', () => {
  const chart = render().find(n => n.type === 'svg' && n.props.className === 'duty-composition-chart');
  assert.ok(chart, 'filled pie replaces the small ring');
  const slices = nodesOf(chart).filter(n => n.props?.['data-category']);
  assert.equal(slices.length, 4);
  for (const [index, [label, value]] of [['滋事纠纷', 41], ['手机扒窃', 28], ['其他', 27], ['可疑物品', 4]].entries()) {
    assert.equal(slices[index].props['data-category'], label);
    assert.equal(slices[index].props['data-value'], value);
    assert.ok(textOf(slices[index]).includes(`${value}%`));
    assert.ok(textOf(slices[index]).includes(label));
    assert.ok(nodesOf(slices[index]).some(n => n.type === 'path' && n.props.d.startsWith('M 200 200')));
  }
});

test('pie handles a full-circle category and omits zero-area slices', () => {
  const { DutyCompositionChart } = load('../components/DutyCompositionChart.tsx');
  const chart = DutyCompositionChart({ run: 0, items: [
    { label: 'Only category', value: 100, color: '#edbf69' },
    { label: 'Empty category', value: 0, color: '#ff727c' },
  ] });
  const nodes = nodesOf(chart);
  assert.equal(nodes.filter(n => n.props?.['data-category']).length, 1);
  assert.equal(nodes.filter(n => n.type === 'circle').length, 1);
  assert.ok(textOf(chart).includes('100%'));
  assert.equal(JSON.stringify(chart).includes('NaN'), false);
});

test('smallest category stays at the right without changing its percentage', () => {
  const { DutyCompositionChart } = load('../components/DutyCompositionChart.tsx');
  const chart = DutyCompositionChart({ run: 0, items: [
    { label: 'Small', value: 4, color: '#ff727c' },
    { label: 'Large', value: 96, color: '#edbf69' },
  ] });
  const small = nodesOf(chart).find(n => n.props?.['data-category'] === 'Small');
  const label = nodesOf(small).find(n => n.type === 'text');
  assert.equal(small.props['data-value'], 4);
  assert.equal(label.props.x, 355);
  assert.equal(label.props.y, 200);
});

test('time range and peak share form one compact metrics row above the hourly plot', () => {
  const nodes = render();
  const metrics = nodes.find(n => n.props?.className === 'duty-trend-metrics');
  assert.ok(metrics);
  assert.ok(nodesOf(metrics).some(n => n.props?.className === 'duty-peak-heading'));
  assert.ok(nodesOf(metrics).some(n => n.props?.className === 'duty-trend-summary'));
  assert.ok(nodes.indexOf(metrics) < nodes.findIndex(n => n.props?.className === 'duty-hour-chart'));
});

test('composition uses the restrained category palette without changing the data', () => {
  const chart = render().find(n => n.props?.className === 'duty-composition-chart');
  const primary = nodesOf(chart).find(n => n.props?.['data-category'] === '滋事纠纷');
  assert.equal(nodesOf(primary).find(n => n.type === 'path').props.fill, '#2f817a');
  assert.equal(primary.props['data-value'], 41);
});
