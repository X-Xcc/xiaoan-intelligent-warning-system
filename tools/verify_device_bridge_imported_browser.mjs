import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const base = process.env.BRIDGE_UI_URL || 'http://127.0.0.1:5180';
const token = (await fs.readFile(process.env.BRIDGE_TOKEN_FILE || 'D:/CICSIC/server/.secrets/bridge-console/admin.token', 'utf8')).trim();
const output = process.env.BRIDGE_QA_OUTPUT || 'C:/Users/xx/.codex/visualizations/device-bridge-acceptance';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const login = async () => {
  await page.getByLabel('管理员令牌', { exact: true }).fill(token);
  await page.getByRole('button', { name: '授权访问', exact: true }).click();
};
try {
  const response = await page.request.get(`${base}/api/device-bridges`, {
    headers: { 'X-Admin-Token': token },
  });
  assert.ok(response.ok());
  const inventory = await response.json();
  assert.equal(inventory.items.length, 7);
  assert.equal(inventory.items.filter(item => item.kind === 'dahua').length, 3);
  assert.equal(inventory.items.filter(item => item.kind === 'hikvision').length, 1);
  assert.equal(inventory.items.filter(item => item.kind === 'http_mjpeg').length, 2);
  assert.equal(inventory.items.filter(item => item.kind === 'usb').length, 1);
  assert.equal(inventory.bindings.filter(Boolean).length, 7);
  assert.ok(inventory.items.every(item => !('password' in item)));
  assert.ok(inventory.items.filter(item => item.kind !== 'usb').every(item => item.hasPassword));
  assert.ok(inventory.items.every(item => !item.autoStart));
  const device = inventory.items.find(item => item.kind === 'http_mjpeg' && item.httpPath.includes('/Streaming/'));
  assert.ok(device);
  await page.goto(`${base}/admin/bridges?device=${device.id}`, { waitUntil: 'domcontentloaded' });
  await login();
  await page.getByRole('heading', { name: '设备清单', exact: true }).waitFor();
  await page.locator('.bridge-device-name').first().waitFor();
  assert.equal(await page.locator('.bridge-device-name').count(), 7);
  await page.screenshot({
    path: path.join(output, 'desktop-imported-private-masked.png'), fullPage: true, animations: 'disabled',
    mask: [page.locator('.bridge-device-name'), page.locator('.bridge-detail h2'), page.locator('.bridge-slot .ant-select')],
  });
  await page.locator('.bridge-page-heading').getByRole('button', { name: '视频联动', exact: true }).click();
  await page.locator('.monitoring-tile').first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.monitoring-tile .bridge-preview[data-device-id]').length === 7);
  assert.equal(await page.locator('.monitoring-tile').count(), 16);
  assert.equal(await page.locator('.monitoring-tile .bridge-preview[data-device-id]').count(), 7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
  await page.screenshot({
    path: path.join(output, 'mobile-imported-private-masked.png'), fullPage: true, animations: 'disabled',
    mask: [page.locator('.monitoring-feed-name'), page.locator('.bridge-wall-focus strong')],
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ success: true, profiles: 7, bindings: 7, physicalOnline: inventory.items.filter(item => item.online).length, readOnly: true, pageErrors: errors }));
} finally {
  await browser.close();
}
