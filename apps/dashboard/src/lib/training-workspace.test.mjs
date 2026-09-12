import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const plain = value => JSON.parse(JSON.stringify(value));

async function loadModule(name, exports) {
  const source = fs.readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
  const context = vm.createContext({ structuredClone, AbortSignal, setTimeout, clearTimeout });
  const runnable = stripTypeScriptTypes(source, { mode: 'transform' })
    .replace(/\bexport\s+(?=(?:const|function|class)\b)/g, '');
  vm.runInContext(`${runnable}\nglobalThis.__moduleExports = { ${exports.join(', ')} };`, context);
  return context.__moduleExports;
}

const demo = await loadModule('training-demo', [
  'demoTrainingSelection',
  'createTrainingDemo',
  'isTrainingWorkspaceSubject',
]);
const recommendations = await loadModule('training-recommendations', ['getTrainingRecommendations']);
const groupDemo = await loadModule('training-group-demo', [
  'GROUP_PARTICIPANTS',
  'GROUP_SUBJECT_NAMES',
  'buildGroupSubjects',
  'buildGroupSummaries',
]);

test('training demo keeps the three requested subjects for all three officers', async () => {
  const snapshot = await demo.createTrainingDemo().snapshot();
  const subjects = ['单警装备快速取用', '弱光执法场景战术协同', '防爆先期处置'];
  for (const officer of ['017', '018', '019']) {
    const tasks = [1, 2, 3].map(index => snapshot.tasks.find(task => task.taskId === `TRAIN-DEMO-${officer}-0${index}`));
    assert.deepEqual(plain(tasks.map(task => task.subject)), subjects);
  }
  assert.equal(snapshot.tasks.filter(demo.isTrainingWorkspaceSubject).length, 9);
});

test('training demo selection maps readiness links to fixed demo officers', () => {
  assert.equal(
    demo.demoTrainingSelection({ taskId: 'TRAIN-READINESS-001', officerId: 'ignored' }).officerId,
    'DEMO-OFFICER-017',
  );
  assert.equal(
    demo.demoTrainingSelection({ taskId: 'TRAIN-READINESS-003', officerId: 'ignored' }).taskId,
    'TRAIN-DEMO-019-03',
  );
});

test('demo action replay preserves a completed training record', async () => {
  const stored = new Map();
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const first = demo.createTrainingDemo(storage);
  await first.request('/training/tasks/TRAIN-DEMO-017-01/start', { method: 'POST', body: '{}' });
  await first.request('/training/tasks/TRAIN-DEMO-017-01/complete', {
    method: 'POST',
    body: JSON.stringify({ elapsedSeconds: 32 }),
  });
  const replayed = await demo.createTrainingDemo(storage).snapshot();
  const task = replayed.tasks.find(item => item.taskId === 'TRAIN-DEMO-017-01');
  assert.equal(task.status, '待复核');
  assert.equal(task.elapsedSeconds, 32);
});

test('recommendations keep the requested equipment and legacy subject aliases', () => {
  assert.deepEqual(
    plain(recommendations.getTrainingRecommendations({ subject: '单警装备快速取用' }).items.map(item => item.id)),
    ['spray-scenarios', 'baton-deployment'],
  );
  assert.equal(recommendations.getTrainingRecommendations({ subject: '弱光执法场景战术协同' }).items[0].id, 'light-check');
  assert.equal(recommendations.getTrainingRecommendations({ subject: '防爆先期处置' }).items[0].id, 'cordon-layout');
});

test('group demo exposes the fixed participant and subject order', () => {
  assert.deepEqual(plain(groupDemo.GROUP_PARTICIPANTS), [
    { officerId: 'DEMO-OFFICER-017', label: '演示人员 017' },
    { officerId: 'DEMO-OFFICER-018', label: '演示人员 018' },
    { officerId: 'DEMO-OFFICER-019', label: '演示人员 019' },
  ]);
  assert.deepEqual(plain(groupDemo.GROUP_SUBJECT_NAMES), [
    '单警装备快速取用',
    '弱光执法场景战术协同',
    '防爆先期处置',
  ]);
});

