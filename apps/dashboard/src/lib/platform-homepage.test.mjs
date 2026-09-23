import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function loadModule(path) {
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, format: 'cjs', platform: 'node',
    packages: 'external', jsx: 'automatic',
    define: { 'import.meta.env.BASE_URL': '"/test-app/"' },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${outputFiles[0].text}\n})`)(require, module, module.exports);
  return module.exports;
}
const { PublicSecurityPlatformPage } = loadModule('../pages/PublicSecurityPlatformPage.tsx');
const { normalizeLiveOverview } = loadModule('./platform-overview.ts');

function render(overview = { stats: {} }, props = {}) {
  return renderToStaticMarkup(React.createElement(PublicSecurityPlatformPage, {
    overview, refreshing: false, refresh() {}, navigate() {}, ...props,
  }));
}

test('homepage content carries the project brand and all five existing workbench shortcuts', () => {
  const html = render({ project: '测试警务平台', organization: { name: '测试机构', unit: '综合值守' }, stats: {} });
  assert.ok(html.includes('<h1>测试警务平台</h1>'));
  assert.ok(html.includes('测试机构'));
  assert.ok(html.includes('aria-label="业务工作台快捷入口"'));
  for (const label of ['接处警', '勤务态势', '视频筛查', '视频联动', '身份检索']) {
    assert.ok(html.includes(`aria-label="打开${label}"`), `Missing working shortcut: ${label}`);
  }
});

test('metric values retain real zeroes and never substitute Stitch demonstration numbers', () => {
  const html = render({ stats: { today_events: 0, pending_orders: 0, online_staff: 0, completion_rate: 0, urgent_events: 0 } });
  assert.equal((html.match(/class="overview-metric-value">0/g) ?? []).length, 4);
  assert.ok(!html.includes('>128<'));
  assert.ok(!html.includes('>86<'));
  assert.ok(!html.includes('>91<'));
});

test('unavailable metrics remain unknown and empty work queues offer a real refresh action', () => {
  const html = render({ stats: {}, events: [] }, { refreshing: true });
  assert.equal((html.match(/class="overview-metric-value">—/g) ?? []).length, 4);
  assert.ok(html.includes('aria-busy="true"'));
  assert.ok(html.includes('aria-label="刷新主页数据"'));
  assert.ok(html.includes('当前分类暂无警情'));
  assert.ok(html.includes('暂无业务流转记录'));
});

test('only pending high-risk events receive the urgent row treatment', () => {
  const html = render({ stats: {}, events: [
    { id: 'one', title: '待确认紧急事件', level: '高风险', status: '待人工确认' },
    { id: 'two', title: '已完成紧急事件', level: '高风险', status: '已完成' },
    { id: 'three', title: '普通处置事件', level: '低风险', status: '处置中' },
    { id: 'four', title: '高风险处置事件', level: '高风险', status: '处置中' },
  ] });
  assert.equal((html.match(/<tr class="overview-event-urgent"/g) ?? []).length, 1);
  for (const title of ['待确认紧急事件', '已完成紧急事件', '普通处置事件', '高风险处置事件']) assert.ok(html.includes(title));
});

test('platform service counts come from the overview payload, not invented telemetry', () => {
  const html = render({
    stats: {}, linkage: { stats: { onlineDevices: 7 } },
    aiCenter: { agents: [{ status: 'running' }, { status: 'idle' }], mcpConnectors: [{ status: '在线' }] },
  });
  assert.ok(html.includes('class="overview-service-value">7<small>台</small>'));
  assert.ok(html.includes('class="overview-service-value">2<small>个</small>'));
  assert.ok(html.includes('class="overview-service-value">1<small>个</small>'));
  for (const label of ['在线设备', 'AI 助手', '数据连接']) assert.ok(html.includes(label));
  for (const status of ['演示状态', '已同步', '运行中', '可用']) assert.ok(!html.includes(status));
  assert.ok(!html.includes('42ms'));
  assert.ok(!html.includes('78%'));
});

test('an explicitly empty live registry does not inherit fallback agents', () => {
  const html = render({
    stats: {}, aiCenter: { agents: [], mcpConnectors: [] },
    ai_copilot: { agents: [{ status: 'running' }], mcp_connectors: [{ status: '在线' }] },
  });
  assert.equal((html.match(/class="overview-service-value">0<small>个<\/small>/g) ?? []).length, 2);
});

test('missing platform resources remain unknown instead of reporting zero', () => {
  for (const overview of [{ stats: {} }, normalizeLiveOverview({ stats: {} })]) {
    const html = render(overview);
    assert.equal((html.match(/class="overview-service-value">—/g) ?? []).length, 3);
  }
});

test('normalization preserves an explicitly empty legacy registry as zero', () => {
  const html = render(normalizeLiveOverview({
    stats: {}, ai_copilot: { agents: [], mcp_connectors: [] },
  }));
  assert.equal((html.match(/class="overview-service-value">0<small>个<\/small>/g) ?? []).length, 2);
});

test('the event toolbar has no placeholder filter or pagination controls', () => {
  const html = render({ stats: {}, events: [] });
  assert.ok(html.includes('共 0 条记录'));
  assert.doesNotMatch(html, /打开警情筛选|上一页|下一页|第 1 \/ 1 页/);
});

test('homepage uses one local field image as the primary showcase visual', () => {
  const html = render();
  assert.ok(html.includes('src="/test-app/contact-review-assets/night-market-cam-05.jpg"'));
  assert.ok(html.includes('现场画面'));
  assert.ok(html.includes('现场监控'));
  assert.doesNotMatch(html, /night-market-cam-02.png/);
  assert.ok(!html.includes('googleusercontent.com'));
});

test('the homepage does not replace or restyle the application navigation', () => {
  const source = fs.readFileSync(new URL('../pages/PublicSecurityPlatformPage.tsx', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../styles/overview.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /cdn\.tailwindcss|unpkg\.com|platform-control-sidebar|platform-control-topbar/);
  assert.doesNotMatch(styles, /\.platform-control-|(^|})\s*(body|html|:root)\s*\{/m);
});
