import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { transformSync } from 'esbuild';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const clientPath = 'apps/dashboard/src/lib/training-api.ts';
async function moduleFrom(path) {
  const { code } = transformSync(read(path), {
    loader: 'ts', format: 'esm',
    define: { 'import.meta.env.VITE_API_BASE_URL': '"http://test.invalid/api"', 'import.meta.env.DEV': 'false' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('A1 has its own route and does not replace individual training', async () => {
  const { routePath, viewForPath } = await moduleFrom('apps/dashboard/src/lib/presentation.ts');
  assert.equal(routePath('duty-situation'), '/duty-situation');
  assert.equal(viewForPath('/duty-situation'), 'duty-situation');
  assert.equal(viewForPath('/duty-plan'), 'duty-plan');
});

test('training client exists as a separate domain module', () => {
  assert.ok(fs.existsSync(new URL(`../${clientPath}`, import.meta.url)));
});

test('officer selection cannot show or inherit another officers task', async () => {
  const { officerTasks, selectOfficerTask } = await moduleFrom(clientPath);
  const tasks = [
    { taskId: 'one', traineeId: '017', status: '已归档' },
    { taskId: 'two', traineeId: '018', status: '训练中' },
    { taskId: 'three', traineeId: '017', status: '待训练' },
  ];
  assert.deepEqual(officerTasks(tasks, '017').map((item) => item.taskId), ['three', 'one']);
  assert.equal(selectOfficerTask(tasks, '017', 'two')?.taskId, 'three');
  assert.equal(selectOfficerTask(tasks, '017', 'one')?.taskId, 'one');
  assert.equal(selectOfficerTask([], '017', 'one'), undefined);
});

test('workflow position and elapsed time derive from persisted task state', async () => {
  const { taskStage, taskElapsedSeconds } = await moduleFrom(clientPath);
  assert.equal(taskStage('待训练'), 'prepare');
  assert.equal(taskStage('训练中'), 'run');
  assert.equal(taskStage('待复核'), 'assessment');
  assert.equal(taskStage('待复训'), 'assessment');
  assert.equal(taskStage('已归档'), 'archive');
  assert.equal(taskElapsedSeconds({ startedAt: '2026-09-06T00:00:00Z' }, Date.parse('2026-09-06T00:00:28Z')), 28);
  assert.equal(taskElapsedSeconds({ elapsedSeconds: 12, startedAt: '2026-09-06T00:00:00Z' }), 12);
  assert.equal(taskElapsedSeconds({ startedAt: 'invalid' }), 0);
  assert.equal(taskElapsedSeconds({ startedAt: '2026-09-06T00:00:00Z' }, Date.parse('2026-09-07T00:00:00Z')), 3600);
});

test('API failures reject rather than become successful actions', async () => {
  const { trainingRequest } = await moduleFrom(clientPath);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ detail: '必须先开始训练' }) });
    await assert.rejects(trainingRequest('/training/tasks/one/complete', { method: 'POST' }), /必须先开始训练/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ dataMode: 'desensitized_sample', items: [] }) });
    assert.deepEqual((await trainingRequest('/training/tasks')).items, []);
  } finally { globalThis.fetch = original; }
});

test('snapshot retrieval reads assessments without creating them', async () => {
  const { getTrainingSnapshot } = await moduleFrom(clientPath);
  const original = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init.method ?? 'GET' });
      return { ok: true, json: async () => ({ dataMode: 'desensitized_sample', items: [] }) };
    };
    const snapshot = await getTrainingSnapshot();
    assert.deepEqual(snapshot.tasks, []);
    assert.deepEqual(snapshot.assessments, []);
    assert.deepEqual(snapshot.archives, []);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.method === 'GET'));
    assert.ok(calls.some((call) => call.url.endsWith('/training/assessments')));
  } finally { globalThis.fetch = original; }
});

test('course task status is retrieved read-only without assessments', async () => {
  const { getTrainingTasks } = await moduleFrom(clientPath);
  assert.equal(typeof getTrainingTasks, 'function');
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.ok(url.endsWith('/training/tasks'));
      assert.equal(init.method ?? 'GET', 'GET');
      return { ok: true, json: async () => ({ dataMode: 'desensitized_sample', items: [{ taskId: 'one', status: '已归档' }] }) };
    };
    assert.equal((await getTrainingTasks()).items[0].status, '已归档');
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: null }) });
    await assert.rejects(getTrainingTasks(), /数据/);
  } finally { globalThis.fetch = original; }
});
