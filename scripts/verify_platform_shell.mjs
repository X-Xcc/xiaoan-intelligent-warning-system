import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspace = new URL('../', import.meta.url);
const pagePath = new URL('apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx', workspace);
const appPath = new URL('apps/dashboard/src/pages/DashboardApp.tsx', workspace);
const stylesPath = new URL('apps/dashboard/src/styles.css', workspace);

test('公安大数据与 AI 平台首页暴露分层架构与业务域入口', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  for (const label of ['公安大数据与 AI 平台', '数据资源中心', 'AI 智能中枢', '五大业务系统', '平台治理与安全', '接处警', '执法办案', '社区警务', '勤务训练', '移动勤务']) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /data-platform-hero/);
  assert.match(page, /data-platform-foundation-grid/);
  assert.match(page, /data-platform-business-grid/);
});

test('公安平台首页按数据对象、智能中枢与治理链组织信息', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  for (const label of ['统一数据对象', '国产大模型', 'Agent', 'Skill', 'MCP', '统一事件链', '人工确认']) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /data-platform-flow/);
  assert.match(page, /data-platform-governance/);
});

test('/platform 路由接入统一门户视图', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /'platform'/);
  assert.match(app, /PublicSecurityPlatformPage/);
  assert.match(app, /startsWith\('\/platform'\)/);
  assert.match(app, /return 'platform'/);
  assert.match(app, /platform-control-shell/);
  assert.doesNotMatch(app, /EntryPage|CommandPage|VideoPage/);
});

test('五大业务系统与AI中心拥有独立工作区路由', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  for (const view of ["'command'", "'case'", "'community'", "'duty-plan'", "'mobile'", "'ai-center'"]) {
    assert.match(app, new RegExp(view));
  }
  for (const label of ['接处警系统', '执法办案系统', '社区警务系统', '勤务训练系统', '移动勤务系统', 'AI能力中心']) {
    assert.match(app, new RegExp(label));
  }
  assert.match(app, /CaseHandlingPage/);
  assert.match(app, /CommunityPolicingPage/);
  assert.match(app, /MobileDutyPage/);
  assert.match(app, /AICenterPage/);
});

test('交付页面覆盖用户提出的AI模块清单', () => {
  const pages = [
    fs.readFileSync(new URL('apps/dashboard/src/pages/PoliceDomainPages.tsx', workspace), 'utf8'),
    fs.readFileSync(appPath, 'utf8'),
  ].join('\n').replaceAll(/\s+/g, '');
  for (const label of [
    'AI智能课程编辑器', 'AI实战模拟训练', 'AI智能评估与报告', 'AI体能训练与动作识别', '反诈劝阻 AI 实训', '个性化训练推送', 'AI训练档案',
    'AI智能语音转写', 'AI警情自动摘要', 'AI智能分类与分级派警', 'AI辅助问询指引', 'AI警情画像', 'AI警情态势分析', 'AI重复报警与风险识别',
    'AI智能法律助手', 'AI智能取证清单', 'AI证据规则校验', 'AI类案推送与量刑辅助', 'AI智能文书生成与审核', 'AI案件特征比对与串并', 'AI政法跨部门协同',
    'AI智能问答', 'AI秒级身份核验', 'AI综合研判与信息推送', 'AI智能语音交互', 'AI警情伴随式指引', 'AI移动指令处置', 'AI视图智能识别', 'AI移动办公与审批',
  ]) {
    assert.ok(pages.includes(label.replaceAll(' ', '')));
  }
});

test('Web 端产品品牌统一为公安大数据与 AI 平台', () => {
  const index = fs.readFileSync(new URL('apps/dashboard/index.html', workspace), 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(index, /<title>公安大数据与 AI 平台｜统一警务工作台<\/title>/);
  assert.match(app, /const PRODUCT_NAME = '公安大数据与 AI 平台'/);
  assert.match(app, /const systemNavItems/);
  assert.match(app, /平台治理/);
  assert.doesNotMatch(app, /烟火哨兵/);
});

test('窄屏导航具备可读状态和键盘焦点支持', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.match(app, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(app, /aria-controls="platform-control-sidebar"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(styles, /button:focus-visible,[\s\S]*outline:\s*3px solid var\(--police-cyan\)/);
  assert.match(styles, /@media\s*\(max-width:\s*560px\)/);
});
