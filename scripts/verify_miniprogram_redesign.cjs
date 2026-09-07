const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const base = process.env.MINIPROGRAM_PREVIEW_URL || 'http://127.0.0.1:54232';
const output = path.resolve(__dirname, '../.superpowers/brainstorm/miniprogram-ui-20260906/verification/actual');
const staff = '王队';
const market = { id: 'fixture-market', name: '盛金塔夜市', district: '测试商圈', address: '夜市入口 · 便民服务站', latitude: 28.66, longitude: 115.9 };
const event = (id, kind, data = {}) => ({
  id, kind, title: kind === 'help' ? '一键求助' : kind === 'lost' ? '失物线索' : '消防通道占用',
  bay: '夜市入口 · 便民服务站', level: '高风险', source: '小程序测试', status: '已提交',
  owner: '待分配', distance: '', time: '18:00', description: '测试现场情况',
  updatedAt: '2026-09-06T18:00:00+08:00', meta: { locationSource: 'manual' }, ...data,
});
const trainingTask = () => ({
  taskId: 'fixture-training', subject: '现场协同处置', traineeId: staff, teamName: '夜市巡防组',
  equipment: ['防护装备'], standard: { label: '完成规定现场动作', thresholdSeconds: 60 },
  basis: ['试点训练记录'], status: '待训练',
});

async function setup(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const state = { calls: [], errors: [], events: new Map(), training: trainingTask(), failHelp: false, unexpected: [], failedAssets: [] };
  state.events.set('fixture-task', event('fixture-task', 'help', { status: '已派单', owner: staff }));
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) {
      state.unexpected.push(request.url());
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const data = request.postDataJSON();
    state.calls.push({ path: url.pathname, method: request.method(), data });
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/events/night-markets') return reply({ items: [market] });
    if (url.pathname === '/api/events/staff') return reply({ items: [{ id: 'wang', name: staff, role: '巡防' }] });
    if (url.pathname === '/api/events/staff-tasks') {
      assert.equal(url.searchParams.get('staff'), staff, 'Tasks use the bound worker identity.');
      return reply({ items: [state.events.get('fixture-task')] });
    }
    if (url.pathname === '/api/security-ops/overview') return reply({ duty: { total: 1, items: [{ planKey: 'fixture-duty', planDate: '2026-09-06', area: market.name, summary: '夜间巡防', timeSlot: '18:00-22:00', staff: [staff] }] } });
    if (url.pathname === '/api/training/readiness') return reply({ dataMode: '试点', notice: '测试训练数据', scoringRules: [], blockers: [] });
    if (url.pathname === '/api/training/tasks') return reply({ dataMode: '试点', items: [state.training] });
    if (['/api/training/assessments', '/api/training/archives'].includes(url.pathname)) return reply({ dataMode: '试点', items: [] });
    if (url.pathname === '/api/training/tasks/fixture-training/start') {
      Object.assign(state.training, { status: '训练中', startedAt: new Date().toISOString() });
      return reply({ task: state.training });
    }
    if (url.pathname === '/api/events/help' && request.method() === 'POST') {
      if (state.failHelp) return reply({ detail: '测试网络中断，未取得回执' }, 503);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const receipt = event('fixture-help', 'help', { bay: data.bay, description: data.description || '' });
      state.events.set(receipt.id, receipt);
      return reply({ event: receipt });
    }
    if (url.pathname === '/api/events/reports' && request.method() === 'POST') {
      const receipt = event('fixture-report', 'report', { bay: data.bay, description: data.description });
      state.events.set(receipt.id, receipt);
      return reply({ event: receipt });
    }
    if (url.pathname === '/api/events/lost-claims' && request.method() === 'POST') {
      const receipt = event('fixture-lost', 'lost', { bay: data.bay });
      state.events.set(receipt.id, receipt);
      return reply({ event: receipt });
    }
    const mutation = url.pathname.match(/^\/api\/events\/([^/]+)\/(status|supplement)$/);
    if (mutation) {
      const receipt = state.events.get(mutation[1]);
      assert.ok(receipt, 'Mutation targets a known fixture.');
      if (mutation[2] === 'status') Object.assign(receipt, { status: data.status, owner: data.owner || receipt.owner, result: data.result });
      return reply({ event: receipt });
    }
    const detail = url.pathname.match(/^\/api\/events\/([^/]+)$/);
    if (detail && state.events.has(detail[1])) return reply({ event: state.events.get(detail[1]) });
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return reply({ detail: 'No fixture for this request' }, 404);
  });
  if (context.routeWebSocket) await context.routeWebSocket('**/api/events/realtime', (socket) => socket.close());
  await context.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) => failure({ code: 1, message: 'Test permission denied' });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => state.errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/api/') && !response.url().endsWith('favicon.ico')) state.failedAssets.push(response.url());
  });
  return { context, page, state };
}

