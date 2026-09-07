import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

const project = fileURLToPath(new URL('../', import.meta.url));
const localDomRuntime = path.join(project, '.verify/dom-runtime/node_modules/jsdom/lib/api.js');
const domModule = process.env.DASHBOARD_TEST_JSDOM ||
  (fs.existsSync(localDomRuntime) ? pathToFileURL(localDomRuntime).href : 'jsdom');
const { JSDOM } = await import(domModule);
const requireDashboard = createRequire(path.join(project, 'apps/dashboard/package.json'));
const output = path.join(project, 'apps/dashboard/.verify', 'dashboard-redesign-test.cjs');
await build({
  stdin: {
    contents: `import React from 'react';
      import { App, ConfigProvider } from 'antd';
      import zhCN from 'antd/locale/zh_CN';
      import { dashboardTheme } from './theme';
      import { DashboardApp as Workspace } from './pages/DashboardApp';
      export function DashboardApp() {
        return <ConfigProvider theme={dashboardTheme} locale={zhCN}><App><Workspace /></App></ConfigProvider>;
      }`,
    resolveDir: path.join(project, 'apps/dashboard/src'),
    loader: 'tsx',
  },
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  mainFields: ['module', 'main'],
  plugins: [{
    name: 'dashboard-react-runtime',
    setup(builder) {
      builder.onResolve({ filter: /^react(?:-dom)?(?:\/|$)/ }, (args) => ({ path: requireDashboard.resolve(args.path), external: true }));
    },
  }],
  jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.VITE_API_BASE_URL': 'undefined', 'import.meta.env.VITE_AMAP_KEY': 'undefined', 'import.meta.env': '{}' },
  logLevel: 'silent',
});

const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://test.invalid/platform', pretendToBeVisual: true });
const { window } = dom;
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLVideoElement', 'SVGElement', 'Element', 'Node', 'ShadowRoot', 'MutationObserver']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.getComputedStyle = (element) => window.getComputedStyle(element);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
const mediaQueries = new Map();
window.matchMedia = (query) => {
  if (!mediaQueries.has(query)) {
    const listeners = new Set();
    mediaQueries.set(query, {
      matches: false, media: query,
      addListener(callback) { listeners.add(callback); },
      removeListener(callback) { listeners.delete(callback); },
      addEventListener(_event, callback) { listeners.add(callback); },
      removeEventListener(_event, callback) { listeners.delete(callback); },
      setMatches(value) { this.matches = value; for (const callback of listeners) callback(this); },
    });
  }
  return mediaQueries.get(query);
};
window.scrollTo = () => {};
window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
window.cancelAnimationFrame = clearTimeout;
globalThis.fetch = async () => { throw new Error('Unit test: business services intentionally offline'); };

const React = requireDashboard('react');
const { act } = React;
const { createRoot } = requireDashboard('react-dom/client');
const { renderToStaticMarkup } = requireDashboard('react-dom/server');
const { DashboardApp } = await import(pathToFileURL(output));
const root = createRoot(document.getElementById('root'));
const click = async (element) => {
  assert.ok(element, 'expected button exists');
  await act(async () => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
};
const namedButton = (name) => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === name || button.getAttribute('aria-label') === name);

test('all eleven routes render nonempty page content from the actual React modules', () => {
  for (const route of ['/platform', '/command', '/case', '/community', '/duty-plan', '/duty-situation', '/mobile', '/ai-center', '/admin', '/video', '/night-market/command']) {
    window.history.replaceState({}, '', route);
    const html = renderToStaticMarkup(React.createElement(DashboardApp));
    assert.ok(html.length > 1500, `${route}: unexpectedly empty`);
    assert.ok(/<button/.test(html), `${route}: missing controls`);
    assert.ok(!html.includes('NaN'), `${route}: invalid displayed metric`);
  }
});

