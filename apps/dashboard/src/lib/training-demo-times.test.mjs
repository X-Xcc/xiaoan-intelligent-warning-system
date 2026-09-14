import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const storageKey = 'officer-training-synthetic-actions-v1';
const dayMs = 86400000;
const minimumTime = '20:13:50';
const shanghaiTime = value => new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(11, 19);
const shanghaiDate = value => new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10);

function loadDemo(now = '2026-09-13T08:05:07.456+08:00') {
  let currentTime = Date.parse(now);
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [currentTime])); }
    static now() { return currentTime; }
  }
  const context = vm.createContext({
    Date: ClockDate, structuredClone, AbortSignal, setTimeout, clearTimeout,
    window: { location: { origin: 'http://localhost' } },
  });
  const source = fs.readFileSync(new URL('./training-demo.ts', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('./training-api.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.env', '({ DEV: false })');
  const runnable = stripTypeScriptTypes(`${source}\n${api}`, { mode: 'transform' })
    .replace(/\bexport\s+(?=(?:async\s+)?(?:const|function|class)\b)/g, '');
  vm.runInContext(`${runnable}
    globalThis.__moduleExports = {
      createTrainingDemo, taskElapsedSeconds,
      formatTrainingDemoTime: typeof formatTrainingDemoTime === 'function' ? formatTrainingDemoTime : undefined,
    };`, context);
  return {
    ...context.__moduleExports,
    setNow(value) { currentTime = Date.parse(value); },
  };
}

function memoryStorage(actions = []) {
  const stored = new Map([
    [storageKey, JSON.stringify(actions)],
    ['user-session', 'leave this session intact'],
  ]);
  const writes = [];
  return {
    stored, writes,
    storage: {
      getItem: key => stored.get(key) ?? null,
      setItem(key, value) { writes.push(key); stored.set(key, value); },
    },
  };
}

const post = (store, path, body = {}) => store.request(path, { method: 'POST', body: JSON.stringify(body) });

for (const now of [
  '2026-09-13T08:05:07.456+08:00',
  '2026-01-01T00:00:12.345+08:00',
  '2026-09-13T23:59:59.999+08:00',
]) {
  test(`completed synthetic seeds keep their dates, order and exact duration at ${now}`, async () => {
    const demo = loadDemo(now);
    const snapshot = await demo.createTrainingDemo().snapshot();
    assert.equal(snapshot.dataMode, 'synthetic_demo');
    for (const task of snapshot.tasks) {
      if (!task.completedAt) continue;
      const index = Number(task.taskId.slice(-2)) - 1;
      const expectedDate = shanghaiDate(new Date(Date.parse(now) - (index + 1) * dayMs).toISOString());
      assert.equal(task.elapsedSeconds, 32 + index * 5);
      assert.equal(Date.parse(task.completedAt) - Date.parse(task.startedAt), task.elapsedSeconds * 1000);
      assert.equal(shanghaiDate(task.startedAt), expectedDate);
      assert.equal(shanghaiDate(task.completedAt), expectedDate);
      for (const timestamp of [task.startedAt, task.completedAt]) {
        assert.ok(shanghaiTime(timestamp) >= minimumTime, timestamp);
        assert.match(timestamp, /T2[0-3]:\d{2}:\d{2}\+08:00$/);
      }
      const assessment = snapshot.assessments.find(item => item.taskId === task.taskId);
      assert.equal(assessment.evidenceTime, task.completedAt);
      const archive = snapshot.archives.find(item => item.taskId === task.taskId);
      if (archive) assert.equal(archive.createdAt, task.completedAt);
    }
    const completions = snapshot.tasks.filter(task => task.traineeId === 'DEMO-OFFICER-017' && task.completedAt);
    assert.equal(completions.length, 5);
    for (let index = 1; index < completions.length; index++) {
      assert.ok(Date.parse(completions[index - 1].completedAt) > Date.parse(completions[index].completedAt));
    }
  });
}

test('synthetic display formatting is second-precision, date-preserving, ordered and idempotent', () => {
  const demo = loadDemo();
  assert.equal(typeof demo.formatTrainingDemoTime, 'function');
  const inputs = [
    '2026-09-13T00:00:00.123+08:00',
    '2026-09-13T08:05:07.456+08:00',
    '2026-09-13T20:13:49.999+08:00',
    '2026-09-13T20:13:50.000+08:00',
    '2026-09-13T21:14:51.456+08:00',
    '2026-09-13T23:59:59.999+08:00',
  ];
  const displays = inputs.map(input => demo.formatTrainingDemoTime(input));
  for (let index = 0; index < displays.length; index++) {
    assert.match(displays[index], /^2026-09-13 2[0-3]:\d{2}:\d{2}$/);
    assert.ok(displays[index].slice(11) >= minimumTime);
    if (index > 0) assert.ok(displays[index] >= displays[index - 1]);
    const iso = `${displays[index].replace(' ', 'T')}+08:00`;
    assert.equal(demo.formatTrainingDemoTime(iso), displays[index]);
  }
  assert.equal(displays.at(-1), '2026-09-13 23:59:59');
  assert.equal(demo.formatTrainingDemoTime('2026-09-12T16:00:00.123Z'), '2026-09-13 20:13:50');
  assert.equal(demo.formatTrainingDemoTime('2026-09-13T08:05:07.456+08:00', 'time'), minimumTime);
  const date = new Date(inputs[1]);
  assert.equal(demo.formatTrainingDemoTime(date), '2026-09-13 20:13:50');
  assert.equal(date.toISOString(), new Date(inputs[1]).toISOString());
  assert.equal(demo.formatTrainingDemoTime('invalid timestamp'), 'invalid timestamp');
});

test('active seed and new actions retain precise wall-clock timestamps for elapsed timers', async () => {
  const now = '2026-09-13T08:05:07.456+08:00';
  const demo = loadDemo(now);
  const memory = memoryStorage();
  const store = demo.createTrainingDemo(memory.storage);
  const snapshot = await store.snapshot();
  for (const task of snapshot.tasks.filter(item => item.status === '训练中')) {
    assert.equal(task.startedAt, new Date(Date.parse(now) - 42000).toISOString());
    assert.equal(task.completedAt, null);
    assert.equal(task.elapsedSeconds, null);
    assert.equal(demo.taskElapsedSeconds(task), 42);
  }
  const { task: started } = await post(store, '/training/tasks/TRAIN-DEMO-017-01/start');
  assert.equal(started.startedAt, new Date(now).toISOString());
  assert.equal(demo.taskElapsedSeconds(started), 0);
  const finishedAt = '2026-09-13T08:05:42.789+08:00';
  demo.setNow(finishedAt);
  assert.equal(demo.taskElapsedSeconds(started), 35);
  const { task: completed } = await post(store, '/training/tasks/TRAIN-DEMO-017-01/complete', { elapsedSeconds: 32 });
  assert.equal(completed.startedAt, started.startedAt);
  assert.equal(completed.completedAt, new Date(finishedAt).toISOString());
  assert.equal(completed.elapsedSeconds, 32);
  assert.equal(demo.taskElapsedSeconds(completed), 32);
  assert.deepEqual(JSON.parse(memory.stored.get(storageKey)).map(action => action.time), [
    new Date(now).toISOString(), new Date(finishedAt).toISOString(),
  ]);
  assert.equal(typeof demo.formatTrainingDemoTime, 'function');
  assert.equal(demo.formatTrainingDemoTime(started.startedAt, 'time'), minimumTime);
  assert.equal(demo.taskElapsedSeconds(started), 35);
});

test('new synthetic evidence and archives use evening timestamps without changing task measurements', async () => {
  const demo = loadDemo();
  const store = demo.createTrainingDemo();
  const path = '/training/tasks/TRAIN-DEMO-017-01';
  await post(store, `${path}/start`);
  demo.setNow('2026-09-13T08:06:00.456+08:00');
  const { task } = await post(store, `${path}/complete`, { elapsedSeconds: 47 });
  const { assessment } = await post(store, `${path}/assessment`);
  assert.ok(shanghaiTime(assessment.evidenceTime) >= minimumTime);
  assert.match(assessment.evidenceTime, /T2[0-3]:\d{2}:\d{2}\+08:00$/);
  await post(store, `/training/assessments/${assessment.assessmentId}/review`, {
    decision: 'confirmed', reviewerId: 'DEMO-INSTRUCTOR-01', reason: 'Approved synthetic exercise',
  });
  const snapshot = await store.snapshot();
  const archive = snapshot.archives.find(item => item.taskId === task.taskId);
  assert.ok(shanghaiTime(archive.createdAt) >= minimumTime);
  assert.ok(Date.parse(archive.createdAt) >= Date.parse(assessment.evidenceTime));
  assert.deepEqual(snapshot.tasks.find(item => item.taskId === task.taskId), { ...task, status: '已归档' });
});

test('v1 morning action replay updates synthetic presentation without rewriting the session', async () => {
  const taskId = 'TRAIN-DEMO-017-01';
  const actions = [
    { path: `/training/tasks/${taskId}/start`, body: {}, time: '2026-09-11T08:00:00.125+08:00' },
    { path: `/training/tasks/${taskId}/complete`, body: { elapsedSeconds: 32 }, time: '2026-09-11T08:00:32.375+08:00' },
    { path: `/training/tasks/${taskId}/assessment`, body: {}, time: '2026-09-11T08:00:33.625+08:00' },
    {
      path: `/training/assessments/DEMO-ASSESS-${taskId}/review`,
      body: { decision: 'confirmed', reviewerId: 'DEMO-INSTRUCTOR-01', reason: 'Keep this review' },
      time: '2026-09-11T08:00:40.875+08:00',
    },
    { path: `/training/tasks/${taskId}/retry`, body: {}, time: '2026-09-11T08:01:00.125+08:00' },
    { path: '/training/tasks/TRAIN-DEMO-017-NEW-1/exception', body: { reason: 'Keep this note' }, time: '2026-09-11T08:01:02.125+08:00' },
  ];
  const memory = memoryStorage(actions);
  const originalStorage = [...memory.stored];
  const demo = loadDemo();
  for (let replay = 0; replay < 2; replay++) {
    const snapshot = await demo.createTrainingDemo(memory.storage).snapshot();
    const task = snapshot.tasks.find(item => item.taskId === taskId);
    assert.equal(task.status, '已归档');
    assert.equal(task.startedAt, actions[0].time);
    assert.equal(task.completedAt, actions[1].time);
    assert.equal(task.elapsedSeconds, 32);
    const assessment = snapshot.assessments.find(item => item.taskId === taskId);
    assert.equal(assessment.reviewComment, 'Keep this review');
    const archive = snapshot.archives.find(item => item.taskId === taskId);
    for (const timestamp of [assessment.evidenceTime, archive.createdAt]) {
      assert.equal(shanghaiDate(timestamp), '2026-09-11');
      assert.ok(shanghaiTime(timestamp) >= minimumTime, timestamp);
      assert.match(timestamp, /T2[0-3]:\d{2}:\d{2}\+08:00$/);
    }
    assert.ok(Date.parse(archive.createdAt) >= Date.parse(assessment.evidenceTime));
    assert.equal(snapshot.tasks.find(item => item.taskId === 'TRAIN-DEMO-017-NEW-1').exception.reason, 'Keep this note');
    assert.equal(typeof demo.formatTrainingDemoTime, 'function');
    for (const timestamp of [task.startedAt, task.completedAt]) {
      assert.match(demo.formatTrainingDemoTime(timestamp), /^2026-09-11 2[0-3]:\d{2}:\d{2}$/);
    }
  }
  assert.deepEqual([...memory.stored], originalStorage);
  assert.deepEqual(memory.writes, []);
});
