const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('esbuild');
const filename = path.resolve(__dirname, '../src/features/staff/staff-model.ts');

function rules() {
  assert.ok(fs.existsSync(filename), 'Staff task and identity rules must be implemented.');
  const output = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' });
  const module = { exports: {} };
  new Function('module', 'exports', output.code)(module, module.exports);
  return module.exports;
}

const event = (id, status, owner = '李警官', meta) => ({ id, status, owner, meta, title: id, bay: '北入口' });
const trainingTasks = [
  { taskId: 'other', traineeId: 'OFFICER-018', status: '训练中' },
  { taskId: 'done', traineeId: 'OFFICER-017', status: '已归档' },
  { taskId: 'ready', traineeId: 'OFFICER-017', status: '待训练' },
  { taskId: 'running', traineeId: 'OFFICER-017', status: '训练中' },
];

test('task transitions advance one server status at a time', () => {
  const { nextTaskStatus } = rules();
  for (const [current, next] of [
    ['已提交', '已接收'], ['已派单', '已接收'], ['已接收', '已到达'],
    ['已到达', '处理中'], ['处理中', '已完成'], ['已完成', undefined], ['未知', undefined],
  ]) assert.equal(nextTaskStatus(current), next);
});

test('transition validation rejects skips, completed tasks and other owners', () => {
  const { taskTransitionError } = rules();
  assert.ok(taskTransitionError(event('one', '已派单'), '李警官', '已完成', '完成'));
  assert.ok(taskTransitionError(event('one', '已完成'), '李警官', '已接收'));
  assert.ok(taskTransitionError(event('one', '已派单'), '张警官', '已接收'));
  assert.equal(taskTransitionError(event('one', '已到达'), '李警官', '处理中'), '');
});

test('completion requires a user-written result, never a preexisting result', () => {
  const { taskTransitionError } = rules();
  const task = { ...event('one', '处理中'), result: '之前的补充' };
  for (const result of [undefined, '', ' \n ']) {
    assert.ok(taskTransitionError(task, '李警官', '已完成', result));
  }
  assert.equal(taskTransitionError(task, '李警官', '已完成', '现场通道已清理'), '');
});

