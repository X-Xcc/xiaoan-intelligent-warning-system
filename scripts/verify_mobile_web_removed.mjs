import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('mobile duty is not a dashboard route; old URLs fall back to platform', async () => {
  const { code } = transformSync(read('apps/dashboard/src/lib/presentation.ts'), {
    loader: 'ts', format: 'esm', define: { 'import.meta.env.BASE_URL': '"/"' },
  });
  const { routePaths, viewForPath } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  assert.equal('mobile' in routePaths, false);
  assert.equal(viewForPath('/mobile'), 'platform');
  assert.equal(viewForPath('/mobile/tasks'), 'platform');
  assert.equal(viewForPath('/command'), 'command');
});

if (process.argv.includes('--browser')) {
  test('browser hides mobile entries and old URLs render platform', async () => {
    const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/xx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
    const { chromium } = await import(pathToFileURL(runtime).href);
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of ['/platform', '/mobile', '/mobile/tasks']) {
        await page.goto(`http://127.0.0.1:5177${route}`, { waitUntil: 'networkidle' });
        assert.equal(await page.locator('[aria-current="page"]').textContent(), '平台总览');
        assert.equal(await page.getByRole('button', { name: /移动勤务/ }).count(), 0);
        assert.equal(await page.locator('.mobile-domain-page').count(), 0);
      }
      await page.goto('http://127.0.0.1:5177/contact-review', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.cr-record-card').count(), 20);
      assert.equal(await page.getByRole('button', { name: /移动勤务/ }).count(), 0);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

test('dashboard contains no mobile duty page or navigation entry', () => {
  for (const file of ['DashboardApp.tsx', 'PublicSecurityPlatformPage.tsx', 'PoliceDomainPages.tsx']) {
    const source = read(`apps/dashboard/src/pages/${file}`);
    assert.doesNotMatch(source, /MobileDutyPage|mobileModules|(?:view|nextView|key): 'mobile'/);
  }
  assert.ok(fs.existsSync(new URL('../apps/miniprogram/src/app.ts', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../apps/miniprogram/src/app.config.ts', import.meta.url)));
});
