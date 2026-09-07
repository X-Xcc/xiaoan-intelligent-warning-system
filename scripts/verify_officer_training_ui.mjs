import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const project = fileURLToPath(new URL('../', import.meta.url));
const pagePath = path.join(project, 'apps/dashboard/src/pages/OfficerTrainingPage.tsx');
test('single officer training is a dedicated workspace', () => assert.ok(fs.existsSync(pagePath)));

test('equipment gating, errors, assessment persistence and officer separation', async () => {
  assert.ok(fs.existsSync(pagePath), 'the new officer workspace must exist');
  const requireDashboard = createRequire(path.join(project, 'apps/dashboard/package.json'));
  const { JSDOM } = await import(pathToFileURL(path.join(project, '.verify/dom-runtime/node_modules/jsdom/lib/api.js')));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://test.invalid/duty-plan', pretendToBeVisual: true });
  const { window } = dom;
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLVideoElement', 'Element', 'SVGElement', 'Node', 'ShadowRoot', 'MutationObserver']) {
    Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true });
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  globalThis.getComputedStyle = (element) => window.getComputedStyle(element);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  const output = path.join(project, 'apps/dashboard/.verify/officer-training-test.cjs');
  await build({
    entryPoints: [pagePath], outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    mainFields: ['module', 'main'], logLevel: 'silent',
    plugins: [{ name: 'runtime', setup(b) { b.onResolve({ filter: /^react(?:-dom)?(?:\/|$)/ }, (args) => ({ path: requireDashboard.resolve(args.path), external: true })); } }],
    define: { 'import.meta.env.VITE_API_BASE_URL': '"http://test.invalid/api"', 'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': '"/"' },
  });
  const React = requireDashboard('react');
  const { act } = React;
  const { createRoot } = requireDashboard('react-dom/client');
  const { OfficerTrainingPage } = await import(pathToFileURL(output));
  const root = createRoot(document.getElementById('root'));
  let task = { taskId: 'TRAIN-READINESS-001', subject: '单警装备快速取用', traineeId: 'OFFICER-017', teamName: '巡逻组 A', equipment: ['对讲机', '执法记录仪'], standard: { label: '30 秒内取用完毕', thresholdSeconds: 30 }, basis: ['测试任务依据'], status: '待训练' };
  const other = { ...task, taskId: 'TRAIN-READINESS-002', traineeId: 'OFFICER-018', subject: '弱光队形转换' };
  let assessment;
  let rejectStart = true;
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, method: init.method ?? 'GET' });
    let payload;
    if (pathname.endsWith('/start')) {
      if (rejectStart) return { ok: false, status: 409, json: async () => ({ detail: '开始训练被拒绝' }) };
      task = { ...task, status: '训练中', startedAt: new Date().toISOString() };
      payload = { task };
    } else if (pathname.endsWith('/complete')) {
      task = { ...task, status: '待复核', elapsedSeconds: JSON.parse(init.body).elapsedSeconds };
      payload = { task };
    } else if (pathname.endsWith('/assessment') && init.method === 'POST') {
      assessment = { assessmentId: 'ASSESS-001', taskId: task.taskId, inputMode: 'pre_recorded_desensitized_sample', score: { standardization: 92, completionTime: 100, coordination: 88, total: 94 }, confidence: 0.86, evidence: ['elapsedSeconds:1'], evidenceTime: new Date().toISOString(), reviewStatus: 'pending', ruleVersion: 'TEST', auditId: 'AUDIT-001' };
      payload = { assessment };
    } else if (pathname.endsWith('/tasks')) payload = { dataMode: 'desensitized_sample', items: [task, other] };
    else if (pathname.endsWith('/assessments')) payload = { items: assessment ? [assessment] : [] };
    else if (pathname.endsWith('/archives')) payload = { items: [] };
    else throw new Error(`Unexpected request: ${pathname}`);
    return { ok: true, json: async () => payload };
  };
  const button = (name) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === name || el.getAttribute('aria-label') === name);
  const click = async (el) => { assert.ok(el); await act(async () => el.click()); };
  try {
    await act(async () => root.render(React.createElement(OfficerTrainingPage, { onBack() {}, onSituation() {} })));
    assert.equal(document.querySelector('h1').textContent, '单警训练');
    assert.match(document.querySelector('nav[aria-label="训练层级"]')?.textContent ?? '', /A1 勤务态势.*单警训练.*单警装备快速取用/);
    assert.ok(button('返回勤务态势'));
    assert.equal(document.querySelectorAll('.ot-task-item').length, 1);
    assert.equal(button('开始训练').disabled, true);
    const filter = document.querySelector('select[aria-label="筛选任务状态"]');
    await act(async () => { filter.value = '已归档'; filter.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.equal(document.querySelectorAll('.ot-task-item').length, 0);
    assert.ok(!button('开始训练'), 'an excluded task must not remain actionable');
    await act(async () => { filter.value = 'all'; filter.dispatchEvent(new window.Event('change', { bubbles: true })); });
    for (const checkbox of document.querySelectorAll('.ot-preparation input[type="checkbox"]')) await click(checkbox);
    assert.equal(button('开始训练').disabled, false);
    await act(async () => root.render(React.createElement(OfficerTrainingPage, { key: 'reload', onBack() {}, onSituation() {} })));
    assert.equal(button('开始训练').disabled, false, 'task-scoped preparation draft survives remount');
    await click(button('开始训练'));
    assert.ok(document.body.textContent.includes('开始训练被拒绝'));
    assert.ok(button('开始训练'));
    rejectStart = false;
    const setFilter = async (value) => act(async () => {
      const element = document.querySelector('select[aria-label="筛选任务状态"]');
      element.value = value;
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await setFilter('待训练');
    await click(button('开始训练'));
    assert.ok(button('结束并提交考核'));
    assert.equal(document.querySelector('select[aria-label="筛选任务状态"]').value, 'all', 'a status transition keeps the active task visible');
    await setFilter('训练中');
    await click(button('结束并提交考核'));
    assert.ok(document.body.textContent.includes('AUDIT-001'));
    assert.equal(document.querySelector('select[aria-label="筛选任务状态"]').value, 'all', 'completion keeps the assessment reachable');
    assert.ok(document.body.textContent.includes('脱敏样例'));
    assert.ok(!document.body.textContent.includes('实时动作识别在线'));
    const postsBefore = calls.filter((call) => call.method === 'POST').length;
    await click(button('刷新训练数据'));
    assert.ok(document.body.textContent.includes('AUDIT-001'));
    assert.equal(calls.filter((call) => call.method === 'POST').length, postsBefore, 'refresh must not create an assessment');
    const officer = document.querySelector('select[aria-label="训练对象"]');
    await act(async () => { officer.value = 'OFFICER-018'; officer.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.ok(document.querySelector('.ot-task-title').textContent.includes('弱光队形转换'));
    assert.ok(!document.body.textContent.includes('AUDIT-001'));
    assert.equal(button('开始训练').disabled, true, 'equipment confirmation cannot leak across officers');
    window.history.replaceState({}, '', '/duty-plan');
    await act(async () => root.render(React.createElement(OfficerTrainingPage, { key: 'generic-entry', onSituation() {} })));
    assert.equal(document.querySelector('select[aria-label="训练对象"]').value, 'OFFICER-018', 'direct general entry restores the last officer');
    window.history.replaceState({}, '', '/duty-situation/training?task=REMOVED-TASK');
    await act(async () => root.render(React.createElement(OfficerTrainingPage, { key: 'missing-task', onSituation() {} })));
    assert.ok(!document.querySelector('.ot-task-title'), 'a missing linked task must never be silently replaced');
    assert.ok(document.body.textContent.includes('训练任务不可用'));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    window.close();
  }
});
