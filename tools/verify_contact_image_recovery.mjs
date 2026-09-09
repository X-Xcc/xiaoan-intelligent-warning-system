import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const url = process.env.CONTACT_REVIEW_URL || 'http://127.0.0.1:5177/contact-review';
const output = path.resolve('.verify/contact-image-recovery');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 882, height: 945 } });
const page = await context.newPage();
const errors = [], mutations = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(request.url());
});
let blockImages = false;
let blockThumbnails = false;
let failedRequests = 0;
const isScene = pathname => /\/(?:contact-review-assets\/zijing-(?:basemap\.webp|demo-cam-\d+\.thumb\.webp)|night-market-cam-\d+\.png)$/.test(pathname);
await page.route('**/*', async route => {
  const pathname = new URL(route.request().url()).pathname;
  if (isScene(pathname) && (blockImages || (blockThumbnails && pathname.endsWith('.thumb.webp')))) {
    failedRequests++;
    return route.abort('connectionrefused');
  }
  return route.continue();
});

async function openRoute() {
  await page.getByRole('button', { name: '查看 CR-001', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '记录详情 · CR-001', exact: true });
  await dialog.getByRole('button', { name: '查看未知人物 02', exact: true }).click();
  await dialog.getByRole('button', { name: '查看步态记录', exact: true }).click();
  return dialog;
}

async function assertDecoded(dialog) {
  await dialog.locator('.cr-nightmarket-basemap').waitFor();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.cr-nightmarket-basemap, .cr-gait-point > img')];
    return images.length === 6 && images.every(image => image.complete && image.naturalWidth > 0);
  });
  const images = await dialog.locator('.cr-gait-point > img').evaluateAll(elements =>
    elements.map(image => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight })));
  assert.equal(new Set(images.map(image => image.src)).size, 5);
  for (const image of images) assert.equal(image.width / image.height, 16 / 9);
  assert.equal(await dialog.locator('.cr-nightmarket-anchor').count(), 5);
  assert.equal(await dialog.locator('.cr-inspection-sidebar').count(), 0);
  assert.equal(await dialog.locator('.cr-gait-photo-error').count(), 0);
}

try {
  for (const asset of ['zijing-basemap.webp', ...['02', '03', '04', '05', '08'].map(id => `zijing-demo-cam-${id}.thumb.webp`)]) {
    const response = await page.request.get(new URL(`/contact-review-assets/${asset}`, url).href);
    assert.equal(response.status(), 200, asset);
    assert.match(response.headers()['content-type'], /^image\/webp/);
    const body = await response.body();
    assert.equal(body.subarray(8, 12).toString(), 'WEBP', asset);
  }
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let dialog = await openRoute();
  await assertDecoded(dialog);
  await page.screenshot({ path: path.join(output, 'initial-882.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  blockImages = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  dialog = await openRoute();
  await dialog.getByText('地图底图暂不可用', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.cr-gait-photo-error').length === 5);
  await page.screenshot({ path: path.join(output, 'simulated-outage.png'), animations: 'disabled' });
  const selected = await dialog.locator('.cr-gait-point[aria-pressed=true]').getAttribute('data-record-id');
  assert.equal(await dialog.getByRole('button', { name: '重新加载地图和图片', exact: true }).count(), 1,
    'An already-open failed route needs a recovery control');

  blockImages = false;
  await dialog.getByRole('button', { name: '重新加载地图和图片', exact: true }).click();
  await assertDecoded(dialog);
  assert.equal(await dialog.locator('.cr-gait-point[aria-pressed=true]').getAttribute('data-record-id'), selected);
  await page.screenshot({ path: path.join(output, 'recovered-882.png'), animations: 'disabled' });

  blockImages = true;
  await dialog.getByRole('button', { name: '重新加载地图和图片', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.cr-gait-photo-error').length === 5);
  await dialog.getByText('地图底图暂不可用', { exact: true }).waitFor();
  blockImages = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await assertDecoded(dialog);

  blockThumbnails = true;
  await dialog.getByRole('button', { name: '重新加载地图和图片', exact: true }).click();
  await assertDecoded(dialog);
  assert.ok((await dialog.locator('.cr-gait-point > img').evaluateAll(images => images.map(image => image.src)))
    .every(src => /\/night-market-cam-\d+\.png/.test(src)), 'Thumbnail failure should use its matching full-size scene');
  blockThumbnails = false;

  for (const width of [1440, 882, 721, 390, 320]) {
    await page.setViewportSize({ width, height: 945 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const overflow = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      elements: [...document.querySelectorAll('body *')].filter(element => {
        const box = element.getBoundingClientRect();
        return box.width && (box.left < -1 || box.right > innerWidth + 1);
      }).slice(0, 15).map(element => ({ tag: element.tagName, class: element.className })),
    }));
    assert.equal(overflow.pageWidth > overflow.viewport, false, JSON.stringify({ width, ...overflow }));
    assert.equal(await dialog.locator('.cr-gait-point:visible').count(), 5);
    assert.equal(await dialog.locator('.cr-nightmarket-heading').evaluate(element => element.scrollWidth > element.clientWidth), false);
    await page.screenshot({ path: path.join(output, `recovered-${width}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 882, height: 945 });
  await dialog.getByRole('button', { name: '放大 CAM-02 夜市场景图', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '夜市场景演示 · CAM-02', exact: true });
  await preview.locator('img').evaluate(image => image.decode());
  await page.keyboard.press('Escape');
  await preview.waitFor({ state: 'hidden' });
  await dialog.getByRole('button', { name: '返回原始图片', exact: true }).click();
  await dialog.getByText('无法识别人物信息', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, []);
  console.log(JSON.stringify({ status: 'PASS', assetResponses: 6, recoveredMapAndPhotos: true,
    onlineRecovery: true, matchingOriginalFallback: true, widths: [1440, 882, 721, 390, 320],
    failedRequestsSimulated: failedRequests, errors, mutations }, null, 2));
} finally {
  await browser.close();
}
