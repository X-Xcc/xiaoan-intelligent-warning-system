import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to the local Playwright entry point');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.TRAINING_UI_URL || 'http://127.0.0.1:8080';
const output = path.resolve(process.env.TRAINING_QA_OUTPUT || '.verify/training-workspace');
const subjects = ['单警装备快速取用', '弱光执法场景战术协同', '防爆先期处置'];
const taskId = 'TRAIN-DEMO-017-01';
const url = `${base}/duty-situation/training?task=${taskId}&officer=DEMO-OFFICER-017`;
const checks = [];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.TRAINING_BROWSER_CHANNEL || 'msedge' });

async function fixture(viewport, legacyTime = '') {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Exercise the unauthorized state without touching device sessions or hardware.
  await page.route('**/api/device-bridges/auth', route => route.fulfill({
    json: { enabled: true, authorized: false, tokenConfigured: true },
  }));
  await page.addInitScript(({ taskId, legacyTime }) => {
    if (sessionStorage.getItem('training-qa-initialized')) return;
    sessionStorage.setItem('training-qa-initialized', 'true');
    sessionStorage.setItem('officer-training-drafts-v1', JSON.stringify({
      [taskId]: { manualTime: true, elapsedInput: legacyTime, reviewer: '', reason: '', exceptionReason: 'old draft' },
    }));
  }, { taskId, legacyTime });
  await page.goto(url);
  await page.locator('.ot-sync.online').waitFor();
  await page.locator('.ot-drill-list li').first().waitFor();
  return { context, page, errors };
}

async function idle(page) {
  await page.locator('#ot-stage-panel[aria-busy="false"]').waitFor();
}

async function geometry(page, name) {
  const result = await page.evaluate(() => {
    const overlaps = [];
    for (const element of document.querySelectorAll('.ot-task-item strong, .ot-drill-heading h4, .ot-task-title, .ot-next-actions button, .ot-monitor-heading h3')) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      if (text.width > box.width + 2 || text.height > box.height + 2) overlaps.push(element.textContent);
    }
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overlaps };
  });
  assert.ok(result.scrollWidth <= result.width + 1, `${name}: horizontal overflow: ${JSON.stringify(result)}`);
  assert.deepEqual(result.overlaps, [], `${name}: text must fit its container`);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
}

async function assertSubjects(page, count = 3) {
  const titles = await page.locator('.ot-task-item > strong').allTextContents();
  assert.equal(titles.length, count);
  assert.deepEqual([...new Set(titles)].sort(), [...subjects].sort());
  assert.equal(await page.locator('.ot-rail-heading > span').innerText(), String(count));
}

async function assertExecution(page) {
  await page.locator('.ot-execution').waitFor();
  await page.locator('.ot-monitor-locked').first().waitFor();
  assert.equal(await page.locator('.ot-monitor').count(), 2);
  assert.equal(await page.locator('.ot-monitor-locked').count(), 2);
  assert.equal(await page.locator('.ot-execution .bridge-login, .ot-timer-tool, .ot-execution .ot-action-bar').count(), 0);
  assert.doesNotMatch(await page.locator('.ot-execution').innerText(), /管理员|训练用时|录入现场计时|登记异常/);
  assert.equal(await page.getByRole('button', { name: '放大02路监控' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '重连03路监控' }).isDisabled(), true);
  const sizes = await page.locator('.ot-recording-layout').evaluate(element => ({
    layout: element.clientWidth,
    monitors: element.querySelector('.ot-training-monitors').getBoundingClientRect().width,
  }));
  assert.ok(Math.abs(sizes.layout - sizes.monitors) < 2, 'Monitors must occupy the former timer column');
}

