import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.BRIDGE_UI_URL || 'http://127.0.0.1:5180';
const apiBase = process.env.BRIDGE_API_URL || 'http://127.0.0.1:8010/api';
const token = process.env.BRIDGE_ADMIN_TOKEN;
const liveId = process.env.BRIDGE_LIVE_DEVICE_ID;
const output = process.env.BRIDGE_QA_OUTPUT;
assert.ok(token && liveId && output, 'Set token, physical device ID and output directory');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BRIDGE_BROWSER_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const checks = [];
const created = new Set();
page.on('pageerror', (error) => errors.push(error.message));
const api = async (suffix = '', method = 'GET', data) => {
  const response = await page.request.fetch(`${apiBase}/device-bridges${suffix}`, {
    method, data, headers: { 'X-Admin-Token': token },
  });
  assert.ok(response.ok(), `${method} ${suffix}: ${response.status()}`);
  return response.json();
};
const geometry = async () => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must fit viewport');
};
const screenshot = async (name) => {
  await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
};
const login = async () => {
  await page.getByLabel('管理员令牌', { exact: true }).fill(token);
  await page.getByRole('button', { name: '授权访问', exact: true }).click();
  await page.getByRole('button', { name: '添加设备', exact: true }).waitFor();
};
let before;
try {
  before = await api();
  const live = before.items.find((device) => device.id === liveId);
  assert.ok(live?.online, 'The designated physical camera must already be online');
  const slot = before.bindings.indexOf(liveId) + 1;
  assert.ok(slot > 0);
  await page.goto(`${base}/admin/bridges?device=${liveId}`);
  await login();
  await page.getByRole('button', { name: '连接并接入', exact: true }).click();
  const editor = page.getByRole('dialog');
  assert.equal(await editor.getByLabel('设备密码', { exact: true }).inputValue(), '');
  await editor.getByRole('button', { name: '连接并接入', exact: true }).click();
  await editor.waitFor({ state: 'hidden', timeout: 45000 });
  await page.getByText(`已收到实时画面，已接入槽位 ${String(slot).padStart(2, '0')}`, { exact: true }).waitFor();
  await page.locator('.bridge-detail .bridge-preview[data-preview-state="live"]').waitFor({ timeout: 15000 });
  const image = page.locator('.bridge-detail .bridge-preview img');
  await page.waitForFunction(() => {
    const image = document.querySelector('.bridge-detail .bridge-preview img');
    return image?.naturalWidth > 0 && image?.naturalHeight > 0;
  });
  assert.ok(await image.evaluate((element) => element.naturalWidth >= 320));
  await geometry();
  await screenshot('desktop-live.png');
  checks.push('Physical camera connected through the editor; decoded image rendered in the page');
  assert.deepEqual((await api()).bindings, before.bindings);

  const fixtureName = `QA OFFLINE ${Date.now()}`;
  await page.getByRole('button', { name: '添加设备', exact: true }).click();
  await editor.getByLabel('设备名称', { exact: true }).fill(fixtureName);
  await editor.getByLabel('IP / 主机名', { exact: true }).fill('127.0.0.1');
  await editor.getByLabel('RTSP 端口', { exact: true }).fill('65530');
  await editor.getByLabel('RTSP 路径', { exact: true }).fill('/qa-unreachable');
  await page.setViewportSize({ width: 390, height: 844 });
  await geometry();
  await screenshot('mobile-editor.png');
  const box = await editor.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 391, 'Editor must fit the mobile viewport');
  const posted = page.waitForResponse((response) => /\/device-bridges\/?$/.test(response.url()) && response.request().method() === 'POST');
  await editor.getByRole('button', { name: '连接并接入', exact: true }).click();
  const device = (await (await posted).json()).device;
  created.add(device.id);
  await editor.getByText(/配置已保存，接入未完成/).waitFor({ timeout: 45000 });
  assert.equal((await api(`/${device.id}`)).device.status, 'stopped');
  assert.deepEqual((await api()).bindings, before.bindings);
  await geometry();
  await screenshot('mobile-failure.png');
  const updated = page.waitForResponse((response) => response.url().endsWith(`/device-bridges/${device.id}`) && response.request().method() === 'PUT');
  await editor.getByRole('button', { name: '连接并接入', exact: true }).click();
  await updated;
  await editor.getByText(/配置已保存，接入未完成/).waitFor({ timeout: 45000 });
  const listing = await api();
  assert.equal(listing.items.filter((item) => item.name === fixtureName).length, 1);
  assert.equal(listing.items.find((item) => item.id === device.id).status, 'stopped');
  assert.deepEqual(listing.bindings, before.bindings);
  checks.push('Unreachable camera fails honestly, stops its decoder, and retries the saved ID without duplication');
  await editor.getByRole('button', { name: /^取\s*消$/ }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.bridge-page-heading').getByRole('button', { name: '视频联动', exact: true }).click();
  await page.locator(`.bridge-preview[data-device-id="${liveId}"][data-preview-state="live"]`).waitFor({ timeout: 20000 });
  await geometry();
  await screenshot('desktop-wall.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await geometry();
  await screenshot('mobile-wall.png');
  checks.push('Live camera remains in its original video-wall slot; desktop and mobile have no page overflow');
  assert.deepEqual(errors, []);
} finally {
  for (const id of created) await api(`/${id}`, 'DELETE');
  const after = await api();
  if (before) {
    assert.deepEqual(after.bindings, before.bindings);
    assert.deepEqual(after.items.map((device) => device.id).sort(), before.items.map((device) => device.id).sort());
  }
  await browser.close();
}
console.log(JSON.stringify({ checks, pageErrors: errors }, null, 2));
