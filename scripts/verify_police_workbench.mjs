import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);

function read(path) {
  return fs.readFileSync(new URL(path, root), 'utf8');
}

test('首页以平台分层架构组织数据底座、AI中枢和业务系统入口', () => {
  const page = read('apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx');

  for (const text of ['公安大数据与 AI 平台', '数据资源中心', 'AI 智能中枢', '五大业务系统', '统一事件链', '平台治理与安全']) {
    assert.match(page, new RegExp(text));
  }

  assert.match(page, /data-platform-hero/);
  assert.match(page, /data-platform-foundation-grid/);
  assert.match(page, /data-platform-business-grid/);
  assert.match(page, /data-platform-governance/);
});

test('五个业务工作台暴露各自的流程阶段', () => {
  const page = read('apps/dashboard/src/pages/PoliceDomainPages.tsx');

  for (const text of [
    '接警输入', '分级派警', '现场处置', '回传归档',
    '案件受理', '证据校验', '卷宗审核', '移送归档',
    '辖区建档', '任务派发', '走访回传', '闭环复核',
    '课程编排', '模拟训练', '报告确认', '档案沉淀',
    '任务签收', '现场核验', '伴随指引', '结果回传',
  ]) {
    assert.match(page, new RegExp(text));
  }

  assert.match(page, /domain-operation-flow/);
});

test('五个路由导出独立工作台，并以语义化流程列表呈现二十个阶段', () => {
  const page = read('apps/dashboard/src/pages/PoliceDomainPages.tsx');

  for (const component of [
    'CommandOperationsPage',
    'CaseHandlingPage',
    'CommunityPolicingPage',
    'TrainingOperationsPage',
    'MobileDutyPage',
  ]) {
    assert.match(page, new RegExp(`export function ${component}`));
  }

  assert.match(page, /<ol className="domain-operation-flow" aria-label="业务处置流程">/);
  assert.match(page, /<li className=\{step\.state\} key=\{step\.title\}>/);
  assert.match(page, /<b>\{String\(index \+ 1\)\.padStart\(2, '0'\)\}<\/b>/);
});

test('五个工作台完整公开规定的 AI 模块与业务对象', () => {
  const page = read('apps/dashboard/src/pages/PoliceDomainPages.tsx');

  for (const text of [
    'AI 智能语音转写', 'AI 警情自动摘要与警单生成', 'AI 智能分类与分级派警', 'AI 辅助问询指引', 'AI 警情画像与风险推送', 'AI 警情态势分析', 'AI 重复报警与风险识别',
    'AI 智能法律助手', 'AI 智能取证清单', 'AI 证据规则校验', 'AI 类案推送与量刑辅助', 'AI 智能文书生成与审核', 'AI 案件特征比对与串并', 'AI 政法跨部门协同',
    '辖区、网格、地址、重点人地事物画像', '走访任务和隐患清单', '重复警情聚合与风险热力', '走访回传、照片/文字证据和闭环复核', '与接处警、移动勤务、训练复盘的关联入口',
    'AI 智能课程编辑器', 'AI 实战模拟训练（AI 教官）', 'AI 智能评估与报告', 'AI 体能训练与动作识别', '反诈劝阻 AI 实训', '个性化训练推送', 'AI 训练档案（一人一档）',
    'AI 智能问答（移动智囊库）', 'AI 秒级身份核验', 'AI 综合研判与信息推送', 'AI 智能语音交互', 'AI 警情伴随式指引', 'AI 移动指令处置', 'AI 视图智能识别（AI 眼镜）', 'AI 移动办公与审批',
  ]) {
    assert.match(page, new RegExp(text));
  }
});

test('高风险 AI 建议保留依据、时间、审计、人工确认与回退，不直接改变业务状态', () => {
  const page = read('apps/dashboard/src/pages/PoliceDomainPages.tsx');

  for (const text of [
    '人工确认队列', '确认警情摘要', '确认分级派警建议', '确认取证清单', '确认文书草稿', '确认移送材料',
    '评分依据', '动作识别数据时间', '重新训练', '本地缓存时间', '待回传队列',
    '当前节点', '前一节点摘要', '下一节点动作', '审计编号', '回退人工处理', '不直接改变业务状态',
  ]) {
    assert.match(page, new RegExp(text));
  }

  assert.match(page, /aria-live="polite"/);
  assert.match(page, /type="button"/);
});

test('五个业务域围绕各自业务对象提供专用工作面', () => {
  const page = read('apps/dashboard/src/pages/PoliceDomainPages.tsx');

  for (const selector of [
    'command-intake-workbench',
    'case-dossier-workbench',
    'community-territory-workbench',
    'training-course-workbench',
    'mobile-field-workbench',
  ]) {
    assert.match(page, new RegExp(selector));
  }

  assert.doesNotMatch(page, /function ModuleRail/);
  assert.doesNotMatch(page, /function ModuleGrid/);
});

test('工作台提供键盘焦点和窄屏重排样式', () => {
  const styles = read('apps/dashboard/src/styles.css');

  assert.match(styles, /\.platform-control-shell button:focus-visible/);
  assert.match(styles, /\.police-shift-board/);
  assert.match(styles, /\.domain-operation-flow/);
  assert.match(styles, /max-width:\s*860px/);
});

test('专属业务工作面具有独立布局与窄屏回流规则', () => {
  const styles = read('apps/dashboard/src/styles.css');

  for (const selector of [
    '.command-intake-workbench',
    '.case-dossier-workbench',
    '.community-territory-workbench',
    '.training-course-workbench',
    '.mobile-field-workbench',
  ]) {
    assert.match(styles, new RegExp(selector.replace('.', '\\.')));
  }
});
