import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const base = process.env.BRIDGE_UI_URL || 'http://127.0.0.1:5180';
const token = (await fs.readFile(process.env.BRIDGE_TOKEN_FILE || 'D:/CICSIC/server/.secrets/bridge-console/admin.token', 'utf8')).trim();
const output = process.env.BRIDGE_QA_OUTPUT || 'C:/Users/xx/.codex/visualizations/device-bridge-acceptance';
await fs.mkdir(output, { recursive: true });
const images = [];
for (const color of ['0x238bc6', '0xd65173']) {
  const result = await promisify(execFile)('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${color}:s=640x360`, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'],
  { encoding: 'buffer', windowsHide: true, maxBuffer: 2_000_000 });
  images.push(result.stdout);
}
let frames = 0;
const server = http.createServer((request, response) => {
  if (request.headers.authorization !== `Basic ${Buffer.from('reader:fixture-password').toString('base64')}`) {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="fixture"' });
    response.end();
    return;
  }
  if (request.url === '/snapshot') {
    response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
    response.end(images[frames++ % 2]);
    return;
  }
  if (request.url !== '/mjpeg') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame' });
  let index = 0;
  const timer = setInterval(() => {
    if (response.writableNeedDrain) return;
    const image = images[index++ % 2];
    response.write(Buffer.concat([Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${image.length}\r\n\r\n`), image, Buffer.from('\r\n')]));
    frames++;
  }, 250);
  response.on('close', () => clearInterval(timer));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const ids = [];
page.on('pageerror', error => errors.push(error.message));
const api = async (suffix = '', method = 'GET', data) => {
  const response = await page.request.fetch(`${base}/api/device-bridges${suffix}`, {
    method, data, headers: { 'X-Admin-Token': token },
  });
  assert.ok(response.ok(), `API ${method} ${suffix}: ${response.status()}`);
  return response.json();
};
const choose = async (dialog, label) => {
  await dialog.getByLabel('设备类型', { exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click();
};
const confirm = async name => {
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${Array.from(name).join('\\s*')}$`) }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 25000 });
};
try {
  await page.goto(`${base}/admin/bridges`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('管理员令牌', { exact: true }).fill(token);
  await page.getByRole('button', { name: '授权访问', exact: true }).click();
  await page.getByRole('heading', { name: '设备清单', exact: true }).waitFor();
  for (const [kind, label, route] of [['http_snapshot', 'HTTP 快照', '/snapshot'], ['http_mjpeg', 'HTTP MJPEG', '/mjpeg']]) {
    const pathLabel = kind === 'http_snapshot' ? 'HTTP 快照路径' : 'HTTP MJPEG 路径';
    await page.getByRole('button', { name: '添加设备', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await choose(dialog, label);
    assert.equal(await dialog.getByLabel('HTTP 端口', { exact: true }).inputValue(), '80');
    await dialog.getByLabel('设备名称', { exact: true }).fill(`SYNTHETIC ${label}`);
    await dialog.getByLabel('IP / 主机名', { exact: true }).fill('127.0.0.1');
    await dialog.getByLabel('HTTP 端口', { exact: true }).fill(String(port));
    await dialog.getByLabel(pathLabel, { exact: true }).fill(route);
    await dialog.getByLabel('设备用户名', { exact: true }).fill('reader');
    await dialog.getByLabel('设备密码', { exact: true }).fill('fixture-password');
    const saved = page.waitForResponse(response => /\/api\/device-bridges\/?$/.test(response.url()) && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: '保存设备', exact: true }).click();
    const device = (await (await saved).json()).device;
    assert.ok(device?.id);
    ids.push(device.id);
    assert.equal(device.kind, kind);
    assert.ok(device.hasPassword);
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await confirm('测试连接');
    await page.getByLabel('最近连接检测').getByText('检测通过', { exact: true }).waitFor();
    await page.getByRole('button', { name: /^启\s*动$/ }).click();
    await confirm('启动');
    const preview = page.locator('.bridge-detail .bridge-preview[data-preview-state="live"]');
    await preview.waitFor({ timeout: 20000 });
    const first = await preview.locator('img').screenshot();
    let changed = false;
    for (let attempt = 0; attempt < 20 && !changed; attempt++) {
      await page.waitForTimeout(300);
      changed = !first.equals(await preview.locator('img').screenshot());
    }
    assert.ok(changed, 'Live HTTP source must update its rendered pixels');
    await page.screenshot({
      path: path.join(output, `desktop-${kind}-synthetic.png`), fullPage: true, animations: 'disabled',
      mask: [page.locator('.bridge-inventory'), page.locator('.bridge-bindings')],
    });
    await page.getByRole('button', { name: /^停\s*止$/ }).click();
    await confirm('停止');
    assert.equal((await api(`/${device.id}`)).device.online, false);
    await page.getByRole('button', { name: '编辑设备', exact: true }).click();
    const edit = page.getByRole('dialog');
    assert.equal(await edit.getByLabel('设备密码', { exact: true }).inputValue(), '');
    assert.equal(await edit.getByLabel(pathLabel, { exact: true }).inputValue(), route);
    await choose(edit, 'USB 摄像头');
    await edit.getByLabel('USB 设备序号', { exact: true }).fill('15');
    assert.equal(await edit.getByLabel('设备密码', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1, { timeout: 5000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await edit.screenshot({ path: path.join(output, 'mobile-usb-editor-no-hardware.png'), animations: 'disabled' });
    await edit.getByRole('button', { name: '保存设备', exact: true }).click();
    await edit.waitFor({ state: 'hidden' });
    const usb = (await api(`/${device.id}`)).device;
    assert.equal(usb.kind, 'usb');
    assert.equal(usb.usbIndex, 15);
    assert.equal(usb.hasPassword, false);
    assert.equal(usb.status, 'stopped');
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ success: true, methods: ['http_snapshot', 'http_mjpeg'], movingPixels: true, usbFormOnly: true, physicalHardwareOpened: false, fixtureFrames: frames, pageErrors: errors }));
} catch (error) {
  console.error(await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('body *')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.right > innerWidth + 1;
    }).slice(0, 15).map(element => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })),
  })));
  await page.screenshot({
    path: path.join(output, 'http-failure.png'), fullPage: false,
    mask: [page.locator('.bridge-inventory'), page.locator('.bridge-bindings')],
  });
  throw error;
} finally {
  for (const id of ids) await api(`/${id}`, 'DELETE').catch(() => console.error('Synthetic fixture cleanup failed'));
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
