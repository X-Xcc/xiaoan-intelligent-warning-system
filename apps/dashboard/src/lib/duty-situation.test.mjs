import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
function load(relative, { states = {}, expose = [] } = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
    + (expose.length ? `\nexport { ${expose.join(', ')} };` : '');
  let stateIndex = 0;
  vm.runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module, exports: module.exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react') return {
        useEffect() {}, useLayoutEffect() {}, useRef: value => ({ current: value }),
        useCallback: fn => fn, useState: value => {
          const index = stateIndex++;
          return [Object.hasOwn(states, index) ? states[index] : typeof value === 'function' ? value() : value, () => {}];
        },
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
const render = snapshot => nodesOf(load('../pages/DutySituationPage.tsx', {
  states: snapshot ? { 4: snapshot, 8: 'api' } : {},
}).DutySituationPage({ onBack() {}, onTraining() {} }));
const SAMPLE_SLOTS = ['20:13:50', '20:43:50', '21:13:50', '21:43:50', '22:13:50', '22:43:50', '23:13:50', '23:43:50'];

function snapshotFor(times, dataMode = 'live') {
  const { SAMPLE } = load('../pages/DutySituationPage.tsx', { expose: ['SAMPLE'] });
  return {
    dataMode, updatedAt: '2026-09-13T03:04:05+08:00', ruleVersion: 'test',
    dutySituation: {
      ...SAMPLE, period: `${times[0]} - ${times.at(-1)}`,
      timeTrend: times.map((time, index) => ({ time, value: index + 1 })),
    },
  };
}

test('duty sample uses second-precision evening slots and retains the same peak buckets', () => {
  const nodes = render();
  const columns = nodes.filter(n => n.props?.className?.includes('duty-hour-column'));
  assert.deepEqual(columns.map(n => n.props['data-hour']), SAMPLE_SLOTS);
  assert.deepEqual(columns.map(n => n.props['data-value']), [8, 15, 33, 42, 38, 31, 16, 7]);
  assert.deepEqual(columns.filter(n => n.props['data-peak']).map(n => n.props['data-hour']), SAMPLE_SLOTS.slice(2, 6));
  assert.ok(textOf(nodes.find(n => n.props?.className === 'duty-peak-heading')).includes('21:13:50-22:43:50'));
  assert.match(textOf(nodes), /高发时段强度占比\d+%/);
  assert.match(textOf(nodes), /20:13:50 - 23:43:50/);
  assert.equal(textOf(nodes).includes('次日'), false);
  assert.ok(nodes.find(n => n.props?.className === 'duty-hour-chart').props['aria-label'].includes('20:13:50'));
});

test('duty validation accepts new sample slots and preserves legacy and irregular real snapshots', () => {
  const { validSituation } = load('../pages/DutySituationPage.tsx', { expose: ['validSituation'] });
  for (const [times, dataMode] of [
    [SAMPLE_SLOTS, 'desensitized_sample'],
    [['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00'], 'live'],
    [['09:05:07', '09:35:07', '10:05:07', '10:35:07'], 'live'],
  ]) {
    const snapshot = snapshotFor(times, dataMode);
    assert.equal(validSituation(snapshot.dutySituation), true, times.join(', '));
    assert.ok(times.every(time => snapshot.dutySituation.timeTrend.some(item => item.time === time)));
  }
});

test('duty time-series validation rejects empty, malformed, duplicate and invalid-value entries', () => {
  const { validSituation } = load('../pages/DutySituationPage.tsx', { expose: ['validSituation'] });
  for (const timeTrend of [
    [], [{ time: '24:00:00', value: 1 }], [{ time: '20:60:00', value: 1 }],
    [{ time: '20:13:60', value: 1 }], [{ time: null, value: 1 }],
    [{ time: '20:13:50', value: 1 }, { time: '20:13:50', value: 2 }],
    [{ time: '20:13:50', value: NaN }], [{ time: '20:13:50', value: -1 }],
  ]) {
    assert.equal(validSituation({ ...snapshotFor(SAMPLE_SLOTS).dutySituation, timeTrend }), false);
  }
});

test('training showcase time labels match the corresponding duty sample slots', () => {
  const source = fs.readFileSync(new URL('../pages/PoliceDomainPages.tsx', import.meta.url), 'utf8');
  for (const time of SAMPLE_SLOTS.slice(0, 6)) assert.ok(source.includes(time), time);
  assert.ok(source.includes('21:13:50–22:43:50'));
  assert.equal(source.includes("['18:00','19:00','20:00','21:00','22:00','23:00']"), false);
});

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
