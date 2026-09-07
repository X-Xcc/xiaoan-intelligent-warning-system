import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(root, '.verify/browser-runtime/node_modules/playwright'));
const base = process.env.TRAINING_BROWSER_URL || 'http://127.0.0.1:5173';
const artifacts = path.join(root, 'output/officer-training-acceptance');
await fs.mkdir(artifacts, { recursive: true });
const port = await new Promise((resolve) => {
  const listener = net.createServer().listen(0, '127.0.0.1', () => {
    const port = listener.address().port;
    listener.close(() => resolve(port));
  });
});
const api = `http://127.0.0.1:${port}`;
const database = path.join(root, `.verify/training-browser-${randomUUID()}.sqlite3`);
const server = spawn(path.join(root, 'server/.venv-runtime/Scripts/python.exe'), [
  '-m', 'uvicorn', 'app.main:app', '--app-dir', 'server', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'warning',
], {
  cwd: root, windowsHide: true,
  env: { ...process.env, APP_ENV: 'development', DATABASE_URL: `sqlite:///${database.replaceAll('\\', '/')}`, CICSIC_ALLOW_SQLITE_TESTS: '1', CICSIC_ADMIN_AUTH_ENABLED: 'false', PYTHONIOENCODING: 'utf-8' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stderr.on('data', (chunk) => { serverLog += chunk; });
server.stdout.on('data', (chunk) => { serverLog += chunk; });
let browser;
const evidence = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Isolated server exited: ${serverLog}`);
    try { if ((await fetch(`${api}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Isolated API not ready: ${serverLog}`);
  browser = await chromium.launch({
    executablePath: process.env.TRAINING_BROWSER_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['camera'], locale: 'zh-CN' });
  let failStart = false;
  let longTasks = false;
  let emptyTasks = false;
  // All business requests use this test's disposable database, including writes.
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (failStart && url.pathname.endsWith('/start')) {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: '验收：开始训练被拒绝' }) });
      return;
    }
    const response = await route.fetch({ url: `${api}${url.pathname}${url.search}` });
    if (url.pathname === '/api/training/tasks' && (longTasks || emptyTasks)) {
      const body = await response.json();
      body.items = emptyTasks ? [] : [...body.items, ...Array.from({ length: 80 }, (_, index) => ({
        ...body.items[0], taskId: `LONG-QUEUE-${index}`, subject: `长文本任务 ${index}：装备检查与现场准备训练记录及状态核对`, status: '待训练',
      }))];
      await route.fulfill({ response, json: body });
    } else await route.fulfill({ response });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());
  const button = (name) => page.getByRole('button', { name, exact: true });
  const screenshot = (name) => page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
  const geometry = async (label, desktop) => {
    const result = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      const clipped = [...document.querySelectorAll('h1,h2,h3,button,select,input')].filter((element) => {
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(element).visibility === 'hidden') return false;
        if (element.closest('.duty-ticker-copy,.duty-ticker-viewport,.ot-task-list,.ot-table-scroll')) return false;
        return box.left < -2 || box.right > width + 2;
      }).map((element) => ({ tag: element.tagName, text: (element.textContent || element.getAttribute('aria-label') || '').slice(0, 100) }));
      return { width, height, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, clipped };
    });
    assert.ok(result.scrollWidth <= result.width + 2, `${label}: horizontal overflow ${JSON.stringify(result)}`);
    assert.deepEqual(result.clipped, [], `${label}: clipped controls`);
    if (desktop) assert.ok(result.scrollHeight <= result.height + 2, `${label}: desktop height overflow ${JSON.stringify(result)}`);
    evidence.push({ label, ...result });
  };
  const course = (index) => page.locator(`.duty-course[data-task-id="TRAIN-READINESS-00${index + 1}"]`);
  const navigationChecks = [];
  await page.setViewportSize({ width: 470, height: 698 });
  await page.goto(`${base}/duty-situation`);
  await page.locator('.duty-situation-page[data-source="api"]').waitFor();
  await page.locator('.duty-zone-button[data-zone-id="A"]').click();
  for (let index = 0; index < 3; index++) {
    await course(index).scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => window.scrollY);
    await course(index).click();
    await page.locator('.ot-sync.online').waitFor();
    assert.equal(new URL(page.url()).pathname, '/duty-situation/training');
    assert.equal(await page.locator('.ot-task-number').innerText(), `TRAIN-READINESS-00${index + 1}`);
    assert.equal(await page.getByLabel('训练对象').inputValue(), `OFFICER-01${index + 7}`);
    assert.match(await page.getByRole('navigation', { name: '训练层级' }).innerText(), /A1 勤务态势/);
    assert.ok(await button('开始训练').isDisabled(), 'course navigation never starts training');
    if (index === 1) await page.goBack();
    else await button('返回勤务态势').click();
    await page.locator('.duty-situation-page[data-source="api"]').waitFor();
    await page.waitForFunction((expected) => Math.abs(window.scrollY - expected) < 3, scrollY);
    assert.equal(await page.locator('.duty-zone-button[data-zone-id="A"]').getAttribute('aria-pressed'), 'true');
    navigationChecks.push({ course: index + 1, return: index === 1 ? 'browser-back' : 'return-button', scrollY, passed: true });
  }
  await page.locator('.duty-training-ticker').screenshot({ path: path.join(artifacts, 'a1-courses-470.png') });
  await button('民警单警训练').click();
  await page.locator('.ot-sync.online').waitFor();
  assert.equal(await page.getByLabel('训练对象').inputValue(), 'OFFICER-019', 'general entry remembers the most recent officer');
  await screenshot('training-child-470');
  await page.goto(`${base}/duty-plan?task=TRAIN-READINESS-001`);
  await page.locator('.ot-task-item').first().waitFor();
  await page.locator('.ot-sync.online').waitFor();
  assert.equal(await page.locator('.ot-task-item').count(), 1);
  assert.ok(await button('开始训练').isDisabled());
  assert.equal(new URL(page.url()).pathname, '/duty-situation/training', 'legacy bookmarks retain their selected task');
  const sizes = [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 576 }, { width: 768, height: 1024 }, { width: 470, height: 698 }, { width: 390, height: 844 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await geometry(`training-${size.width}x${size.height}`, size.width > 900);
    await screenshot(`training-prepare-${size.width}x${size.height}`);
    if (size.width === 1366) {
      assert.ok(await page.locator('.ot-checklist label').last().evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const front = document.elementFromPoint(rect.left + 24, rect.top + rect.height / 2);
        return element.contains(front);
      }), 'all preparation confirmations are visible above the action bar at 1366x768');
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  longTasks = true;
  await button('刷新训练数据').click();
  await page.waitForFunction(() => document.querySelectorAll('.ot-task-item').length > 70);
  await geometry('training-long-queue', true);
  assert.ok(await page.locator('.ot-task-list').evaluate((element) => element.scrollHeight > element.clientHeight + 300));
  await screenshot('training-long-queue');
  longTasks = false;
  await button('刷新训练数据').click();
  await page.waitForFunction(() => document.querySelectorAll('.ot-task-item').length === 1);
  await page.locator('select[aria-label="训练对象"]').selectOption('OFFICER-018');
  assert.match(await page.locator('.ot-task-title').innerText(), /弱光/);
  await page.locator('select[aria-label="训练对象"]').selectOption('OFFICER-017');
  for (const checkbox of await page.locator('.ot-preparation input[type="checkbox"]').all()) await checkbox.check();
  await page.reload();
  await page.locator('.ot-sync.online').waitFor();
  assert.ok(await button('开始训练').isEnabled(), 'preparation draft survives reload');
  failStart = true;
  await button('开始训练').click();
  await page.getByRole('alert').filter({ hasText: '验收：开始训练被拒绝' }).waitFor();
  assert.ok(await button('开始训练').isVisible());
  failStart = false;
  await page.getByLabel('筛选任务状态').selectOption('待训练');
  await button('开始训练').click();
  await button('结束并提交考核').waitFor();
  assert.equal(await page.getByLabel('筛选任务状态').inputValue(), 'all');
  await button('录制视频').click();
  await button('停止录像').waitFor();
  await page.waitForFunction(() => {
    const video = document.querySelector('.ot-video video');
    return video?.videoWidth > 0 && video.currentTime > 0.5;
  });
  await screenshot('training-recording');
  await button('停止录像').click();
  await page.locator('.ot-video video[src^="blob:"]').waitFor();
  const recordedPreview = await page.locator('.ot-video video').getAttribute('src');
  await button('返回勤务态势').click();
  await page.getByRole('dialog').filter({ hasText: '离开训练工作台' }).waitFor();
  await button('继续查看').click();
  assert.equal(await page.locator('.ot-video video').getAttribute('src'), recordedPreview, 'cancelling return preserves local video');
  await page.getByLabel('搜索训练任务').fill('不存在的任务');
  await page.getByRole('dialog').filter({ hasText: '筛选将切换当前任务' }).waitFor();
  await button('保留当前任务').click();
  assert.equal(await page.locator('.ot-video video').getAttribute('src'), recordedPreview, 'cancelling a filter preserves the local video');
  assert.equal(await page.getByLabel('搜索训练任务').inputValue(), '');
  await button('录制视频').click();
  await button('停止录像').waitFor();
  await page.waitForFunction(() => document.querySelector('.ot-video video')?.srcObject?.active);
  await button('停止录像').click();
  await page.getByLabel('录入现场计时').check();
  await page.getByLabel('现场用时（秒）', { exact: true }).fill('28');
  await button('结束并提交考核').click();
  await page.locator('.ot-assessment .ot-result-heading').waitFor();
  const score = await page.locator('.ot-result-heading strong').innerText();
  await screenshot('training-assessment');
  await page.reload();
  await page.locator('.ot-assessment .ot-result-heading').waitFor();
  assert.equal(await page.locator('.ot-result-heading strong').innerText(), score);
  await button('教官复核').click();
  assert.ok(await button('确认并归档').isDisabled());
  await page.getByLabel('复核人编号', { exact: true }).fill('INSTRUCTOR-TEST');
  await page.getByLabel('复核意见', { exact: true }).fill('隔离验收：核对用时与样例规则，确认训练记录。');
  await page.reload();
  await page.getByLabel('复核意见', { exact: true }).waitFor();
  assert.match(await page.getByLabel('复核意见', { exact: true }).inputValue(), /隔离验收/);
  await page.getByLabel('筛选任务状态').selectOption('待复核');
  await button('确认并归档').click();
  await page.locator('.ot-archive-verdict').waitFor();
  assert.equal(await page.getByLabel('筛选任务状态').inputValue(), 'all');
  await screenshot('training-archive');
  await button('返回勤务态势').click();
  await course(0).filter({ hasText: '已归档' }).waitFor();
  await button('民警单警训练').click();
  await page.locator('.ot-archive-verdict').waitFor();
  await page.reload();
  await page.locator('.ot-archive-verdict').waitFor();
  await button('创建复训任务').click();
  await button('开始训练').waitFor();
  assert.match(await page.locator('.ot-task-number').innerText(), /RETEST/);
  await page.getByLabel('搜索训练任务').fill('RETEST');
  await page.getByRole('tab', { name: /个人档案/ }).click();
  await button('查看档案').first().click();
  await page.locator('.ot-archive-verdict').waitFor();
  assert.equal(await page.locator('.ot-task-number').innerText(), 'TRAIN-READINESS-001');
  assert.equal(await page.getByLabel('搜索训练任务').inputValue(), '');
  await button('返回勤务态势').click();
  await page.locator('.duty-situation-page[data-source="api"]').waitFor();
  assert.equal(await page.locator('.duty-composition-list li').count(), 4);
  assert.equal(await page.locator('.duty-hour-column.is-peak').count(), 4);
  for (const size of sizes) {
    await page.setViewportSize(size);
    await geometry(`situation-${size.width}x${size.height}`, size.width >= 1200);
    await screenshot(`situation-${size.width}x${size.height}`);
    if (size.width <= 1100) {
      assert.equal(await page.locator('.duty-course:visible').count(), 3, 'narrow screens show the three original courses without animated copies');
      const bounds = await page.locator('.duty-course[data-task-id]').evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      assert.ok(bounds.every((box) => box.left >= 0 && box.right <= size.width));
      assert.ok(bounds.every((box, index) => index === 0 || box.top >= bounds[index - 1].bottom));
      assert.equal(await page.locator('.duty-ticker-track').evaluate((element) => getComputedStyle(element).animationName), 'none');
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await button('生成画像').click();
  await page.locator('.duty-situation-page[data-phase="ticker"]').waitFor();
  await button('暂停动画').click();
  assert.equal(await page.locator('.duty-ticker-track').evaluate((element) => getComputedStyle(element).animationPlayState), 'paused');
  await button('继续动画').click();
  await button('重播画像').click();
  await page.locator('.duty-situation-page[data-phase="ticker"]').waitFor();
  await page.locator('.duty-zone-button').first().click();
  assert.match(await page.locator('.duty-zone-summary').innerText(), /入口/);
  await screenshot('situation-generated');
  await page.locator('.duty-ticker-viewport').hover();
  assert.equal(await page.locator('.duty-ticker-track').evaluate((element) => getComputedStyle(element).animationPlayState), 'paused');
  await page.waitForFunction(() => document.querySelector('.duty-ticker-track').getAnimations().every((animation) => animation.playState === 'paused'));
  await page.locator('.duty-ticker-group:not(.duty-ticker-copy) .duty-course').nth(1).click();
  await page.locator('.ot-task-title').filter({ hasText: '弱光' }).waitFor();
  assert.equal(await page.locator('select[aria-label="训练对象"]').inputValue(), 'OFFICER-018');
  await button('返回勤务态势').click();
  await page.locator('.duty-situation-page[data-source="api"][data-phase="ticker"]').waitFor();
  assert.equal(await page.locator('.duty-zone-button[data-zone-id="A"]').getAttribute('aria-pressed'), 'true');
  await button('民警单警训练').click();
  await page.locator('.ot-task-title').filter({ hasText: '弱光' }).waitFor();
  for (const checkbox of await page.locator('.ot-preparation input[type="checkbox"]').all()) await checkbox.check();
  await button('开始训练').click();
  await button('结束并提交考核').click();
  await button('教官复核').click();
  await page.getByLabel('复核人编号', { exact: true }).fill('INSTRUCTOR-TEST');
  await page.getByLabel('复核意见', { exact: true }).fill('隔离验收：退回补训，保留本次规则评分记录。');
  await page.getByLabel('筛选任务状态').selectOption('待复核');
  await button('退回补训').click();
  await button('创建复训任务').waitFor();
  assert.equal(await page.getByLabel('筛选任务状态').inputValue(), 'all');
  await page.reload();
  await button('创建复训任务').waitFor();
  await button('创建复训任务').click();
  await button('开始训练').waitFor();
  assert.match(await page.locator('.ot-task-number').innerText(), /TRAIN-READINESS-002-RETEST/);
  emptyTasks = true;
  await button('刷新训练数据').click();
  await page.getByRole('heading', { name: '暂无可执行训练' }).waitFor();
  assert.equal(await page.locator('.ot-task-item').count(), 0);
  assert.deepEqual(pageErrors, []);
  await fs.rm(path.join(artifacts, 'failure.txt'), { force: true });
  await fs.writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({
    testedAt: new Date().toISOString(), base, browser: 'Chrome; isolated profile and database',
    workflow: 'prepare, refused start, start, fake-camera recording/replay, filter cancellation, complete, persisted assessment, draft reload, instructor review, archive, reload, retry, filtered archive navigation, A1 generation/pause/replay, training handoff, reject/retry, empty state',
    geometry: evidence, navigationChecks, pageErrors,
  }, null, 2));
  console.log(JSON.stringify({ success: true, geometryChecks: evidence.length, artifacts, workflow: 'passed', pageErrors }, null, 2));
} catch (error) {
  await fs.writeFile(path.join(artifacts, 'failure.txt'), String(error));
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await new Promise((resolve) => {
    if (server.exitCode !== null) resolve();
    else { server.once('exit', resolve); setTimeout(resolve, 5000).unref(); }
  });
}
