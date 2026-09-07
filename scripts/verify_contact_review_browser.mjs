import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const base = process.env.CONTACT_REVIEW_URL || 'http://127.0.0.1:5177/contact-review';
const output = path.join(root, '.verify/contact-review');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const count = async size => {
  await page.waitForFunction(n => document.querySelectorAll('.cr-record-card').length === n, size);
};
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await count(20);
  assert.equal(await page.locator('.contact-review-detail, .cr-companion-detail, .cr-review-section').count(), 0);
  assert.equal(await page.getByRole('textbox', { name: '人工复核备注' }).count(), 0);
  await page.getByRole('textbox', { name: '搜索接触记录' }).fill('P-2048');
  await count(11);
  await page.getByRole('textbox', { name: '搜索接触记录' }).fill('no-such-record');
  await count(0);
  await page.getByRole('button', { name: '重置所有筛选', exact: true }).click();
  await count(20);
  await page.getByRole('combobox', { name: '时间范围' }).selectOption('7');
  await page.getByRole('button', { name: '筛选演示记录' }).click();
  await count(5);
  await page.getByRole('button', { name: '重置所有筛选', exact: true }).click();
  await count(20);
  await page.getByRole('combobox', { name: '结果排序' }).selectOption('oldest');
  assert.equal(await page.locator('.cr-record-open').first().getAttribute('aria-label'), '查看 CR-020');
  await page.getByRole('button', { name: '时间线视图', exact: true }).click();
  assert.ok(await page.locator('.cr-record-list.timeline').isVisible());
  await page.getByRole('button', { name: '图片视图', exact: true }).click();
  await page.getByRole('button', { name: '重置所有筛选', exact: true }).click();
  if (!process.argv.includes('--skip-assets')) {
    for (const image of await page.locator('.cr-record-media img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element => element.decode());
      assert.ok(await image.evaluate(element => element.naturalWidth >= 512));
    }
    assert.equal(await page.locator('.cr-record-media img').count(), 20);
  }
  await page.getByRole('button', { name: '查看 CR-003', exact: true }).click();
  assert.ok(await page.getByRole('dialog').isVisible());
  await page.locator('.cr-expanded-image img').evaluate(element => element.decode());
  assert.ok((await page.getByRole('dialog').innerText()).includes('CR-003'));
  await page.keyboard.press('Escape');
  const layouts = [];
  for (const width of [1920, 1440, 901, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 945 });
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.cr-record-list').scrollTop = 0; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await page.locator('.contact-review-detail').count(), 0);
    await page.screenshot({ path: path.join(output, `desktop-${width}.png`), fullPage: true });
    layouts.push(width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(output, 'page-preview.png') });
  assert.deepEqual(errors, []);
  const report = { verifiedAt: new Date().toISOString(), removedSections: true, images: 20, cardPreview: true, layouts, errors };
  fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
