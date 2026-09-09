import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const web = process.env.ALARM_WEB_URL || 'http://127.0.0.1:5177';
const statePath = path.resolve('.verify/alarm-linkage/web-5177.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
const output = path.resolve('.verify/alarm-linkage');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const writes = [];
const sockets = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method())) writes.push(request.method());
});
page.on('websocket', (socket) => sockets.push(socket));
async function readJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `${url}: ${response.status}`);
  return response.json();
}
try {
  const upstream = await readJson(`${state.apiBaseUrl}/events`);
  const proxy = await readJson(`${web}/api/events`);
  const ids = (response) => response.items.map((event) => event.id).sort();
  assert.deepEqual(ids(proxy), ids(upstream), 'local Web must read the selected server queue');
  await page.goto(`${web}/command`, { waitUntil: 'domcontentloaded' });
  await page.locator('.command-operations-page[data-source="api"]').waitFor();
  await page.locator('.platform-control-sync.online').waitFor();
  assert.ok((await page.locator('.intake-sync-status').innerText()).includes('报警接收在线'));
  assert.deepEqual(
    (await page.locator('[aria-label="选择警情"] option').evaluateAll((items) => items.map((item) => item.value))).sort(),
    ids(proxy),
  );
  if (!proxy.items.length) assert.ok(await page.getByText('暂无待处置警情', { exact: true }).isVisible());
  assert.ok(sockets.some((socket) => socket.url().endsWith('/api/events/realtime') && !socket.isClosed()));
  await page.screenshot({ path: path.join(output, 'server-queue-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.locator('.platform-control-menu-button');
  if (await menu.getAttribute('aria-expanded') === 'true') await menu.click();
  await page.screenshot({ path: path.join(output, 'server-queue-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(writes, [], 'verification must not submit production alarms');
  const result = {
    success: true, apiBaseUrl: state.apiBaseUrl, webUrl: `${web}/command`,
    queueMatchesServer: true, queueCount: proxy.items.length, realtimeConnected: true,
    pageErrors, productionWrites: writes.length, handsetVerified: false,
  };
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'browser-failure.png'), fullPage: true }).catch(() => {});
  console.error({ pageErrors });
  throw error;
} finally {
  await browser.close();
}