const go = async (page, query = '') => {
  await page.goto('about:blank');
  await page.goto(`${base}/#/pages/main/main${query}`, { waitUntil: 'networkidle' });
  await page.locator('.mini-app').waitFor();
};
const button = (page, text) => page.locator('taro-button-core:visible').filter({ hasText: new RegExp(`^${text}$`) });
const nav = (page, name) => page.locator('.mini-bottom-nav:visible taro-button-core').filter({ hasText: new RegExp(`^${name}$`) });
async function capture(page, name) {
  await page.waitForTimeout(450);
  assert.equal(await page.locator('iframe#webpack-dev-server-client-overlay').count(), 0, 'No development overlay.');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow) {
    await page.screenshot({ path: path.join(output, `${name}-overflow.png`), fullPage: true });
    console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width && (rect.right > innerWidth + 2 || rect.left < -2);
    }).slice(0, 15).map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent.slice(0, 60), rect: element.getBoundingClientRect().toJSON() }))));
  }
  assert.equal(overflow, false, `${name}: no horizontal overflow`);
  const failedImages = await page.locator('taro-image-core:visible img').evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src));
  assert.deepEqual(failedImages, [], `${name}: all image assets render`);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromium.executablePath()) ? {} : { channel: 'msedge' }) });
  const results = [];
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 1440, height: 1000 }]) {
      const { context, page, state } = await setup(browser, viewport);
      await page.goto(base, { waitUntil: 'networkidle' });
      await capture(page, `${viewport.width}-login`);
      await page.getByText('工作人员登录', { exact: true }).click();
      await page.locator('#staff-account input').waitFor();
      await button(page, '返回群众端').click();
      await page.locator('.citizen-help-entry').waitFor();
      await capture(page, `${viewport.width}-home`);
      assert.equal(state.calls.some((call) => call.path === '/api/events'), false, 'Citizen never reads the global event list.');
      await nav(page, '报警').click();
      await capture(page, `${viewport.width}-alarm`);
      const alarm = await page.locator('#alarm-submit').boundingBox();
      assert.ok(alarm.width >= 170 && alarm.x >= 0 && alarm.x + alarm.width <= viewport.width, 'Alarm button is prominent and fits.');
      await page.locator('#alarm-submit').click();
      await button(page, '获取当前位置').click();
      await page.getByText('未能获取定位。你可以手动填写街道、摊位或附近地标。', { exact: true }).waitFor();
      await page.locator('.mini-sheet input').fill('盛金塔夜市 · 便民服务站');
      await button(page, '确认位置').click();
      await page.locator('#alarm-submit').click();
      await capture(page, `${viewport.width}-alarm-confirm`);
      await button(page, '暂不发送').click();
      assert.equal(state.calls.filter((call) => call.path === '/api/events/help').length, 0, 'Cancel sends no help request.');
      await page.locator('#alarm-submit').click();
      if (viewport.width === 390) {
        state.failHelp = true;
        await page.locator('#alarm-confirm-send').click();
        await page.getByText('测试网络中断，未取得回执', { exact: true }).waitFor();
        await capture(page, '390-alarm-failed');
        assert.equal(await page.locator('.alarm-receipt-title').count(), 0, 'Failed send has no fabricated receipt.');
        state.failHelp = false;
        await page.locator('#alarm-submit').click();
      }
      await page.locator('#alarm-confirm-send').click();
      await page.locator('.alarm-receipt-title').waitFor();
      assert.equal(await page.locator('.alarm-receipt-title').innerText(), '求助已提交');
      assert.match(await page.locator('.alarm-surface').innerText(), /尚未获得人工接单回执/);
      const helpCall = state.calls.filter((call) => call.path === '/api/events/help').at(-1);
      assert.equal('latitude' in helpCall.data, false, 'Manual address does not fabricate GPS.');
      assert.equal('longitude' in helpCall.data, false);
      await capture(page, `${viewport.width}-alarm-receipt`);
      await button(page, '查看回执').click();
      await page.locator('.detail-page').waitFor();
      await capture(page, `${viewport.width}-event-detail`);
      await go(page, '?tab=report');
      await page.locator('input[placeholder="街道、摊位或附近地标"]').fill('夜市东侧通道');
      await page.locator('textarea:visible').fill('消防通道被杂物占用');
      await nav(page, '首页').click();
      await nav(page, '上报').click();
      assert.equal(await page.locator('textarea:visible').inputValue(), '消防通道被杂物占用', 'Switching tabs preserves report drafts.');
      await capture(page, `${viewport.width}-report`);
      await button(page, '提交上报').click();
      await page.getByText('上报已提交', { exact: true }).waitFor();
      await button(page, '查看进度').click();
      await page.locator('.mini-event-card').first().waitFor();
      await capture(page, `${viewport.width}-progress`);
      await page.reload({ waitUntil: 'networkidle' });
      await nav(page, '进度').click();
      await page.locator('.mini-event-card').first().waitFor();
      assert.ok(state.calls.some((call) => call.path === '/api/events/fixture-help'), 'Receipts reload by ID.');
      await nav(page, '我的').click();
      await capture(page, `${viewport.width}-mine`);
      await button(page, '工作人员入口').click();
      await page.locator('.taro-model__cancel:visible').click();
      await page.locator('.citizen-profile').waitFor();
      await button(page, '工作人员入口').click();
      await page.getByText('继续切换', { exact: true }).click();
      await page.locator('#staff-account input').fill('xx');
      await page.locator('#staff-password input').fill('incorrect');
      await button(page, '登录工作人员端').click();
      await page.getByText('账号或密码错误，请重新输入', { exact: true }).waitFor();
      await page.locator('#staff-password input').fill('123');
      await capture(page, `${viewport.width}-staff-login`);
      await button(page, '登录工作人员端').click();
      await page.locator('.staff-workspace').waitFor();
      assert.equal(await page.locator('.staff-training:visible').count(), 0, 'Training is hidden on the workbench.');
      await capture(page, `${viewport.width}-staff`);
      await nav(page, '任务').click();
      await capture(page, `${viewport.width}-staff-tasks`);
      await button(page, '接收任务').click();
      await button(page, '确认到场').waitFor();
      assert.equal(state.events.get('fixture-task').status, '已接收');
      await button(page, '确认到场').click();
      await button(page, '开始处置').waitFor();
      await button(page, '开始处置').click();
      await button(page, '回传处置结果').waitFor();
      await button(page, '回传处置结果').click();
      await page.locator('.mini-sheet textarea').fill('已排除现场隐患，通道恢复畅通。');
      await capture(page, `${viewport.width}-staff-completion`);
      await page.locator('.mini-sheet .mini-primary').click();
      await page.getByText('平台已确认：已完成', { exact: true }).waitFor();
      assert.equal(state.events.get('fixture-task').result, '已排除现场隐患，通道恢复畅通。');
      await nav(page, '训练').click();
      await page.getByText('装备与安全确认', { exact: true }).waitFor();
      await capture(page, `${viewport.width}-training`);
      for (const checkbox of await page.locator('.staff-check-row input[type="checkbox"]').all()) await checkbox.check();
      assert.equal(await button(page, '开始训练').getAttribute('disabled'), null, 'Safety checks enable training.');
      await button(page, '开始训练').click();
      await page.getByText('训练用时', { exact: true }).waitFor();
      assert.equal(state.training.status, '训练中');
      await capture(page, `${viewport.width}-training-running`);
      assert.deepEqual(state.errors, [], 'No uncaught browser exceptions.');
      assert.deepEqual(state.failedAssets, [], 'No failed static assets.');
      assert.deepEqual(state.unexpected, [], 'No unexpected API or external requests.');
      results.push({ viewport, calls: state.calls.length, errors: state.errors, status: 'passed' });
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ status: 'passed', results }, null, 2));
    console.log(JSON.stringify({ status: 'passed', output, results }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
