import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('../.verify/browser-runtime/node_modules/playwright');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:5173/duty-situation');
await page.locator('.duty-situation-page[data-source="api"]').waitFor({ timeout: 15000 });
await page.locator('.duty-zone-button[data-zone-id="A"]').click();
const liveTasks = await (await fetch('http://127.0.0.1:8010/api/training/tasks')).json();
const expected = [
  ['TRAIN-READINESS-001', 'OFFICER-017'],
  ['TRAIN-READINESS-002', 'OFFICER-018'],
  ['TRAIN-READINESS-003', 'OFFICER-019'],
];
const checks = [];
for (let index = 0; index < expected.length; index += 1) {
  const [task, officer] = expected[index];
  const card = page.locator(`.duty-course[data-task-id="${task}"]`);
  await card.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  await card.click();
  await page.locator('.ot-sync').waitFor({ timeout: 15000 });
  await page.locator('.ot-sync.online').waitFor({ timeout: 15000 });
  assert.equal(new URL(page.url()).pathname, '/duty-situation/training');
  assert.equal(await page.locator('.ot-task-number').innerText(), task);
  assert.equal(await page.getByLabel('训练对象').inputValue(), officer);
  const startButton = page.getByRole('button', { name: '开始训练', exact: true });
  if (await startButton.count()) assert.ok(await startButton.isDisabled());
  assert.match(await page.getByRole('navigation', { name: '训练层级' }).innerText(), /A1 勤务态势/);
  if (index === 1) await page.goBack();
  else await page.getByRole('button', { name: '返回勤务态势', exact: true }).click();
  await page.locator('.duty-situation-page[data-source="api"]').waitFor({ timeout: 15000 });
  await page.waitForFunction((value) => Math.abs(window.scrollY - value) < 3, scrollY);
  assert.equal(await page.locator('.duty-zone-button[data-zone-id="A"]').getAttribute('aria-pressed'), 'true');
  const after = await (await fetch('http://127.0.0.1:8010/api/training/tasks')).json();
  assert.equal(after.items.find((item) => item.taskId === task)?.status, liveTasks.items.find((item) => item.taskId === task)?.status);
  checks.push({ task, officer, status: after.items.find((item) => item.taskId === task)?.status, scrollY });
}
await page.setViewportSize({ width: 470, height: 698 });
assert.equal(await page.locator('.duty-course:visible').count(), 3);
const boxes = await page.locator('.duty-course[data-task-id]').evaluateAll((items) => items.map((item) => { const rect = item.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; }));
assert.ok(boxes.every((box) => box.left >= 0 && box.right <= 470));
assert.ok(boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom));
const result = { success: true, source: await page.locator('.duty-situation-page').getAttribute('data-source'), checks, narrowCourses: boxes.length, pageErrors: errors };
await page.screenshot({ path: 'output/officer-training-acceptance/live-a1-training-entry.png', fullPage: true });
await fs.writeFile('output/officer-training-acceptance/live-a1-training-entry.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
