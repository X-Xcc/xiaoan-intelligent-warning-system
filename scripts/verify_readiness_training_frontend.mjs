import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const page = fs.readFileSync(new URL('apps/dashboard/src/pages/PoliceDomainPages.tsx', root), 'utf8');
const dashboard = fs.readFileSync(new URL('apps/dashboard/src/pages/DashboardApp.tsx', root), 'utf8');
const styles = fs.readFileSync(new URL('apps/dashboard/src/styles/workspaces.css', root), 'utf8');

test('备勤训练工作台消费 A1 A2 A3 试点接口并公开人工复核边界', () => {
  for (const text of [
    '/training/readiness',
    '/training/tasks',
    '/exception',
    '/assessment',
    '/retraining',
    '脱敏训练样例',
    'A1 靶向依据',
    '本地监控画面',
    '人工复核入口已开放',
    '登记异常',
    '创建补训任务',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('备勤训练场景支持本地监控录像、结束评分与快捷评分降级', () => {
  for (const text of [
    'navigator.mediaDevices.getUserMedia',
    'MediaRecorder',
    'URL.createObjectURL',
    '开始录像',
    '结束并由小安评分',
    'Tab + P',
    '小安评价',
    'speechSynthesis',
    '本地试点录像，不上传',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('备勤训练以单任务六步执行链串联选择、录像、复核、归档和补训', () => {
  for (const text of [
    '训练执行闭环',
    '选择训练任务',
    '训练准备',
    '训练监控',
    '小安评分',
    '教官复核',
    '归档与补训',
    '确认并开始训练',
    '提交教官复核',
    '确认评分并归档',
    '补训任务已创建，已进入训练准备。',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('小安评分以结论优先的评估面板组织分数、证据回看与复核动作', () => {
  for (const text of [
    'training-assessment-overview',
    'training-assessment-verdict',
    'training-score-dimension',
    'training-assessment-workspace',
    '评分结论',
    '评分维度',
    '证据回看',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('评分结果可生成独立复测任务，保留原次评分并回到训练准备', () => {
  for (const text of [
    '/retry',
    'createRetestTask',
    '重新测试',
    '复测任务已创建，已进入训练准备。',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('备勤训练以三级目录呈现常见公安民警训练科目，并区分目录项和当前可执行任务', () => {
  for (const text of [
    '公安民警训练科目',
    '基础体能与警务体技能',
    '单警装备与警械使用',
    '武器警械与射击训练',
    '徒手防卫与控制',
    '警务战术与现场处置',
    '执法规范与法律基础',
    '反恐防暴与应急处突',
    '信息化应用与数据安全',
    '综合演练与实战拉练',
    '目录项 / 待配置',
    '当前可执行',
    '训练模板待配置',
    '进入训练',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('训练目录在任务选择步骤中以页内三级筛选呈现，侧边栏只负责系统导航', () => {
  for (const text of ["label: 'A1 勤务态势大屏'", "onClick={() => navigate(item.view)}"]) {
    assert.match(dashboard, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(dashboard, /platform-control-training-menu|训练科目级联菜单|trainingMenuOpen/);
  for (const text of [
    '基础素养',
    '单警技能',
    '现场处置',
    '应急处突',
    '专业警种与数智应用',
    '综合演练',
    '一级领域',
    '二级模块',
    '具体科目',
    '训练任务清单',
    '选择本轮训练对象',
    '可执行试点任务',
    '执行本轮任务',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(page, /initialTrainingCategoryId|initialTrainingSubjectId|左侧“勤务训练系统”下拉菜单/);
});

test('备勤训练以 A1-A3 大屏演示串联快捷推进、靶向任务和原训练闭环', () => {
  assert.match(page, /type TrainingShowcaseStage\s*=\s*'a1'\s*\|\s*'a2'\s*\|\s*'a3'\s*\|\s*'handoff'/);
  assert.match(page, /useState<TrainingShowcaseStage>\(\s*'a1'\s*\)/);
  assert.match(page, /window\.addEventListener\(\s*'keydown'/);
  assert.match(page, /event\.shiftKey\s*&&\s*event\.code\s*===\s*'Space'/);
  for (const targetType of ['HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLVideoElement']) {
    assert.match(page, new RegExp(`target\\s+instanceof\\s+${targetType}`));
  }
  assert.match(page, /target\s+instanceof\s+HTMLElement[\s\S]{0,160}isContentEditable/);
  assert.doesNotMatch(page, /Shift\s*\+\s*Space|快捷键|键帽|按住\s*Shift/);

  for (const text of [
    'training-showcase-stage-a1',
    'training-showcase-stage-a2',
    'training-showcase-stage-a3',
    'training-showcase-handoff',
    'training-showcase-card-basis',
    'training-showcase-card-equipment',
    'training-showcase-card-standard',
    'training-showcase-progress',
    'training-showcase-connector',
    '滋事纠纷 41%',
    '手机扒窃 28%',
    '可疑物品 4%',
    'B区烧烤摊聚集区',
    '20:00–23:00',
    '高发时段',
    '今日靶向训练科目已推送',
    'completeShowcaseSubject',
    'is-complete',
    '/training/tasks',
    '当前为脱敏演示状态',
    'showcase-motion-skeleton',
    'showcase-motion-joint',
    'showcase-motion-link',
    'showcase-scanline',
    '动作规范度',
    '完成用时',
    '协同一致性',
    'showcaseScoresRevealed',
    'showcase-result-stamp',
    '全体科目达标',
    '存在补训项',
    'setFlowStep(3)',
    'showcaseAdvance',
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(
    page,
    /单警装备训练[\s\S]*弱光执法战术训练[\s\S]*防爆先期处置/,
    'A2 应按靶向训练推荐顺序展示三项任务',
  );
  assert.match(page, /SHOWCASE_SUBJECTS\.map\(/);
  const showcaseSubjects = page.match(/const SHOWCASE_SUBJECTS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  assert.ok(showcaseSubjects, '应以 SHOWCASE_SUBJECTS 固定三项靶向任务');
  assert.equal((showcaseSubjects[1].match(/\bid\s*:/g) ?? []).length, 3);
  assert.match(
    page,
    /completeShowcaseSubject[\s\S]{0,1200}setShowcaseStage\(\s*'a3'\s*\)/,
    '三项任务完成后应自动进入 A3 考核',
  );
  assert.match(page, /onClick=\{\(\)\s*=>\s*completeShowcaseSubject\(/);
  assert.match(page, /setShowcaseStage\(\s*'handoff'\s*\)/);
  assert.match(page, /onClick=\{\(\)\s*=>\s*setShowcaseStage\(\s*'a2'\s*\)\s*\}/);
  assert.match(page, /showcaseStarted\s*&&/);
  assert.match(page, /window\.setTimeout\([\s\S]{0,500},\s*500\s*\)/);

  assert.match(page, /setShowcaseScoresRevealed\(\s*\([^)]*\)\s*=>[\s\S]{0,220}Math\.min\(\s*SHOWCASE_SCORES\.length\s*,\s*current\s*\+\s*1\s*\)/);
  assert.match(page, /showcaseScoresRevealed\s*>=\s*3/);
  assert.match(page, /window\.setTimeout\([\s\S]{0,500},\s*500\s*\)/);

  const showcaseAdvance = page.match(/const showcaseAdvance\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(showcaseAdvance, '应提供 showcaseAdvance 快捷推进动作');
  assert.doesNotMatch(showcaseAdvance[1], /reviewTrainingAssessment/);
  assert.match(page, /onClick=\{\(\) => setFlowStep\(3\)\}/);

  assert.match(styles, /\.training-showcase\b/);
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /@media\s*\(max-width:\s*820px\)/);
  assert.doesNotMatch(page, /if\s*\(showcaseStage\s*!==\s*'handoff'[\s\S]{0,240}return\s*<section/);
  const showcaseInsertion = page.indexOf('<div className="training-showcase-shell">{renderTrainingShowcase()}</div>');
  const legacyExecution = page.indexOf('title="备勤训练执行台"');
  assert.ok(showcaseInsertion >= 0 && legacyExecution > showcaseInsertion, '演示区应嵌入既有训练页顶部，不能替换既有执行台');
});
