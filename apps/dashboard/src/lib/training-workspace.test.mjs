import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const plain = value => JSON.parse(JSON.stringify(value));
const subjects = ['单警装备快速取用', '弱光执法场景战术协同', '防爆先期处置'];
async function load(name) {
  const module = new vm.SourceTextModule(stripTypeScriptTypes(
    fs.readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8'), { mode: 'transform' }), {
    context: vm.createContext({ structuredClone, setTimeout, clearTimeout }),
  });
  await module.link(() => assert.fail('Training data must not depend on runtime UI modules'));
  await module.evaluate();
  return module.namespace;
}

test('the first three demo tasks use the requested subjects for every officer', async () => {
  const { createTrainingDemo } = await load('training-demo');
  const snapshot = await createTrainingDemo().snapshot();
  for (const officer of ['017', '018', '019']) {
    const tasks = [1, 2, 3].map(index => snapshot.tasks.find(task => task.taskId === `TRAIN-DEMO-${officer}-0${index}`));
    assert.deepEqual(plain(tasks.map(task => task.subject)), subjects);
  }
});

test('workspace task and creation filtering share the same subjects and preserve archives', async () => {
  const { createTrainingDemo, isTrainingWorkspaceSubject } = await load('training-demo');
  assert.equal(typeof isTrainingWorkspaceSubject, 'function');
  const demo = createTrainingDemo();
  const snapshot = await demo.snapshot();
  const catalog = await demo.request('/training/subjects');
  assert.deepEqual(plain(catalog.items.filter(isTrainingWorkspaceSubject).map(item => item.subject)), subjects);
  assert.equal(snapshot.tasks.filter(isTrainingWorkspaceSubject).length, 9);
  assert.equal(snapshot.archives.length, 6);
  assert.ok(snapshot.archives.every(archive => snapshot.tasks.some(task => task.taskId === archive.taskId)));
});

test('saved demo actions replay against the renamed subjects without losing prior work', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const { createTrainingDemo } = await load('training-demo');
  const demo = createTrainingDemo(storage);
  await demo.request('/training/tasks/TRAIN-DEMO-017-02/start', { method: 'POST' });
  const reloaded = await createTrainingDemo(storage).snapshot();
  const task = reloaded.tasks.find(task => task.taskId === 'TRAIN-DEMO-017-02');
  assert.equal(task.subject, subjects[1]);
  assert.equal(task.status, '训练中');
});

test('equipment recommendations contain exactly the two requested exercises', async () => {
  const { getTrainingRecommendations } = await load('training-recommendations');
  const result = getTrainingRecommendations({ subject: subjects[0] });
  assert.deepEqual(plain(result.items.map(item => item.title)), ['催泪不同场景使用训练', '甩棍快速取用与战术动作']);
  assert.equal(result.items.reduce((total, item) => total + item.minutes, 0), 9);
  assert.match(result.items[0].goal, /催泪/);
  assert.match(result.items[1].goal, /警棍|甩棍/);
  assert.ok(result.items.every(item => item.goal && item.practice && item.check));
  assert.doesNotMatch(result.items.map(item => [item.goal, item.practice, item.check].join(' ')).join(' '), /对讲机|记录仪/);
  assert.match(result.safety, /模拟|惰性/);
});

test('renamed subjects retain their specific recommendations instead of generic fallbacks', async () => {
  const { getTrainingRecommendations } = await load('training-recommendations');
  assert.equal(getTrainingRecommendations({ subject: subjects[1] }).items[0].id, 'light-check');
  assert.equal(getTrainingRecommendations({ subject: subjects[2] }).items[0].id, 'cordon-layout');
});

test('training execution drops timer and exception UI and submits automatically measured time', () => {
  const source = fs.readFileSync(new URL('../pages/OfficerTrainingPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ot-timer-tool|训练计时|录入现场计时|登记异常|登记训练异常|exceptionOpen/);
  assert.doesNotMatch(source, /manualTime|elapsedInput|validElapsed/);
  assert.match(source, /elapsedSeconds:\s*Math\.max\(1,\s*taskElapsedSeconds\(selected\)\)/);
  assert.match(source, /stage === 'run'[\s\S]*?finish\(\)/);
});
