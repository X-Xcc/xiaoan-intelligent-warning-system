import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const output = path.resolve('.verify/open-access');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const checks = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    const rejected = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if ([401, 403].includes(response.status())) rejected.push(new URL(response.url()).pathname);
    });
    for (const [label, route] of [
      ['admin', '/admin'],
      ['command', '/command/workbench'],
      ['devices', '/admin/bridges'],
    ]) {
      await page.goto(`http://127.0.0.1:8080${route}`, { waitUntil: 'networkidle' });
      await page.locator('main').first().waitFor();
      assert.equal(await page.locator('input[type="password"]').count(), 0, `${label}: login password field`);
      assert.equal(await page.getByRole('button', { name: /登录|验证令牌|退出账号|锁定访问/ }).count(), 0,
        `${label}: login-only controls`);
      const text = await page.locator('body').innerText();
      assert.ok(!/管理授权|业务操作不可用|请输入管理令牌/.test(text), `${label}: authorization wall`);
      if (label === 'command') {
        await page.getByRole('button', { name: '登记接警' }).waitFor();
        assert.equal(await page.getByRole('button', { name: '登记接警' }).isEnabled(), true);
      }
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth, content: document.documentElement.scrollWidth,
      }));
      await page.screenshot({ path: path.join(output, `${name}-${label}.png`), fullPage: true });
      checks.push({ viewport: name, page: label, loaded: true, geometry });
    }
    assert.deepEqual(rejected, [], `${name}: rejected anonymous HTTP requests`);
    assert.deepEqual(errors, [], `${name}: browser runtime errors`);
    await context.close();
  }
  console.log(JSON.stringify({ checks }, null, 2));
} finally {
  await browser.close();
}
