import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function navigation() {
  const source = fs.readFileSync(new URL('../pages/DashboardApp.tsx', import.meta.url), 'utf8');
  const module = { exports: {} };
  const { code } = transformSync(`${source}\nexport { systemNavItems };`, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: '/api' }) },
  });
  vm.runInNewContext(code, { module, exports: module.exports, require: () => ({}) });
  return Array.from(module.exports.systemNavItems, item => item.view);
}

function navigationItems() {
  const source = fs.readFileSync(new URL('../pages/DashboardApp.tsx', import.meta.url), 'utf8');
  const module = { exports: {} };
  const { code } = transformSync(`${source}\nexport { systemNavItems };`, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: '/api' }) },
  });
  vm.runInNewContext(code, { module, exports: module.exports, require: () => ({}) });
  return Array.from(module.exports.systemNavItems);
}

test('situation display is the second navigation item after platform overview', () => {
  assert.deepEqual(navigation().slice(0, 2), ['platform', 'duty-situation']);
});

test('shell navigation preserves the original module order', () => {
  const views = navigation();
  assert.equal(views.filter(view => view === 'duty-situation').length, 1);
  assert.deepEqual(views, [
    'platform',
    'duty-situation',
    'command',
    'community',
    'contact-review',
    'video',
    'night-market-command',
    'identity-search',
    'ai-center',
    'admin',
    'device-bridges',
  ]);
});

test('retired case system is absent from the shell and platform entry points', () => {
  const dashboardSource = fs.readFileSync(new URL('../pages/DashboardApp.tsx', import.meta.url), 'utf8');
  const overviewSource = fs.readFileSync(new URL('../pages/PublicSecurityPlatformPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(dashboardSource, /执法办案系统|CaseHandlingPage|view: 'case'/);
  assert.doesNotMatch(overviewSource, /执法办案|view: 'case'/);
});

test('identity search is placed directly below night market command and remains enabled', () => {
  const items = navigationItems();
  const nightMarketIndex = items.findIndex(item => item.view === 'night-market-command');
  assert.equal(items[nightMarketIndex + 1].view, 'identity-search');
  assert.equal(items[nightMarketIndex + 1].label, '身份检索');
  assert.equal(items[nightMarketIndex + 1].disabled, undefined);
});

test('retired modules remain visible but are disabled in the shell navigation', () => {
  const items = navigationItems();
  const disabledViews = items.filter(item => item.disabled).map(item => item.view);
  assert.deepEqual(disabledViews, ['community', 'night-market-command', 'ai-center', 'admin', 'device-bridges']);
});