try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['browser', { width: 1051, height: 898 }],
    ['mobile', { width: 390, height: 844 }],
    ['small-mobile', { width: 320, height: 740 }],
  ]) {
    const { context, page, errors } = await fixture(viewport);
    await assertSubjects(page);
    assert.deepEqual(await page.locator('.ot-drill-heading h4').allTextContents(),
      ['催泪不同场景使用训练', '甩棍快速取用与战术动作']);
    assert.match(await page.locator('.ot-recommendations-heading').innerText(), /2 项.*9 分钟/s);
    await geometry(page, `${name}-recommendations`);
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await idle(page);
    await assertExecution(page);
    await geometry(page, `${name}-execution`);
    assert.deepEqual(errors, []);
    checks.push(`${name}: three tasks, two recommendations, no removed UI, full-width monitors, no text overflow`);
    await context.close();
  }

  const { context, page, errors } = await fixture({ width: 1440, height: 1000 });
  assert.deepEqual(await page.locator('.ot-metrics dd').allTextContents(), ['2项', '1项', '0项', '2份']);
  for (const officer of ['018', '019', '017']) {
    await page.getByLabel('训练对象', { exact: true }).selectOption(`DEMO-OFFICER-${officer}`);
    await assertSubjects(page);
  }
  await page.getByLabel('搜索训练任务', { exact: true }).fill('执法记录仪');
  assert.equal(await page.locator('.ot-task-item').count(), 0);
  await page.getByLabel('搜索训练任务', { exact: true }).fill('');
  await assertSubjects(page);
  await page.getByLabel('筛选任务状态', { exact: true }).selectOption('待训练');
  assert.equal(await page.locator('.ot-task-item').count(), 2);
  await page.getByLabel('筛选任务状态', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: '刷新训练数据', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="刷新训练数据"]').disabled);
  await assertSubjects(page);

  await page.locator('.ot-task-item').filter({ has: page.getByText(subjects[1], { exact: true }) }).click();
  assert.equal(await page.locator('.ot-drill-heading h4').first().innerText(), '弱光照明与反光标识检查');
  await page.locator('.ot-task-item').filter({ has: page.getByText(subjects[2], { exact: true }) }).click();
  await page.getByRole('tab', { name: '科目建议', exact: true }).click();
  assert.equal(await page.locator('.ot-drill-heading h4').first().innerText(), '模拟场地警戒标识布设');
  checks.push('Officer switching, search, state filtering, refresh, and renamed subject recommendations');

  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.locator('.ot-subject-list').waitFor();
  assert.deepEqual(await page.locator('.ot-subject-list strong').allTextContents(), subjects);
  await page.getByRole('checkbox', { name: subjects[1], exact: true }).check();
  await page.getByRole('button', { name: '确认新建（1）', exact: true }).click();
  await page.getByRole('dialog', { name: '新建训练任务', exact: true }).waitFor({ state: 'hidden' });
  await idle(page);
  await assertSubjects(page, 4);
  await page.reload();
  await page.locator('.ot-sync.online').waitFor();
  await assertSubjects(page, 4);
  checks.push('Creation picker is restricted to three subjects and new tasks survive reload');

  await page.goto(url);
  await page.locator('.ot-drill-list li').first().waitFor();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await idle(page);
  await assertExecution(page);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await idle(page);
  await page.locator('.ot-assessment').waitFor();
  await page.locator('.ot-result-heading').waitFor();
  const completeAction = await page.evaluate(() => JSON.parse(sessionStorage.getItem('officer-training-synthetic-actions-v1'))
    .find(action => action.path === '/training/tasks/TRAIN-DEMO-017-01/complete'));
  assert.ok(Number.isInteger(completeAction.body.elapsedSeconds));
  assert.ok(completeAction.body.elapsedSeconds >= 1 && completeAction.body.elapsedSeconds < 60);
  await geometry(page, 'desktop-assessment');
  checks.push('Empty legacy manual-time draft does not block submission; automatically measured time reaches assessment');

  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('textbox', { name: '复核人编号', exact: true }).waitFor();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await idle(page);
  await page.locator('.ot-archive-verdict').waitFor();
  assert.equal(await page.locator('.ot-archive-verdict h3').innerText(), subjects[0]);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  assert.equal(await page.locator('.ot-archive-list tbody tr').count(), 3);
  const historical = page.locator('.ot-archive-list tbody tr').filter({ hasText: '训练场地安全检查' });
  await historical.getByRole('button', { name: '查看档案', exact: true }).click();
  assert.equal(await page.locator('.ot-archive-verdict h3').innerText(), '训练场地安全检查');
  await page.reload();
  await page.locator('.ot-sync.online').waitFor();
  assert.equal(await page.locator('.ot-task-title').innerText(), '训练场地安全检查');
  await page.locator('.ot-archive-verdict').waitFor();
  checks.push('Review and archive complete; historical archives remain readable');
  assert.deepEqual(errors, []);
  await context.close();

  const historicalRetry = await fixture({ width: 1051, height: 898 });
  // Replay a retry saved by an earlier version whose subject is no longer in the rail.
  await historicalRetry.page.evaluate(() => {
    sessionStorage.setItem('officer-training-synthetic-actions-v1', JSON.stringify([{
      path: '/training/tasks/TRAIN-DEMO-017-07/retry', body: {}, time: new Date().toISOString(),
    }]));
  });
  await historicalRetry.page.goto(`${base}/duty-situation/training?task=TRAIN-DEMO-017-NEW-1&officer=DEMO-OFFICER-017`);
  await historicalRetry.page.locator('.ot-sync.online').waitFor();
  assert.equal(await historicalRetry.page.locator('.ot-task-title').innerText(), '训练场地安全检查');
  assert.equal(await historicalRetry.page.locator('.ot-task-number').innerText(), 'TRAIN-DEMO-017-NEW-1');
  await assertSubjects(historicalRetry.page);
  await historicalRetry.page.getByLabel('搜索训练任务', { exact: true }).fill(subjects[0]);
  assert.equal(await historicalRetry.page.locator('.ot-task-title').innerText(), subjects[0]);
  assert.deepEqual(historicalRetry.errors, []);
  await historicalRetry.context.close();
  checks.push('Historical archives and retries survive direct navigation and reload without entering the restricted rail');

  const legacy = await fixture({ width: 1051, height: 898 }, '3500');
  await legacy.page.getByRole('button', { name: '下一步', exact: true }).click();
  await idle(legacy.page);
  await legacy.page.getByRole('button', { name: '下一步', exact: true }).click();
  await idle(legacy.page);
  await legacy.page.locator('.ot-result-heading').waitFor();
  const elapsed = await legacy.page.evaluate(() => JSON.parse(sessionStorage.getItem('officer-training-synthetic-actions-v1'))
    .find(action => action.path.endsWith('/complete')).body.elapsedSeconds);
  assert.ok(elapsed >= 1 && elapsed < 60, 'A valid but obsolete manual-time value must also be ignored');
  assert.deepEqual(legacy.errors, []);
  await legacy.context.close();
  checks.push('Obsolete nonempty manual-time values are ignored');
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ base, checks, passed: true }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, output }, null, 2));
} finally {
  await browser.close();
}