test('group subjects normalize legacy names, preserve order, and tolerate missing tasks', async () => {
  const snapshot = await demo.createTrainingDemo().snapshot();
  const tasks = snapshot.tasks.filter(task => ['01', '02', '03'].includes(task.taskId.slice(-2)));
  const subjects = groupDemo.buildGroupSubjects(tasks);
  assert.deepEqual(plain(subjects.map(({ subject, taskIds }) => ({ subject, taskIds }))), [
    {
      subject: '单警装备快速取用',
      taskIds: ['TRAIN-DEMO-017-01', 'TRAIN-DEMO-018-01', 'TRAIN-DEMO-019-01'],
    },
    {
      subject: '弱光执法场景战术协同',
      taskIds: ['TRAIN-DEMO-017-02', 'TRAIN-DEMO-018-02', 'TRAIN-DEMO-019-02'],
    },
    {
      subject: '防爆先期处置',
      taskIds: ['TRAIN-DEMO-017-03', 'TRAIN-DEMO-018-03', 'TRAIN-DEMO-019-03'],
    },
  ]);
  assert.deepEqual(
    plain(groupDemo.buildGroupSubjects(tasks.filter(task => task.taskId !== 'TRAIN-DEMO-018-02'))[1].taskIds),
    ['TRAIN-DEMO-017-02', 'TRAIN-DEMO-019-02'],
  );
  assert.deepEqual(
    plain(groupDemo.buildGroupSubjects(tasks.map(task => task.taskId.endsWith('-03') ? { ...task, subject: '防爆警戒圈设置' } : task))[2].taskIds),
    ['TRAIN-DEMO-017-03', 'TRAIN-DEMO-018-03', 'TRAIN-DEMO-019-03'],
  );
});

test('group subjects prefer the newest retry and ignore malformed task records', () => {
  const subjects = groupDemo.buildGroupSubjects([
    { taskId: 'TRAIN-DEMO-017-01', subject: '单警装备快速取用', traineeId: 'DEMO-OFFICER-017', status: '已归档' },
    { taskId: 'TRAIN-DEMO-017-01-RETRY-02', subject: '单警装备快速取用', traineeId: 'DEMO-OFFICER-017', status: '训练中' },
    { taskId: 'TRAIN-DEMO-018-01-RETEST-01', subject: '单警装备快速取用', traineeId: 'DEMO-OFFICER-018', status: '待训练' },
    { taskId: 'TRAIN-DEMO-018-01-RETRY-12', subject: '单警装备快速取用', traineeId: 'DEMO-OFFICER-018', status: '待训练' },
    { taskId: 'TRAIN-DEMO-019-01', subject: '单警装备快速取用', traineeId: 'DEMO-OFFICER-019', status: '未知状态' },
    { taskId: null, subject: '单警装备快速取用', traineeId: 'DEMO-OFFICER-017', status: '已归档' },
  ]);
  assert.equal(subjects[0].participantTasks[0].taskId, 'TRAIN-DEMO-017-01-RETRY-02');
  assert.equal(subjects[0].participantTasks[1].taskId, 'TRAIN-DEMO-018-01-RETRY-12');
  assert.equal(subjects[0].participantTasks[2].taskId, 'TRAIN-DEMO-019-01');
  assert.equal(subjects[0].participantTasks[2].completed, false);
});

test('group summaries generate one total per participant from the three completed subjects', async () => {
  const snapshot = await demo.createTrainingDemo().snapshot();
  const tasks = snapshot.tasks
    .filter(task => ['01', '02', '03'].includes(task.taskId.slice(-2)))
    .map(task => ({ ...task, status: '已归档' }));
  const subjects = groupDemo.buildGroupSubjects(tasks);
  const summaries = groupDemo.buildGroupSummaries(subjects, [0, 1, 2]);
  assert.deepEqual(plain(summaries.map(summary => ({
    officerId: summary.officerId,
    total: summary.total,
    strengths: summary.strengths,
    weaknesses: summary.weaknesses,
  }))), [
    {
      officerId: 'DEMO-OFFICER-017',
      total: 94,
      strengths: ['装备取用动作连贯', '队形配合响应及时'],
      weaknesses: ['弱光环境下搜索节奏仍可加强'],
    },
    {
      officerId: 'DEMO-OFFICER-018',
      total: 89,
      strengths: ['弱光协同动作稳定', '信息传递清晰'],
      weaknesses: ['防爆先期警戒衔接需要加强'],
    },
    {
      officerId: 'DEMO-OFFICER-019',
      total: 84,
      strengths: ['现场警戒意识较好', '处置步骤完成完整'],
      weaknesses: ['装备检查连续性需要保持'],
    },
  ]);
});

test('officer training page no longer contains the removed review and archive workflow', () => {
  const source = fs.readFileSync(new URL('../pages/OfficerTrainingPage.tsx', import.meta.url), 'utf8');
  for (const marker of ['教官复核', '训练档案', '评分记录', '补训', '确认并归档']) {
    assert.doesNotMatch(source, new RegExp(marker));
  }
});
