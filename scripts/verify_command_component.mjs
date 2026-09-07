import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(new URL('../tmp/command-test-runtime/package.json', import.meta.url))('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/command?mode=rehearsal&eventId=A' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'SVGElement', 'ShadowRoot', 'Node',
  'MutationObserver', 'sessionStorage', 'localStorage', 'Event', 'MouseEvent']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.getComputedStyle = (element) => dom.window.getComputedStyle(element);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
const React = require('react');
const { createRoot } = require('react-dom/client');
const result = buildSync({
  entryPoints: [fileURLToPath(new URL('../apps/dashboard/src/pages/CommandOperationsPage.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom', 'antd', 'lucide-react'], loader: { '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false',
    'import.meta.env.VITE_API_BASE_URL': '"http://local.test/api"' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);

function snapshot(id) {
  const command = { version: 1, stage: 'B1_INTAKE', sourceMode: 'live', updatedAt: '2026-09-06T17:00:00Z',
    intake: { transcript: `${id}原文`, locationText: `${id}地点`, transcriptSource: 'manual', locationSource: 'manual', locationVersion: 1, coordinates: null },
    summary: { version: 1, text: `${id}摘要`, category: '消费纠纷', dangerFactors: ['不详'], riskTags: [], reviewStatus: 'pending',
      basis: ['人工记录'], dataTime: '2026-09-06T17:00:00Z', generationMethod: 'rules' },
    relatedAlerts: [], evidenceIndex: [] };
  return { command, event: { id, title: `${id}事件`, bay: `${id}地点`, status: '已提交', owner: '待派单', description: `${id}原文`,
    meta: { command }, timeline: [] } };
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
  }
  assert.ok(check(), 'component did not reach expected state');
}
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent === text);

test('real page discards late A response, submits B only and retains failed summary draft', async () => {
  sessionStorage.setItem('command-token', 'test-token');
  let releaseA;
  const lateA = new Promise((resolve) => { releaseA = resolve; });
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/config')) return response({ demoEnabled: false });
    if (path.endsWith('/me')) return response({ openid: 'intake', roles: ['intake'] });
    if (path.endsWith('/staff')) return response({ items: [] });
    if (path.endsWith('/command/events')) return response({ items: [snapshot('A').event, snapshot('B').event] });
    if (path.endsWith('/A/context')) return lateA;
    if (path.endsWith('/B/context')) return response(snapshot('B'));
    if (options.method === 'POST') {
      writes.push({ path, body: JSON.parse(options.body) });
      return response({ detail: { message: '版本冲突测试' } }, 409);
    }
    return response({ detail: 'missing' }, 404);
  };
  const mounted = createRoot(document.getElementById('root'));
  await React.act(async () => mounted.render(React.createElement(module.exports.CommandOperationsPage)));
  await until(() => [...document.querySelectorAll('.command-queue > button')].some((item) => item.textContent.includes('B事件')));
  await React.act(async () => [...document.querySelectorAll('.command-queue > button')].find((item) => item.textContent.includes('B事件')).click());
  await until(() => document.querySelector('.command-actions'));
  await React.act(async () => releaseA(response(snapshot('A'))));
  assert.match(document.querySelector('.command-event-strip').textContent, /B地点/);
  assert.doesNotMatch(document.querySelector('.command-event-strip').textContent, /A地点/);
  const summary = [...document.querySelectorAll('label')].find((label) => label.textContent.startsWith('警情摘要')).querySelector('textarea');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(summary, 'B人工修订摘要');
    summary.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await React.act(async () => button('确认警情摘要').click());
  await until(() => document.querySelector('.command-status').textContent.includes('版本冲突测试'));
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /\/B\/summary\/confirm$/);
  assert.equal(writes[0].body.text, 'B人工修订摘要');
  assert.equal(summary.value, 'B人工修订摘要');
  assert.equal(writes[0].body.expectedVersion, 1);
  assert.match(document.querySelector('.command-event-strip').textContent, /已提交/);
  await React.act(async () => mounted.unmount());
  dom.window.close();
});