test('counts include only unique assigned tasks and never the global queue', () => {
  const { assignedTasks, staffTaskCounts } = rules();
  const tasks = [event('a', '已提交'), event('b', '已到达'), event('c', '已完成'),
    event('d', '已派单', '张警官'), event('a', '已提交'), event('e', '已提交', '')];
  const own = assignedTasks(tasks, '李警官');
  assert.deepEqual(own.map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(staffTaskCounts(own), { pending: 1, active: 1, completed: 1 });
  assert.deepEqual(assignedTasks(tasks, '  '), []);
});

test('an explicit different owner takes precedence over stale assignment metadata', () => {
  const { assignedTasks } = rules();
  const meta = { assignment: { staffName: '李警官' } };
  assert.deepEqual(assignedTasks([event('old', '已派单', '张警官', meta)], '李警官'), []);
  assert.equal(assignedTasks([event('own', '已派单', '', meta)], '李警官').length, 1);
  assert.deepEqual(assignedTasks([event('unassigned', '已提交', '', meta)], '李警官'), []);
});

test('task filtering respects each stage and searches actual text', () => {
  const { filterStaffTasks } = rules();
  const tasks = [event('a', '已派单'), event('b', '处理中'), event('c', '已完成')];
  assert.deepEqual(filterStaffTasks(tasks, 'pending').map((item) => item.id), ['a']);
  assert.deepEqual(filterStaffTasks(tasks, 'active').map((item) => item.id), ['b']);
  assert.deepEqual(filterStaffTasks(tasks, 'completed').map((item) => item.id), ['c']);
  assert.equal(filterStaffTasks(tasks, 'all', ' 北入口 ').length, 3);
  assert.equal(filterStaffTasks(tasks, 'all', '不存在').length, 0);
});

test('navigation requires valid real coordinates and excludes default or manual locations', () => {
  const { navigationDestination } = rules();
  for (const source of ['bay_fallback', 'staff_default', 'manual', 'sample']) {
    assert.equal(navigationDestination(event('a', '已接收', '李警官', {
      route: { destination: { latitude: 28.6, longitude: 115.9, source } },
    })), undefined);
  }
  assert.equal(navigationDestination(event('a', '已接收')), undefined);
  assert.equal(navigationDestination(event('a', '已接收', '李警官', { latitude: 91, longitude: 115 })), undefined);
  assert.equal(navigationDestination(event('a', '已接收', '李警官', { latitude: '28', longitude: 115 })), undefined);
  assert.deepEqual(navigationDestination(event('a', '已接收', '李警官', { latitude: 0, longitude: 115 })),
    { latitude: 0, longitude: 115 });
});

test('real alarm coordinates take precedence over route estimates', () => {
  const { navigationDestination } = rules();
  const point = { latitude: 28.6, longitude: 115.9, source: 'visitor_gps' };
  assert.deepEqual(navigationDestination(event('a', '已接收', '李警官', {
    alarmLocation: point, route: { destination: { latitude: 1, longitude: 1, source: 'bay_fallback' } },
  })), point);
});

test('explicit manual location metadata never opens GPS navigation from legacy coordinates', () => {
  const { navigationDestination } = rules();
  assert.equal(navigationDestination(event('manual', '已接收', '李警官', {
    locationSource: 'manual', latitude: 28.6, longitude: 115.9,
    route: { destination: { latitude: 28.6, longitude: 115.9, source: 'legacy_gps' } },
  })), undefined);
});

test('production training never falls back to the first officer or a requested foreign task', () => {
  const { resolveTrainingSubject, selectTrainingTask } = rules();
  assert.equal(resolveTrainingSubject(trainingTasks, '李警官', false, 'OFFICER-017'), '');
  assert.equal(resolveTrainingSubject(trainingTasks, '', true, 'OFFICER-017'), '');
  assert.equal(selectTrainingTask(trainingTasks, '', 'other'), undefined);
  assert.equal(selectTrainingTask(trainingTasks, 'OFFICER-017', 'other').taskId, 'running');
});

test('development subject selection is explicit and limited to real available profiles', () => {
  const { resolveTrainingSubject, trainingProfiles } = rules();
  assert.deepEqual(trainingProfiles(trainingTasks), ['OFFICER-017', 'OFFICER-018']);
  assert.equal(resolveTrainingSubject(trainingTasks, '李警官', true), '');
  assert.equal(resolveTrainingSubject(trainingTasks, '李警官', true, 'invented'), '');
  assert.equal(resolveTrainingSubject(trainingTasks, '李警官', true, 'OFFICER-018'), 'OFFICER-018');
});

test('exact staff identity wins over development selection and selection is stable', () => {
  const { resolveTrainingSubject, selectTrainingTask } = rules();
  assert.equal(resolveTrainingSubject(trainingTasks, 'OFFICER-017', true, 'OFFICER-018'), 'OFFICER-017');
  assert.equal(selectTrainingTask(trainingTasks, 'OFFICER-017', 'ready').taskId, 'ready');
  assert.equal(selectTrainingTask(trainingTasks, 'OFFICER-017').taskId, 'running');
  assert.equal(trainingTasks[0].taskId, 'other');
});

test('training timing never invents zero and accepts only 1 to 3600 whole seconds', () => {
  const { trainingElapsedSeconds, parseTrainingElapsed } = rules();
  assert.equal(trainingElapsedSeconds({}), undefined);
  assert.equal(trainingElapsedSeconds({ startedAt: 'invalid' }), undefined);
  assert.equal(trainingElapsedSeconds({ startedAt: '2026-09-06T10:00:00Z' }, Date.parse('2026-09-06T10:00:12Z')), 12);
  assert.equal(trainingElapsedSeconds({ elapsedSeconds: 27 }), 27);
  for (const text of ['', ' ', '0', '-1', '1.5', '3601', 'NaN']) assert.equal(parseTrainingElapsed(text), undefined);
  assert.equal(parseTrainingElapsed(' 30 '), 30);
});
