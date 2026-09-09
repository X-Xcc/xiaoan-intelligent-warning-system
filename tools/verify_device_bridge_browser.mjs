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
const ids = new Set();
let previousBindings;
const errors = [];
const checks = [];
page.on('pageerror', error => errors.push(error.message));
const api = async (suffix = '', method = 'GET', data) => {
  const response = await page.request.fetch(`${base}/api/device-bridges${suffix}`, {
    method, data, headers: { 'X-Admin-Token': token },
  });
  assert.ok(response.ok(), `API ${method} ${suffix}: ${response.status()}`);
  return response.json();
};
const login = async () => {
  const input = page.getByLabel('管理员令牌', { exact: true });
  await input.waitFor();
  await input.fill(token);
  await page.getByRole('button', { name: '授权访问', exact: true }).click();
  await page.getByRole('heading', { name: '设备清单', exact: true }).waitFor();
};
const confirm = async (label) => {
  const name = new RegExp(`^${Array.from(label).join('\\s*')}$`);
  await page.getByRole('dialog').getByRole('button', { name }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 25000 });
};
const geometry = async () => {
  const result = await page.evaluate(() => ({
    viewport: window.innerWidth, width: document.documentElement.scrollWidth,
    overlays: document.querySelectorAll('vite-error-overlay').length,
  }));
  assert.ok(result.width <= result.viewport + 1, `Horizontal overflow: ${JSON.stringify(result)}`);
  assert.equal(result.overlays, 0);
};

