import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Browser plugin not available; use the installed Playwright runtime.
const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const url = process.env.VIDEO_URL || 'http://127.0.0.1:8080/video';
const output = path.resolve('.verify/video-placeholders');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const image = await page.screenshot({ type: 'jpeg' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let state = 'empty';
let missingImage = false;
let failedMedia = false;
let failedService = false;
await page.route('**/night-market-cam-*.png', route => missingImage ? route.abort() : route.continue());
await page.route('**/api/device-bridges/**', route => {
  if (failedService) return route.abort('connectionrefused');
  const pathname = new URL(route.request().url()).pathname;
  const json = body => route.fulfill({ json: body });
  if (pathname.endsWith('/auth')) return json({ enabled: false, authorized: true });
  if (pathname.endsWith('/session')) return json({ authorized: true, expiresIn: 3600 });
  if (/\/(snapshot|feed)$/.test(pathname)) return failedMedia
    ? route.fulfill({ status: 503, body: 'Test media unavailable' })
    : route.fulfill({ contentType: 'image/jpeg', body: image });
  const items = state === 'empty' ? [] : [{
    id: 'test-camera', name: 'TEST CAMERA', kind: 'rtsp', host: '192.0.2.2', port: 554,
    status: state === 'live' ? 'online' : 'stopped', online: state === 'live',
    frameCount: 100, lastFrameAt: new Date().toISOString(), fps: 25,
  }];
  return json({ items, bindings: Array.from({ length: 16 }, (_, i) => i === 0 && items.length ? items[0].id : null), runtime: { running: items.length, maxDevices: 16 } });
});
const wall = page.locator('.monitoring-video-wall');
async function decoded(count) {
  await page.waitForFunction(expected => {
    const images = [...document.querySelectorAll('.monitoring-video-wall .bridge-preview-placeholder img')];
    return images.length === expected && images.every(img => img.complete && img.naturalWidth > 0);
  }, count);
}
async function reload() {
  const inventoryResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/device-bridges/'));
  await page.goto(url);
  await inventoryResponse;
  await wall.waitFor();
}
async function assertRemoved() {
  assert.equal(await page.locator('.monitoring-service, .bridge-video-alert, .bridge-preview-placeholder > span').count(), 0);
  assert.equal(await page.getByText('Failed to fetch', { exact: true }).count(), 0);
  assert.equal(await page.getByText('演示图片 · 非实时', { exact: true }).count(), 0);
  const captions = await page.locator('.monitoring-tile-meta, .bridge-wall-slot-actions, .bridge-wall-focus').allTextContents();
  assert.doesNotMatch(captions.join(' '), /未绑定|槽位尚未读取|无视频源|未测得|未记录/);
}
try {
  await reload();
  await decoded(16);
  await assertRemoved();
  assert.match(await page.title(), /视频联动/);
  assert.equal(await wall.locator('[data-preview-state="live"]').count(), 0);
  assert.equal(await wall.locator('.bridge-preview-placeholder').count(), 16);
  const names = await wall.locator('.monitoring-feed-name strong').allTextContents();
  assert.equal(new Set(names).size, 16);
  assert.equal(names[0], '东门主通道');
  assert.equal(names[15], '河景高位点');
  assert.equal(await page.locator('.monitoring-online').count(), 0);
  const sources = await wall.locator('.bridge-preview-placeholder img').evaluateAll(imgs => imgs.map(img => img.src));
  assert.equal(new Set(sources).size, 15);
  assert.match(sources[0], /cam-02\.png$/);
  assert.match(sources[15], /cam-16\.png$/);
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '放大第 3 路', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.waitFor();
  assert.match(await modal.innerText(), /中心广场/);
  assert.match(await modal.locator('.bridge-preview-placeholder img').getAttribute('src'), /cam-03\.png$/);
  await assertRemoved();
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden' });
  await page.mouse.move(0, 0);
  await page.locator('.ant-tooltip:visible').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  state = 'live';
  await reload();
  await wall.locator('[data-preview-state="live"]').waitFor();
  assert.equal(await wall.locator('.monitoring-feed-name strong').first().innerText(), 'TEST CAMERA');
  await decoded(15);
  failedMedia = true;
  await decoded(16);
  state = 'stopped';
  await reload();
  await decoded(16);
  missingImage = true;
  await reload();
  await page.waitForFunction(() => document.querySelectorAll('.bridge-preview-placeholder').length === 0);
  assert.equal(await wall.locator('.bridge-preview-empty').count(), 16);
  assert.equal(await wall.locator('[data-preview-state="live"]').count(), 0);
  failedService = true;
  missingImage = false;
  await page.setViewportSize({ width: 932, height: 945 });
  const failedRequest = page.waitForEvent('requestfailed', request => request.url().includes('/api/device-bridges/'));
  await page.goto(url);
  await failedRequest;
  await decoded(16);
  await assertRemoved();
  await page.screenshot({ path: path.join(output, 'offline-932.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const refreshedRequest = page.waitForEvent('requestfailed', request => request.url().includes('/api/device-bridges/'));
  await page.getByRole('button', { name: '刷新视频状态', exact: true }).click();
  await refreshedRequest;
  await assertRemoved();
  assert.deepEqual(errors, []);
  console.log('PASS: 16 placeholders, 15 assets, zoom, desktop/mobile/932px, live replacement, media failure, stopped device, missing images, offline refresh, removed labels and banner; no page errors.');
  await page.unrouteAll({ behavior: 'wait' });
  await page.goto(url);
  await wall.waitFor();
  await decoded(16);
  await assertRemoved();
  await page.screenshot({ path: path.join(output, 'local-current.png'), fullPage: true });
  console.log('PASS: current local service displays all 16 placeholders.');
} finally {
  await browser.close();
}
