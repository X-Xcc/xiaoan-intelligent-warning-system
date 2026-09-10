import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const base = process.env.BRIDGE_UI_URL || 'http://127.0.0.1:5180';
const token = (await fs.readFile(process.env.BRIDGE_TOKEN_FILE || 'D:/CICSIC/server/.secrets/bridge-console/admin.token', 'utf8')).trim();
const mediamtx = process.env.CICSIC_TEST_MEDIAMTX || 'C:/Users/xx/AppData/Local/Temp/cicsic-device-bridge-acceptance/mediamtx/mediamtx.exe';
const output = process.env.BRIDGE_QA_OUTPUT || 'C:/Users/xx/.codex/visualizations/device-bridge-acceptance';
await fs.mkdir(output, { recursive: true });
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-live-ui-'));
const reservation = net.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const config = path.join(temporary, 'mediamtx.yml');
await fs.writeFile(config, `logLevel: error
rtspAddress: 127.0.0.1:${port}
rtspTransports: [tcp]
rtmp: false
hls: false
webrtc: false
srt: false
moq: false
playback: false
paths:
  all_others:
`);
const media = spawn(mediamtx, [config], { windowsHide: true, stdio: 'ignore' });
let publisher;
let device;
let previousBindings;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let polls = 0;
let snapshots = 0;
page.on('response', response => {
  if (/\/api\/device-bridges\/?$/.test(response.url()) && response.request().method() === 'GET' && response.ok()) polls++;
  if (response.url().includes('/snapshot') && response.ok()) snapshots++;
});
const api = async (suffix = '', method = 'GET', data) => {
  const response = await page.request.fetch(`${base}/api/device-bridges${suffix}`, {
    method, data, headers: { 'X-Admin-Token': token },
  });
  assert.ok(response.ok(), `API ${method} ${suffix}: ${response.status()}`);
  return response.json();
};
const stop = async process => {
  if (!process || process.exitCode !== null || process.signalCode !== null) return;
  const exited = once(process, 'exit');
  process.kill();
  await exited;
};
const publish = () => spawn(process.env.CICSIC_TEST_FFMPEG || 'ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi',
  '-i', 'testsrc2=size=640x360:rate=12', '-an', '-c:v', 'libx264', '-preset', 'ultrafast',
  '-tune', 'zerolatency', '-g', '12', '-pix_fmt', 'yuv420p', '-f', 'rtsp',
  '-rtsp_transport', 'tcp', `rtsp://127.0.0.1:${port}/synthetic-browser-fixture`,
], { windowsHide: true, stdio: 'ignore' });
const login = async () => {
  const field = page.getByLabel('管理员令牌', { exact: true });
  await field.waitFor();
  await field.fill(token);
  await page.getByRole('button', { name: '授权访问', exact: true }).click();
};
const waitUntil = async (predicate, description, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(description);
};

try {
  await waitUntil(async () => {
    try {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      await once(socket, 'connect');
      socket.destroy();
      return true;
    } catch { return false; }
  }, 'Loopback RTSP fixture did not start');
  publisher = publish();
  previousBindings = (await api()).bindings;
  device = (await api('', 'POST', {
    name: 'SYNTHETIC TEST SOURCE', kind: 'rtsp', host: '127.0.0.1', port,
    rtspPath: '/synthetic-browser-fixture',
  })).device;
  await api(`/${device.id}/start`, 'POST');
  await waitUntil(async () => (await api(`/${device.id}`)).device.online, 'Real decoder did not receive synthetic RTSP frames');
  await api('/bindings', 'PUT', { bindings: Array(16).fill(device.id) });
  await page.goto(`${base}/video`, { waitUntil: 'domcontentloaded' });
  await login();
  await page.waitForFunction(() => document.querySelectorAll('.monitoring-tile .bridge-preview[data-preview-state="live"]').length === 16, { timeout: 25000 });
  const pollBaseline = polls;
  const snapshotBaseline = snapshots;
  const first = await page.locator('.monitoring-tile').first().locator('img').screenshot();
  await waitUntil(() => polls >= pollBaseline + 3 && snapshots >= snapshotBaseline + 16, 'Sixteen previews starved polling or snapshot refresh', 18000);
  const second = await page.locator('.monitoring-tile').first().locator('img').screenshot();
  assert.notDeepEqual(first, second, 'Live browser video must change, not show a fixed image');
  await page.screenshot({ path: path.join(output, 'desktop-wall-synthetic-test.png'), fullPage: true });
  await page.getByRole('button', { name: '放大第 1 路', exact: true }).click();
  await page.getByRole('dialog').locator('.bridge-preview[data-preview-state="live"]').waitFor();
  await page.screenshot({ path: path.join(output, 'focus-synthetic-test.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: path.join(output, 'mobile-wall-synthetic-test.png'), fullPage: true });

  await stop(publisher);
  await page.waitForFunction(() => document.querySelectorAll('.bridge-preview[data-preview-state="live"]').length === 0, { timeout: 18000 });
  publisher = publish();
  await page.waitForFunction(() => document.querySelectorAll('.monitoring-tile .bridge-preview[data-preview-state="live"]').length === 16, { timeout: 30000 });
  await page.getByRole('button', { name: '锁定访问', exact: true }).click();
  await page.getByLabel('管理员令牌', { exact: true }).waitFor();
  assert.equal(await page.locator('.bridge-preview img').count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    success: true, source: 'synthetic loopback H264, not physical hardware',
    slots: 16, inventoryPolls: polls, snapshots, movingFrames: true,
    offlineCleared: true, reconnected: true, lockCleared: true, pageErrors: errors, output,
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'live-failure.png'), fullPage: true });
  console.error((await page.locator('body').innerText()).slice(-9000));
  throw error;
} finally {
  if (previousBindings) await api('/bindings', 'PUT', { bindings: previousBindings });
  if (device) await api(`/${device.id}`, 'DELETE');
  await stop(publisher);
  await stop(media);
  await browser.close();
  await fs.rm(temporary, { recursive: true, force: true });
}