try {
  previousBindings = (await api()).bindings;
  await page.goto(`${base}/admin/bridges`, { waitUntil: 'domcontentloaded' });
  await login();
  assert.equal(await page.title(), '设备桥接管理');
  await geometry();
  await page.screenshot({ path: path.join(output, 'desktop-empty.png'), fullPage: true });
  checks.push('Authorized page identity, meaningful content, no overlay and desktop geometry');

  await page.getByRole('button', { name: '添加设备', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('设备名称', { exact: true }).fill('SYNTHETIC QA OFFLINE');
  await editor.getByLabel('IP / 主机名', { exact: true }).fill('127.0.0.1');
  await editor.getByLabel('RTSP 端口', { exact: true }).fill('65530');
  await editor.getByLabel('设备用户名', { exact: true }).fill('fixture-reader');
  await editor.getByLabel('设备密码', { exact: true }).fill('synthetic-fixture-secret');
  await editor.getByLabel('RTSP 路径', { exact: true }).fill('/not-a-camera');
  const saved = page.waitForResponse(response => /\/api\/device-bridges\/?$/.test(response.url()) && response.request().method() === 'POST');
  await editor.getByRole('button', { name: '保存设备', exact: true }).click();
  const created = (await (await saved).json()).device;
  assert.ok(created?.id);
  ids.add(created.id);
  assert.ok(created.hasPassword);
  assert.equal(created.password, undefined);
  await editor.waitFor({ state: 'hidden' });
  await page.locator('.bridge-detail h2').filter({ hasText: created.name }).waitFor();
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await confirm('测试连接');
  await page.getByLabel('最近连接检测').getByText('检测未通过', { exact: true }).waitFor();
  assert.equal(await page.locator('.bridge-preview[data-preview-state="live"]').count(), 0);
  checks.push('UI create persists write-only credentials; real unreachable connection fails without fake video');

  await page.getByRole('button', { name: '编辑设备', exact: true }).click();
  assert.equal(await page.getByRole('dialog').getByLabel('设备密码', { exact: true }).inputValue(), '');
  await page.getByRole('dialog').getByLabel('设备名称', { exact: true }).fill('SYNTHETIC QA RENAMED');
  await page.getByRole('dialog').getByRole('button', { name: '保存设备', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.ok((await api(`/${created.id}`)).device.hasPassword);
  checks.push('UI edit preserves omitted password without returning it to the form');

  await page.getByRole('combobox', { name: '槽位 1 设备', exact: true }).click();
  await page.getByText('SYNTHETIC QA RENAMED', { exact: true }).last().click();
  await page.getByRole('button', { name: '保存绑定', exact: true }).click();
  await confirm('保存绑定');
  assert.equal((await api()).bindings[0], created.id);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await login();
  assert.equal((await api()).bindings[0], created.id);
  assert.ok(page.url().includes(`device=${created.id}`));
  checks.push('Bindings and selected device survive refresh and reauthentication');

  await page.setViewportSize({ width: 390, height: 844 });
  await geometry();
  await page.screenshot({ path: path.join(output, 'mobile-device.png'), fullPage: true });
  await page.getByRole('button', { name: '编辑设备', exact: true }).click();
  await geometry();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: path.join(output, 'mobile-editor.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('dialog').getByRole('button', { name: /^取\s*消$/ }).click();
  checks.push('390px device view and editing dialog fit without document overflow');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.bridge-page-heading').getByRole('button', { name: '视频联动', exact: true }).click();
  await page.locator('.bridge-video-page').waitFor();
  const videoLogin = page.getByLabel('管理员令牌', { exact: true });
  await page.waitForFunction(() => document.querySelector('.monitoring-tile') || document.querySelector('input[aria-label="管理员令牌"]'));
  if (await videoLogin.isVisible()) {
    await videoLogin.fill(token);
    await page.getByRole('button', { name: '授权访问', exact: true }).click();
  }
  await page.locator('.monitoring-tile').first().waitFor();
  await geometry();
  assert.equal(await page.locator('.monitoring-tile').count(), 16);
  assert.equal(await page.locator('.bridge-preview[data-preview-state="live"]').count(), 0);
  assert.equal(await page.getByText('演示画面', { exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, 'desktop-wall-offline.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await geometry();
  await page.screenshot({ path: path.join(output, 'mobile-wall.png'), fullPage: true });
  checks.push('Video wall consumes saved binding, has 16 honest slots, no synthetic fallback and mobile overflow');

  await page.goto(`${base}/admin/bridges?device=${created.id}`, { waitUntil: 'domcontentloaded' });
  await login();
  await page.getByRole('button', { name: '删除设备', exact: true }).click();
  await confirm('删除');
  ids.delete(created.id);
  assert.ok(!(await api()).bindings.includes(created.id));
  checks.push('UI delete removes its profile and clears persisted bindings');

  for (const kind of ['hikvision', 'dahua']) {
    const templateDevice = (await api('', 'POST', {
      name: `SYNTHETIC TEMPLATE ${kind}`, kind, host: '127.0.0.1', port: 65530,
      channel: 2, stream: 'sub', rtspPath: '',
    })).device;
    ids.add(templateDevice.id);
    await page.goto(`${base}/admin/bridges?device=${templateDevice.id}`, { waitUntil: 'domcontentloaded' });
    await login();
    await page.getByRole('button', { name: '编辑设备', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const expected = kind === 'hikvision' ? '/Streaming/Channels/202' : '/cam/realmonitor?channel=2&subtype=1';
    assert.equal(await dialog.getByLabel('RTSP 路径', { exact: true }).inputValue(), expected);
    await dialog.getByRole('button', { name: '保存设备', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await api(`/${templateDevice.id}`)).device.rtspPath, expected);
    await api(`/${templateDevice.id}`, 'DELETE');
    ids.delete(templateDevice.id);
  }
  checks.push('Existing empty Hikvision and Dahua paths open as correct channel-2 substream templates and save');

  await page.getByRole('button', { name: '添加设备', exact: true }).click();
  const go2Editor = page.getByRole('dialog');
  await go2Editor.getByLabel('设备类型', { exact: true }).click();
  await page.getByText('Go2 摄像头', { exact: true }).last().click();
  await go2Editor.getByLabel('Go2 连接模式', { exact: true }).click();
  await page.getByText('LocalAP', { exact: true }).last().click();
  const go2Host = go2Editor.getByLabel('IP / 主机名', { exact: true });
  assert.equal(await go2Host.inputValue(), '192.168.12.1');
  assert.equal(await go2Host.getAttribute('readonly'), '');
  assert.equal(await go2Editor.getByLabel('设备密码', { exact: true }).count(), 0);
  await go2Editor.getByRole('button', { name: /^取\s*消$/ }).click();
  checks.push('Go2 LocalAP selects its fixed host and hides unused camera credentials, without contacting hardware');
  assert.deepEqual(errors, []);
  assert.ok(!page.url().includes(token));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(output, 'desktop-ready.png'), fullPage: true });
  console.log(JSON.stringify({ success: true, checks, pageErrors: errors, output }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  console.error((await page.locator('body').innerText()).slice(-10000));
  throw error;
} finally {
  if (previousBindings) {
    try { await api('/bindings', 'PUT', { bindings: previousBindings }); }
    catch { console.error('Could not restore the pre-test video-wall bindings'); }
  }
  for (const id of ids) {
    try { await api(`/${id}`, 'DELETE'); } catch { /* Retain failed cleanup visibility in the API. */ }
  }
  await browser.close();
}
