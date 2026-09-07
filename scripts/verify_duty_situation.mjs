import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import postcss from 'postcss';
import React, { act } from 'react';
import Reconciler from 'react-reconciler';

const root = fileURLToPath(new URL('../', import.meta.url));
const pagePath = path.join(root, 'apps/dashboard/src/pages/DutySituationPage.tsx');
const cssPath = path.join(root, 'apps/dashboard/src/styles/duty-situation.css');
const taskIds = ['TRAIN-READINESS-001', 'TRAIN-READINESS-002', 'TRAIN-READINESS-003'];
const hours = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00'];

// An in-memory host tests real React hooks without the workspace's incomplete JSDOM install.
class HostNode {
  constructor(type, props = {}, text = '') {
    this.type = type;
    this.props = props;
    this.text = text;
    this.children = [];
    this.listeners = new Map();
  }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  get innerHTML() { return JSON.stringify({ text: this.textContent, children: this.children.map((child) => child.innerHTML) }); }
  get className() { return this.props.className; }
  get dateTime() { return this.props.dateTime; }
  get checked() { return this.props.checked; }
  get dataset() {
    return Object.fromEntries(Object.entries(this.props).filter(([key]) => key.startsWith('data-'))
      .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase()), String(value)]));
  }
  getAttribute(name) { return this.props[name] === undefined ? null : String(this.props[name]); }
  querySelectorAll(selector) {
    if (selector === '.duty-main-grid > section') {
      return this.props.className === 'duty-main-grid' ? this.children.filter((child) => child.type === 'section')
        : this.children.flatMap((child) => child.querySelectorAll(selector));
    }
    const match = selector.match(/^([a-z][a-z0-9]*)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/);
    assert.ok(match, `Unsupported test selector: ${selector}`);
    const [, tag, attribute, value] = match;
    const attributeName = attribute === 'datetime' ? 'dateTime' : attribute;
    return this.children.flatMap((child) => [
      ...(tag && child.type !== tag || attributeName && !(attributeName in child.props)
        || value !== undefined && String(child.props[attributeName]) !== value ? [] : [child]),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatchEvent(event) {
    event.target = this;
    if (event.type === 'click' && this.props.type === 'checkbox') {
      this.props.onChange?.({ target: { checked: !this.checked } });
    } else {
      this.props[{ click: 'onClick', keydown: 'onKeyDown' }[event.type]]?.(event);
    }
    for (const callback of this.listeners.get(event.type) ?? []) callback(event);
    return true;
  }
}
const append = (parent, child) => { parent.children.push(child); };
const remove = (parent, child) => { parent.children = parent.children.filter((item) => item !== child); };
const hostContext = {};
const renderer = Reconciler({
  now: Date.now, supportsMutation: true, isPrimaryRenderer: true,
  getRootHostContext: () => hostContext, getChildHostContext: () => hostContext,
  getPublicInstance: (node) => node, prepareForCommit: () => null, resetAfterCommit() {},
  createInstance: (type, props) => new HostNode(type, props),
  createTextInstance: (text) => new HostNode('#text', {}, text),
  appendInitialChild: append, appendChild: append, appendChildToContainer: append,
  removeChild: remove, removeChildFromContainer: remove,
  insertBefore: (parent, child, before) => { parent.children.splice(parent.children.indexOf(before), 0, child); },
  insertInContainerBefore: (parent, child, before) => { parent.children.splice(parent.children.indexOf(before), 0, child); },
  finalizeInitialChildren: () => false, shouldSetTextContent: () => false,
  prepareUpdate: () => true, commitUpdate: (node, _payload, _type, _old, props) => { node.props = props; },
  commitTextUpdate: (node, _old, text) => { node.text = text; },
  clearContainer: (node) => { node.children = []; }, detachDeletedInstance() {},
  scheduleTimeout: (...args) => setTimeout(...args), cancelTimeout: (id) => clearTimeout(id),
  noTimeout: -1, getCurrentEventPriority: () => 16,
});

function readiness(overrides = {}) {
  return {
    dataMode: 'desensitized-sample',
    updatedAt: '2026-09-06T12:34:56+08:00',
    ruleVersion: 'readiness-test-v2',
    notice: '脱敏训练样例，非实时警情。',
    dutySituation: {
      title: 'A1 勤务态势大屏',
      location: '绳金塔夜市',
      period: '18:00-次日01:00',
      composition: [
        { label: '滋事纠纷', value: 41, color: '#f4c66d' },
        { label: '手机扒窃', value: 28, color: '#57cfbf' },
        { label: '其他', value: 27, color: '#79cfa4' },
        { label: '可疑物品', value: 4, color: '#ff6b75' },
      ],
      timeTrend: hours.map((time, index) => ({ time, value: [8, 15, 33, 42, 38, 31, 16, 7][index] })),
      zones: [
        { id: 'A', name: 'A 入口区', level: '中风险', share: 23, x: 27, y: 78, description: '入口排队聚集。' },
        { id: 'B', name: 'B 烧烤区', level: '高风险', share: 56, x: 56, y: 61, description: 'B区烧烤摊聚集区，重点关注纠纷。' },
        { id: 'C', name: 'C 文创区', level: '低风险', share: 21, x: 45, y: 28, description: '文创区通道保持畅通。' },
      ],
      recommendations: [
        { taskId: taskIds[0], subject: '单警装备训练', basis: '滋事纠纷 41%', standard: '单警装备30秒取用完毕' },
        { taskId: taskIds[1], subject: '弱光执法战术训练', basis: '20:00-23:00高发时段', standard: '弱光队形转换不超过10秒' },
        { taskId: taskIds[2], subject: '防爆先期处置', basis: '可疑物品 4%', standard: '30米警戒圈60秒内设定' },
      ],
    },
    ...overrides,
  };
}

test('A1 standalone duty situation behavior and visual contracts', async (suite) => {
  assert.ok(fs.existsSync(pagePath), 'DutySituationPage.tsx must implement the standalone A1 screen');
  assert.ok(fs.existsSync(cssPath), 'A1 needs its independently scoped stylesheet');
  const result = await build({
    stdin: {
      contents: "export { DutySituationPage } from './apps/dashboard/src/pages/DutySituationPage'; export { XiaoanVoiceProvider } from './apps/dashboard/src/components/XiaoanVoice';",
      resolveDir: root, loader: 'tsx',
    },
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    jsx: 'automatic',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    plugins: [{
      name: 'readiness-contract-boundary',
      setup(builder) {
        builder.onResolve({ filter: /\/lib\/training-api$/ }, () => ({ path: 'readiness', namespace: 'duty-test' }));
        builder.onLoad({ filter: /.*/, namespace: 'duty-test' }, () => ({
          contents: 'export const getTrainingReadiness = (signal) => globalThis.__dutyReadiness(signal); export const getTrainingTasks = (signal) => globalThis.__dutyTasks(signal);',
          loader: 'js',
        }));
      },
    }],
  });
  const compiled = new Module(pagePath);
  compiled.filename = pagePath;
  compiled.paths = Module._nodeModulePaths(root);
  compiled._compile(result.outputFiles[0].text, pagePath);
  const { DutySituationPage, XiaoanVoiceProvider } = compiled.exports;
  assert.equal(typeof DutySituationPage, 'function');

  async function mount(t, { request = async () => { throw new Error('offline'); }, taskRequest = async () => ({ items: [] }), reducedMotion = false, viewState } = {}) {
    class HostEvent {
      constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
      preventDefault() {}
    }
    const documentHost = new HostNode('document');
    const session = new Map(viewState ? [['a1-situation-view-v1', JSON.stringify(viewState)]] : []);
    const windowHost = {
      setTimeout: (...args) => setTimeout(...args), clearTimeout: (id) => clearTimeout(id),
      MouseEvent: HostEvent, KeyboardEvent: HostEvent, Event: HostEvent,
      addEventListener() {}, removeEventListener() {},
      scrollY: 0,
      sessionStorage: { getItem: (key) => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) },
    };
    const dom = { window: windowHost };
    const previous = new Map();
    const globals = {
      window: dom.window,
      document: documentHost,
      navigator: {},
      HTMLElement: HostNode,
      SVGElement: HostNode,
      IS_REACT_ACT_ENVIRONMENT: true,
      BroadcastChannel: undefined,
      Audio: class { play() { return Promise.reject(new Error('unavailable')); } pause() {} },
      __dutyReadiness: request,
      __dutyTasks: taskRequest,
    };
    for (const [key, value] of Object.entries(globals)) {
      previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const mediaListeners = new Set();
    dom.window.matchMedia = () => ({
      matches: reducedMotion,
      addEventListener: (_type, callback) => mediaListeners.add(callback),
      removeEventListener: (_type, callback) => mediaListeners.delete(callback),
    });
    const callbacks = { back: 0, training: [] };
    const container = new HostNode('root');
    const reactRoot = renderer.createContainer(container, 0, null, false, null, '', console.error, null);
    await act(async () => {
      renderer.updateContainer(React.createElement(XiaoanVoiceProvider, {}, React.createElement(DutySituationPage, {
        onBack: () => { callbacks.back += 1; },
        onTraining: (id) => callbacks.training.push(id),
      })), reactRoot, null, null);
    });
    t.after(async () => {
      await act(async () => renderer.updateContainer(null, reactRoot, null, null));
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    });
    return {
      dom, container, callbacks, mediaListeners,
      find: (selector) => {
        const element = container.querySelector(selector);
        assert.ok(element, `Missing ${selector}`);
        return element;
      },
      click: async (selector) => {
        const element = container.querySelector(selector);
        assert.ok(element, `Missing clickable ${selector}`);
        await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
      },
    };
  }

  await suite.test('return preserves a paused generation stage and its remaining duration', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
    const ui = await mount(t, {
      request: async () => readiness(),
      viewState: { selectedId: 'A', scrollY: 0, phase: 'lead', remainingMs: 300, paused: true, sound: false, panels: [] },
    });
    assert.equal(ui.find('main').dataset.phase, 'lead');
    assert.equal(ui.find('main').dataset.paused, 'true');
    await ui.click('[aria-label="民警单警训练"]');
    const saved = JSON.parse(ui.dom.window.sessionStorage.getItem('a1-situation-view-v1'));
    assert.equal(saved.phase, 'lead');
    assert.equal(saved.remainingMs, 300);
    await ui.click('[aria-label="继续动画"]');
    await act(async () => t.mock.timers.tick(299));
    assert.equal(ui.find('main').dataset.phase, 'lead');
    await act(async () => t.mock.timers.tick(1));
    assert.equal(ui.find('main').dataset.phase, 'donut');
  });

  await suite.test('course status refresh reads persisted tasks separately from the situation snapshot', async (t) => {
    let status = '待训练';
    const ui = await mount(t, {
      request: async () => readiness(),
      taskRequest: async () => ({ items: [{ taskId: taskIds[0], status }] }),
    });
    assert.match(ui.find(`[data-task-id="${taskIds[0]}"]`).textContent, /待训练/);
    status = '已归档';
    await ui.click('[aria-label="刷新态势"]');
    assert.match(ui.find(`[data-task-id="${taskIds[0]}"]`).textContent, /已归档/);
  });

  await suite.test('narrow screens show all original courses as a static vertical list', () => {
    const css = postcss.parse(fs.readFileSync(cssPath, 'utf8'));
    const rules = [];
    css.walkAtRules('media', (media) => {
      if (!media.params.includes('max-width: 1100px')) return;
      media.walkRules((rule) => rules.push(rule));
    });
    const has = (selector, prop, value) => rules.some((rule) => rule.selector.includes(selector)
      && rule.nodes.some((decl) => decl.prop === prop && decl.value === value));
    assert.ok(has('.duty-ticker-group', 'flex-direction', 'column'));
    assert.ok(has('.duty-ticker-track', 'animation-name', 'none'));
    assert.ok(has('.duty-ticker-copy', 'display', 'none'));
    assert.ok(has('.duty-course', 'width', '100%'));
  });

  await suite.test('unavailable API uses explicitly identified screenshot-spec data, never live claims', async (t) => {
    const ui = await mount(t);
    assert.equal(ui.find('h1').textContent, 'A1 勤务态势大屏');
    assert.match(ui.container.textContent, /截图规格样例/);
    assert.match(ui.container.textContent, /非实时警情/);
    assert.match(ui.container.textContent, /接口不可用/);
    assert.equal(ui.find('main').dataset.source, 'sample');
    assert.equal(ui.find('main').dataset.phase, 'idle');
    assert.equal(ui.container.querySelector('time[datetime]'), null, 'sample must not fabricate a fresh timestamp');
    assert.ok(ui.find('image').getAttribute('href').endsWith('/night-market-shengjinta-map.png'));
    assert.deepEqual([...ui.container.querySelectorAll('[data-category]')].map((item) => [
      item.dataset.category, Number(item.dataset.value),
    ]), [['滋事纠纷', 41], ['手机扒窃', 28], ['其他', 27], ['可疑物品', 4]]);
    assert.match(ui.find('[data-category="可疑物品"]').className, /danger/);
    assert.match(ui.find('[data-category="可疑物品"]').textContent, /4%/);
    assert.deepEqual([...ui.container.querySelectorAll('[data-hour]')].map((bar) => bar.dataset.hour), hours);
    assert.deepEqual([...ui.container.querySelectorAll('[data-peak="true"]')].map((bar) => bar.dataset.hour), hours.slice(2, 6));
    assert.match(ui.container.textContent, /高发时段/);
    assert.match(ui.container.textContent, /30秒/);
    assert.match(ui.container.textContent, /10秒/);
    assert.match(ui.container.textContent, /30米/);
    assert.match(ui.container.textContent, /60秒/);
  });

  await suite.test('all three recommendations and the training entry call the supplied navigation callbacks', async (t) => {
    const ui = await mount(t);
    for (const id of taskIds) await ui.click(`[data-task-id="${id}"]`);
    assert.deepEqual(ui.callbacks.training, taskIds);
    await ui.click('[aria-label="民警单警训练"]');
    assert.equal(ui.callbacks.training[3], undefined);
    await ui.click('[aria-label="返回平台总览"]');
    assert.equal(ui.callbacks.back, 1);
  });

  await suite.test('server metadata and changed measurements are rendered without relabeling as live data', async (t) => {
    const data = readiness();
    data.dutySituation.composition[0].value = 40;
    data.dutySituation.composition[2].value = 28;
    data.dutySituation.timeTrend[0].value = 11;
    const ui = await mount(t, { request: async () => data });
    assert.equal(ui.find('main').dataset.source, 'api');
    assert.match(ui.container.textContent, /脱敏样例/);
    assert.doesNotMatch(ui.container.textContent, /desensitized[-_]sample/);
    assert.match(ui.container.textContent, /readiness-test-v2/);
    assert.match(ui.container.textContent, /非实时警情/);
    assert.equal(ui.find('time').dateTime, data.updatedAt);
    assert.equal(ui.find('[data-category="滋事纠纷"]').dataset.value, '40');
    assert.equal(ui.find('[data-hour="18:00"]').dataset.value, '11');
  });

  await suite.test('sample standards preserve the screenshot wording and standalone root is measurable', async (t) => {
    const ui = await mount(t);
    assert.match(ui.find('main').className, /(?:^|\s)duty-situation(?:\s|$)/);
    for (const task of readiness().dutySituation.recommendations) {
      assert.ok(ui.find(`[data-task-id="${task.taskId}"]`).textContent.includes(task.standard));
    }
    assert.doesNotMatch(ui.container.textContent, /30秒完成装备检查|10秒完成弱光识别|60秒上报/);
  });

  await suite.test('sample metadata and repeated course disclaimers are concise without losing their originals or standards', async (t) => {
    const data = readiness({
      dataMode: 'desensitized_sample',
      notice: '当前为脱敏样例态势与确定性规则演示，不代表生产警情或模型实时判断；占比、时段、区域及训练阈值均为样例，不构成训练或执法规范。',
    });
    data.dutySituation.recommendations = data.dutySituation.recommendations.map((task) => ({
      ...task, basis: `脱敏样例演示：${task.basis}；演示阈值，非生产训练或执法规范。`,
    }));
    const ui = await mount(t, { request: async () => data });
    const metadata = ui.find('[aria-label="数据来源与时间"]');
    assert.match(metadata.textContent, /脱敏样例/);
    assert.doesNotMatch(metadata.textContent, /desensitized_sample/);
    const notice = ui.find(`[title="${data.notice}"]`);
    assert.ok(notice.textContent.length <= 40);
    assert.match(notice.textContent, /非实时警情/);
    assert.match(notice.textContent, /仅供演示/);
    for (const task of data.dutySituation.recommendations) {
      const button = ui.find(`[data-task-id="${task.taskId}"]`);
      assert.ok(button.textContent.includes(task.standard), 'each standard must remain fully visible');
      assert.doesNotMatch(button.textContent, /脱敏样例演示|非生产训练或执法规范/);
      assert.ok(button.querySelector(`[title="${task.basis}"]`), 'full recommendation basis must remain inspectable');
    }
  });

  await suite.test('English service risk levels are localized in summaries and accessible map labels', async (t) => {
    const data = readiness();
    data.dutySituation.zones.forEach((zone, index) => { zone.level = ['medium', 'high', 'low'][index]; });
    const ui = await mount(t, { request: async () => data });
    for (const [id, expected] of [['B', '高风险'], ['A', '中风险'], ['C', '低风险']]) {
      await ui.click(`[data-zone-id="${id}"]`);
      const button = ui.find(`[data-zone-id="${id}"]`);
      assert.ok(button.getAttribute('aria-label').includes(expected));
      assert.ok(button.getAttribute('title').includes(expected));
      assert.ok(ui.find('[aria-label="选区摘要"]').textContent.includes(expected));
    }
    assert.doesNotMatch(ui.find('[aria-label="选区摘要"]').textContent, /\b(high|medium|low)\b/);
  });

  await suite.test('clustered service zones retain named callouts at distinct positions', async (t) => {
    const data = readiness();
    data.dutySituation.zones = [
      { id: 'A', name: '夜市入口', level: 'medium', share: 24, x: 40, y: 88, description: '入口人流' },
      { id: 'B', name: '烧烤摊聚集区', level: 'high', share: 46, x: 51, y: 78, description: '重点区域' },
      { id: 'C', name: '后巷摊位区', level: 'medium', share: 20, x: 54, y: 84, description: '弱光区域' },
      { id: 'D', name: '亲子餐饮区', level: 'low', share: 10, x: 47, y: 69, description: '餐饮区域' },
    ];
    const ui = await mount(t, { request: async () => data });
    assert.match(ui.find('[data-zone-id="B"]').textContent, /B.*烧烤/);
    const positions = ui.container.querySelectorAll('[data-zone-id]').map((zone) => zone.props.style.top);
    assert.ok(new Set(positions).size >= 2);
    assert.equal(ui.container.querySelectorAll('[data-zone-leader]').length, 4);
  });

  await suite.test('missing or malformed API situation cannot inherit the server data-mode label', async (t) => {
    let response = readiness({ dataMode: 'production', dutySituation: undefined });
    const ui = await mount(t, { request: async () => response });
    assert.equal(ui.find('main').dataset.source, 'sample');
    assert.match(ui.container.textContent, /截图规格样例/);
    assert.doesNotMatch(ui.container.textContent, /production/);
    response = readiness();
    response.dutySituation.timeTrend[0].value = Number.NaN;
    await ui.click('[aria-label="刷新态势"]');
    assert.equal(ui.find('main').dataset.source, 'sample');
    assert.doesNotMatch(ui.container.innerHTML, /NaN/);
  });

  await suite.test('failed refresh preserves the last snapshot and labels it stale; recovery clears the warning', async (t) => {
    let failing = false;
    const ui = await mount(t, { request: async () => {
      if (failing) throw new Error('offline');
      return readiness();
    } });
    failing = true;
    await ui.click('[aria-label="刷新态势"]');
    assert.equal(ui.find('main').dataset.source, 'stale');
    assert.match(ui.container.textContent, /刷新失败/);
    assert.match(ui.container.textContent, /上次快照/);
    assert.equal(ui.find('time').dateTime, readiness().updatedAt);
    failing = false;
    await ui.click('[aria-label="刷新态势"]');
    assert.equal(ui.find('main').dataset.source, 'api');
    assert.doesNotMatch(ui.container.textContent, /刷新失败/);
  });

  await suite.test('zones select by click and keyboard and update the same side summary', async (t) => {
    const ui = await mount(t, { request: async () => readiness() });
    assert.match(ui.find('[aria-label="选区摘要"]').textContent, /B 烧烤区/);
    await ui.click('[data-zone-id="A"]');
    assert.match(ui.find('[aria-label="选区摘要"]').textContent, /A 入口区/);
    const zone = ui.find('[data-zone-id="C"]');
    await act(async () => zone.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.match(ui.find('[aria-label="选区摘要"]').textContent, /C 文创区/);
    assert.equal(zone.getAttribute('aria-pressed'), 'true');
  });

  await suite.test('map controls and donut labels remain HTML text instead of shrinking with SVG viewports', async (t) => {
    const ui = await mount(t);
    assert.equal(ui.container.querySelectorAll('text').length, 0, 'SVG labels become unreadable when the map or donut shrinks');
    for (const zone of ui.container.querySelectorAll('[data-zone-id]')) {
      assert.equal(zone.type, 'button', 'map zones need native keyboard-accessible controls');
    }
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.match(css, /\.duty-map-frame/);
    assert.match(css, /\.duty-donut-center/);
  });

  await suite.test('generation observes 500ms lead, 1s donut and 1s hotspot; pause retains remaining time and replay restarts', async (t) => {
    const ui = await mount(t);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const tick = async (ms) => act(async () => t.mock.timers.tick(ms));
    let spoken = 0;
    ui.dom.window.speechSynthesis = { speak: () => { spoken += 1; }, cancel() {} };
    ui.dom.window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    await ui.click('[aria-label="生成画像"]');
    assert.equal(spoken, 0, 'sound must be opt-in');
    assert.equal(ui.find('main').dataset.phase, 'lead');
    await tick(200);
    await ui.click('[aria-label="暂停动画"]');
    await tick(4000);
    assert.equal(ui.find('main').dataset.phase, 'lead');
    assert.equal(ui.find('main').dataset.paused, 'true');
    await ui.click('[aria-label="继续动画"]');
    await tick(299);
    assert.equal(ui.find('main').dataset.phase, 'lead');
    await tick(1);
    assert.equal(ui.find('main').dataset.phase, 'donut');
    await tick(999);
    assert.equal(ui.find('main').dataset.phase, 'donut');
    await tick(1);
    assert.equal(ui.find('main').dataset.phase, 'hotspot');
    await tick(1000);
    assert.equal(ui.find('main').dataset.phase, 'ticker');
    await ui.click('[aria-label="暂停动画"]');
    assert.equal(ui.find('main').dataset.paused, 'true');
    await tick(10000);
    assert.equal(ui.find('main').dataset.phase, 'ticker');
    await ui.click('[aria-label="继续动画"]');
    assert.equal(ui.find('main').dataset.paused, 'false');
    await ui.click('[aria-label="重播画像"]');
    assert.equal(ui.find('main').dataset.phase, 'lead');
  });

  await suite.test('opt-in speech says the requested acknowledgement and speech failure never blocks generation', async (t) => {
    const ui = await mount(t);
    const utterances = [];
    globalThis.Audio = class {
      constructor(src) { utterances.push(src); }
      play() { return Promise.reject(new Error('audio unavailable')); }
      pause() {}
    };
    await ui.click('[aria-label="语音播报"]');
    assert.equal(ui.find('[aria-label="语音播报"]').checked, true);
    await ui.click('[aria-label="生成画像"]');
    assert.deepEqual(utterances, ['/command/voice/yaoyao/portrait-ready.wav']);
    assert.equal(ui.find('main').dataset.phase, 'lead');
  });

  await suite.test('reduced-motion preference skips timed effects and honors preference changes', async (t) => {
    const ui = await mount(t, { reducedMotion: true });
    await ui.click('[aria-label="生成画像"]');
    assert.equal(ui.find('main').dataset.phase, 'ticker');
    assert.equal(ui.find('main').dataset.reducedMotion, 'true');
    await act(async () => {
      for (const callback of ui.mediaListeners) callback({ matches: false });
    });
    await ui.click('[aria-label="重播画像"]');
    assert.equal(ui.find('main').dataset.phase, 'lead');
  });

  await suite.test('fullscreen unsupported and rejected cases show an accessible fallback notice', async (t) => {
    const ui = await mount(t);
    await ui.click('[aria-label="进入全屏"]');
    assert.match(ui.container.textContent, /全屏/);
    assert.match(ui.find('[role="status"]').textContent, /不支持|不可用|无法/);
    ui.find('main').requestFullscreen = async () => { throw new Error('denied'); };
    await ui.click('[aria-label="进入全屏"]');
    assert.match(ui.find('[role="status"]').textContent, /拒绝|无法|失败/);
  });

  await suite.test('fullscreen toggles the actual fullscreen state and follows Escape changes', async (t) => {
    const ui = await mount(t);
    const main = ui.find('main');
    let active = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => active });
    main.requestFullscreen = async () => {
      active = main;
      document.dispatchEvent(new ui.dom.window.Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      active = null;
      document.dispatchEvent(new ui.dom.window.Event('fullscreenchange'));
    };
    await ui.click('[aria-label="进入全屏"]');
    assert.equal(active, main);
    await ui.click('[aria-label="退出全屏"]');
    assert.equal(active, null);
    await ui.click('[aria-label="进入全屏"]');
    await act(async () => document.exitFullscreen());
    assert.ok(ui.find('[aria-label="进入全屏"]'));
  });

  await suite.test('unmount aborts the pending readiness request', async (t) => {
    let signal;
    await mount(t, { request: (value) => {
      signal = value;
      return new Promise(() => {});
    } });
    assert.ok(signal instanceof AbortSignal);
    t.after(() => assert.equal(signal.aborted, true));
  });

  await suite.test('animation declarations cannot reset the manual, hover or focus pause state', () => {
    const sheet = postcss.parse(fs.readFileSync(cssPath, 'utf8'));
    const pauseSelectors = [];
    sheet.walkRules((rule) => {
      if (rule.selector.includes('[data-phase=')) {
        rule.walkDecls('animation', () => assert.fail(`Animation shorthand resets play state: ${rule.selector}`));
      }
      rule.walkDecls('animation-play-state', (decl) => {
        if (decl.value === 'paused') pauseSelectors.push(...rule.selectors);
      });
      if (rule.selector.includes(':focus-within')) {
        rule.walkDecls('animation', () => assert.fail('Keyboard focus must pause instead of restarting the ticker'));
      }
    });
    for (const trigger of ['[data-paused="true"]', ':hover', ':focus-within']) {
      assert.ok(pauseSelectors.some((selector) => selector.includes(trigger)), `Missing ${trigger} pause`);
    }
  });

  await suite.test('mobile root participates in document scrolling instead of clipping full-page captures', () => {
    const sheet = postcss.parse(fs.readFileSync(cssPath, 'utf8'));
    let mobile;
    sheet.walkAtRules('media', (media) => {
      if (media.params === '(max-width: 1100px)') {
        media.walkRules('.duty-situation-page', (rule) => {
          mobile = Object.fromEntries(rule.nodes.filter((node) => node.type === 'decl').map((decl) => [decl.prop, decl.value]));
        });
      }
    });
    assert.ok(mobile);
    assert.equal(mobile.position, 'relative');
    assert.equal(mobile.height, 'auto');
    assert.equal(mobile['min-height'], '100dvh');
    assert.equal(mobile.overflow, 'visible');
  });

  await suite.test('map labels use intrinsic width and the actual bitmap is never inverted or darkened', () => {
    const sheet = postcss.parse(fs.readFileSync(cssPath, 'utf8'));
    let labelWidth;
    let labelMaxWidth;
    sheet.walkRules('.duty-zone-button', (rule) => {
      rule.walkDecls('width', (decl) => { labelWidth = decl.value; });
      rule.walkDecls('max-width', (decl) => { labelMaxWidth = decl.value; });
    });
    assert.equal(labelWidth, 'max-content');
    assert.equal(labelMaxWidth, '42%');
    sheet.walkRules('.duty-map-bitmap', (rule) => {
      rule.walkDecls('filter', (decl) => {
        assert.doesNotMatch(decl.value, /invert|hue-rotate|blur/);
        const brightness = decl.value.match(/brightness\(([\d.]+)\)/);
        if (brightness) assert.ok(Number(brightness[1]) >= 1);
      });
    });
  });

  await suite.test('stylesheet keeps bounded 1:2:1 desktop, mobile stacking, readable type and scoped motion', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    const source = fs.readFileSync(pagePath, 'utf8');
    assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*2fr\)\s+minmax\(0,\s*1fr\)/);
    assert.match(css, /100dvh/);
    assert.match(css, /min-height:\s*0/);
    assert.match(css, /min-width:\s*0/);
    assert.match(css, /@media\s*\(max-width:\s*\d+px\)/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /animation-play-state:\s*paused/);
    assert.match(source, /from ['"]lucide-react['"]/);
    assert.doesNotMatch(source, /import\s+['"].*\.css['"]/);
    assert.doesNotMatch(source, /setInterval|Math\.random/);
    const sheet = postcss.parse(css);
    sheet.walkDecls((decl) => {
      if (decl.prop === 'font-size') {
        assert.doesNotMatch(decl.value, /\b(?:vw|vh|cqw|cqh)\b/);
        if (/^[\d.]+px$/.test(decl.value)) assert.ok(parseFloat(decl.value) >= 12, `Small type: ${decl.value}`);
      }
      if (decl.prop === 'letter-spacing') assert.match(decl.value, /^(0|0px|normal)$/);
      assert.equal(decl.important, undefined, `${decl.prop} must not override shared CSS with !important`);
    });
  });
});
