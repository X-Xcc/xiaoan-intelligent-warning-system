import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);

function read(path) {
  return fs.readFileSync(new URL(path, root), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasRouteIntent(source, route) {
  const directNavigation = new RegExp(`navigate\\(['\"]${route}['\"]\\)`);
  const routeDescriptor = new RegExp(`route:\\s*['\"]${route}['\"]`);
  const keyedBusinessCard = new RegExp(`key:\\s*['\"]${route}['\"]`);
  const dynamicNavigation = /navigate\(system\.key/.test(source);
  return directNavigation.test(source) || routeDescriptor.test(source) || (dynamicNavigation && keyedBusinessCard.test(source));
}

test('公安大数据与 AI 平台首页以数据底座优先的信息架构组织内容', () => {
  const page = read('apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx');

  for (const label of [
    '公安大数据与 AI 平台',
    '数据资源中心',
    'AI 智能中枢',
    '五大业务系统',
    '统一数据对象',
    '平台治理与安全',
  ]) {
    assert.match(page, new RegExp(escapeRegExp(label)));
  }

  for (const selector of [
    'data-platform-hero',
    'data-platform-foundation-grid',
    'data-platform-business-grid',
  ]) {
    assert.match(page, new RegExp(selector));
  }
});

test('公安大数据与 AI 平台首页为基础能力和业务入口提供可访问名称与路由意图', () => {
  const page = read('apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx');

  for (const label of [
    '公安大数据与 AI 平台首页',
    '数据资源中心',
    'AI 智能中枢',
    '五大业务系统',
    '统一数据对象',
    '平台治理与安全',
  ]) {
    assert.match(page, new RegExp(`aria-label=['\"]${escapeRegExp(label)}['\"]`));
  }

  const businessRoutes = ['command', 'case', 'community', 'duty-plan', 'mobile'];
  for (const route of businessRoutes) {
    assert.equal(hasRouteIntent(page, route), true, `应存在到 /${route} 的业务入口意图`);
  }
  assert.equal(new Set(businessRoutes).size, 5, '首页应提供五个独立业务系统入口');
});

test('平台运行态合并保留前端路由键并映射后端稳定业务键', () => {
  const app = read('apps/dashboard/src/pages/DashboardApp.tsx');

  assert.match(app, /const BUSINESS_ROUTE_ALIASES\s*=\s*\{[\s\S]*alarm:\s*'command'[\s\S]*training:\s*'duty-plan'/);
  assert.match(app, /function mergeBusinessSystems\(/);
  assert.match(app, /key:\s*fallback\.key/);
  assert.match(app, /name:\s*runtime\?\.name\s*\?\?\s*fallback\.name/);
  assert.match(app, /capabilities:\s*runtime\?\.capabilities\?\.length\s*\?\s*runtime\.capabilities\s*:\s*fallback\.capabilities/);
});
