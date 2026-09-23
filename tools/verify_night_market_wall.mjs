import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The browser plugin cannot initialize in this session; use the installed runtime.
const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const url = process.env.VIDEO_URL || 'http://127.0.0.1:5177/video';
const output = path.resolve('.verify/night-market-wall');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const image = await fs.readFile('apps/dashboard/public/contact-review-assets/night-market-cam-01.jpg');
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let state = 'empty';
let missingImage = false;
let failedService = false;
let failedMedia = false;
await page.route('**/night-market-cam-*.png', route => missingImage ? route.abort() : route.continue());
await page.route('**/api/device-bridges/**', route => {
  if (failedService) return route.fulfill({ status: 503, json: { detail: 'Test service unavailable' } });
  const pathname = new URL(route.request().url()).pathname;
  const json = body => route.fulfill({ json: body });
  if (pathname.endsWith('/session')) return json({ authorized: true, expiresIn: 3600 });
  if (pathname.endsWith('/readiness')) return json({ ready: true, reasons: [], requiredBindings: [], devices: [] });
  if (/\/(snapshot|feed)$/.test(pathname)) return failedMedia
    ? route.fulfill({ status: 503, body: 'Test media unavailable' })
    : route.fulfill({ contentType: 'image/jpeg', body: image });
  const items = state === 'empty' || state === 'orphan' ? [] : [{
    id: 'test-camera', name: 'TEST CAMERA', kind: 'rtsp', host: '192.0.2.2', port: 554,
    status: state === 'live' ? 'online' : 'stopped', online: state === 'live',
    frameCount: 100, lastFrameAt: new Date().toISOString(), fps: 25,
  }];
  return json({
    items,
    bindings: Array.from({ length: 16 }, (_, i) => i === 1 && state !== 'empty' ? 'test-camera' : null),
    runtime: { running: items.length, maxDevices: 16 },
  });
});
const wall = page.locator('.monitoring-video-wall');
async function decoded(count) {
  await page.waitForFunction(expected => {
    const images = [...document.querySelectorAll('.monitoring-video-wall .night-market-still img')];
    return images.length === expected && images.every(img => img.complete && img.naturalWidth > 0);
  }, count, { timeout: 15000 });
}
async function reload() {
  const response = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/device-bridges/'));
  await page.goto(url);
  await response;
  await wall.waitFor();
}
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

try {
  await reload();
  await decoded(15);
  assert.equal(await wall.locator('.monitoring-tile').count(), 16);
  assert.equal(await wall.locator('[data-preview-state="live"]').count(), 0);
  assert.equal(await wall.getByText('AI 合成 · 非实时', { exact: true }).count(), 15);
  assert.equal(await page.locator('.monitoring-online').count(), 0);
  const sources = await wall.locator('.night-market-still img').evaluateAll(imgs => imgs.map(img => img.src));
  assert.equal(new Set(sources).size, 15);
  for (let i = 2; i <= 16; i += 1) assert.match(sources[i - 2], new RegExp(`cam-${String(i).padStart(2, '0')}\\.png$`));
  const names = await wall.locator('.monitoring-feed-name strong').allTextContents();
  assert.equal(names[0], '机械狗巡检视角');
  assert.equal(names[1], '东门主通道');
  assert.equal(names[2], '中心广场');
  assert.equal(names[15], '河景高位点');
  await noOverflow();
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '放大第 3 路', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.waitFor();
  assert.match(await modal.innerText(), /中心广场/);
  assert.match(await modal.locator('.night-market-still img').getAttribute('src'), /cam-03\.png$/);
  assert.equal(await modal.getByText('AI 合成 · 非实时', { exact: true }).count(), 1);
  await page.screenshot({ path: path.join(output, 'focus.png') });
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden' });
  for (const width of [390, 932]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow();
    await page.screenshot({ path: path.join(output, `viewport-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: '人群分析演示', exact: true }).click();
  await page.locator('.crowd-demo').waitFor();
  await page.goto(url);
  await decoded(15);
  state = 'live';
  await reload();
  await decoded(14);
  const bound = wall.locator('.monitoring-tile').nth(1);
  await bound.locator('[data-preview-state="live"]').waitFor();
  assert.equal(await bound.locator('.night-market-still').count(), 0);
  assert.equal(await bound.locator('.monitoring-feed-name strong').innerText(), 'TEST CAMERA');
  failedMedia = true;
  await bound.locator('.bridge-preview-empty').waitFor();
  assert.equal(await bound.locator('.night-market-still').count(), 0);
  state = 'stopped';
  await reload();
  await decoded(14);
  assert.equal(await bound.locator('.night-market-still').count(), 0);
  assert.equal(await bound.getByText('已停止', { exact: true }).count(), 1);
  state = 'orphan';
  await reload();
  await decoded(14);
  assert.equal(await bound.locator('.night-market-still').count(), 0);
  state = 'empty';
  missingImage = true;
  await reload();
  await page.waitForFunction(() => document.querySelectorAll('.night-market-still img').length === 0);
  assert.equal(await wall.getByText('示例画面加载失败', { exact: true }).count(), 15);
  missingImage = false;
  await wall.getByRole('button', { name: '重试示例画面', exact: true }).first().click();
  await decoded(1);
  failedService = true;
  await page.goto(url);
  await decoded(15);
  await page.locator('.bridge-video-alert').waitFor();
  assert.equal(await wall.locator('[data-preview-state="live"]').count(), 0);
  await noOverflow();
  assert.deepEqual(errors, []);
  console.log('PASS: 15 distinct stills, reserved live slot, accurate labels, focus, responsive layouts, crowd demo, live priority, media failure, offline/orphan bindings, image retry, service outage.');

  await page.unrouteAll({ behavior: 'wait' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await wall.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.night-market-still img')].some(img => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: path.join(output, 'local-current.png'), fullPage: true });
  console.log('PASS: local /video page renders night-market assets.');
} finally {
  await browser.close();
}