test('overview filters, detail drawer and navigation operate without backend availability', async () => {
  window.history.replaceState({}, '', '/platform');
  await act(async () => { root.render(React.createElement(DashboardApp)); });
  assert.equal(document.querySelectorAll('.overview-event-table tbody tr').length, 4);
  await click(namedButton('待确认'));
  assert.equal(document.querySelectorAll('.overview-event-table tbody tr').length, 1);
  await click(namedButton('已完成'));
  assert.equal(document.querySelectorAll('.overview-event-table tbody tr').length, 1);
  await click(namedButton('全部警情'));
  await click(document.querySelector('.overview-event-title'));
  assert.ok(document.body.textContent.includes('警情详情'));
  assert.ok(document.querySelector('.overview-event-detail').textContent.includes('demo-001'));
  await click(namedButton('打开接处警工作台'));
  assert.equal(window.location.pathname, '/command');
  assert.ok(document.querySelector('.domain-page'));
  await act(async () => {
    window.history.pushState({}, '', '/platform');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  });
  assert.ok(document.querySelector('.overview-page'));
});

test('navigation menu exposes open state and Escape closes it', async () => {
  await click(namedButton('打开导航'));
  assert.equal(document.querySelector('.platform-control-menu-button').getAttribute('aria-expanded'), 'true');
  assert.equal(document.body.style.overflow, 'hidden');
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('.platform-control-menu-button').getAttribute('aria-expanded'), 'false');
  assert.notEqual(document.body.style.overflow, 'hidden');
  await click(namedButton('打开导航'));
  await act(async () => mediaQueries.get('(min-width: 961px)').setMatches(true));
  assert.equal(document.querySelector('.platform-control-menu-button').getAttribute('aria-expanded'), 'false');
  assert.notEqual(document.body.style.overflow, 'hidden', 'desktop resize must release the body');
});

test('live refresh updates open details and preserves a successful empty response', async () => {
  let payload = { stats: { today_events: 1 }, events: [{ id: 'live-001', title: '测试警情', status: '待人工确认', owner: '原负责人' }] };
  globalThis.fetch = async () => ({ ok: true, json: async () => payload });
  await click(namedButton('刷新平台运行态'));
  assert.equal(document.querySelectorAll('.overview-event-table tbody tr').length, 1);
  await click(document.querySelector('.overview-event-title'));
  assert.ok(document.querySelector('.overview-event-detail').textContent.includes('原负责人'));
  payload = { ...payload, events: [{ ...payload.events[0], owner: '新负责人', status: '已完成' }] };
  await click(namedButton('刷新平台运行态'));
  assert.ok(document.querySelector('.overview-event-detail').textContent.includes('新负责人'));
  payload = { stats: { today_events: 0 }, events: [] };
  await click(namedButton('刷新平台运行态'));
  assert.equal(document.querySelectorAll('.overview-event-table tbody tr').length, 0);
  assert.ok(document.body.textContent.includes('该警情已不在当前列表中'));
  assert.equal(document.querySelector('.overview-metric > strong').textContent, '0');
  assert.equal(document.querySelectorAll('.overview-metric > strong')[1].textContent, '—');
  assert.ok(!document.body.textContent.includes('纠纷警情：现场有人受伤'));
});

test('governance tabs support keyboard navigation and training remains reachable', async () => {
  globalThis.fetch = async () => { throw new Error('Unit test: offline'); };
  await act(async () => {
    window.history.pushState({}, '', '/admin');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  });
  const firstTab = document.querySelector('.governance-tabs [role="tab"]');
  assert.ok(firstTab);
  firstTab.focus();
  await act(async () => firstTab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  const activeTab = document.querySelector('.governance-tabs [aria-selected="true"]');
  assert.notEqual(activeTab.id, firstTab.id);
  assert.equal(document.activeElement, activeTab);
  assert.equal(document.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby'), activeTab.id);
  assert.ok(!document.querySelector('.platform-control-nav-item')?.parentElement?.parentElement?.textContent.includes('单警训练'));
  await click(namedButton('A1 勤务态势大屏'));
  assert.equal(window.location.pathname, '/duty-situation');
  await click(namedButton('民警单警训练'));
  assert.equal(window.location.pathname, '/duty-situation/training');
  assert.ok(document.querySelector('.officer-training-workspace'));
  assert.ok(document.querySelector('select[aria-label="训练对象"]'));
  await click(namedButton('A1 勤务态势'));
  assert.equal(window.location.pathname, '/duty-situation');
  assert.ok(document.body.textContent.includes('A1 勤务态势大屏'));
});

test('active local visual assets exist', () => {
  for (const asset of ['public-security-mark.svg', 'night-market-cam-02.png', 'night-market-shengjinta-map.png']) {
    assert.ok(fs.statSync(path.join(project, 'apps/dashboard/public', asset)).size > 100, asset);
  }
});

test.after(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
