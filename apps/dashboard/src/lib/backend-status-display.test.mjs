import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const dashboard = read('../pages/DashboardApp.tsx');
const overview = read('../pages/PublicSecurityPlatformPage.tsx');
const nightMarket = read('../pages/NightMarketCommandPage.tsx');

test('global dashboard status remains neutral when an overview poll fails', () => {
  assert.match(dashboard, /setApiOnline\(false\)/);
  assert.doesNotMatch(dashboard, /连接中断|离线快照|数据连接未就绪|未连接业务服务|尚未连接/);
});

test('platform overview keeps a normal global status while data refreshes silently', () => {
  assert.doesNotMatch(overview, /业务数据已连接|非实时数据|未连接|快照记录/);
  assert.match(overview, /平台运行/);
});

test('secondary command surface does not expose a global disconnected status', () => {
  assert.doesNotMatch(nightMarket, /事件同步中断|等待 API 服务/);
  assert.match(nightMarket, /工作台已就绪/);
});
