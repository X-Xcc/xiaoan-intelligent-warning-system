const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('esbuild');
const filename = path.resolve(__dirname, '../src/utils/training-api.ts');
const task = { taskId: 'A/B', traineeId: '李警官', status: '训练中', subject: '现场训练',
  teamName: '巡防组', equipment: [], basis: [], standard: { label: '现场标准' } };
const assessment = { assessmentId: 'score', taskId: 'A/B', inputMode: 'sample',
  score: { total: 90, standardization: 90, completionTime: 90, coordination: 90 },
  confidence: 0.86, evidence: [], evidenceTime: '2026-09-06T10:00:00Z', ruleVersion: 'v1',
  humanReviewRequired: true, reviewStatus: 'pending', auditId: 'audit' };

function api(requestApi) {
  assert.ok(fs.existsSync(filename), 'Independent Taro training API must exist.');
  const output = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', output.code)(module, module.exports, (id) => {
    assert.equal(id, '@/utils/api');
    return { requestApi };
  });
  return module.exports;
}

test('snapshot uses current training GET endpoints and preserves mode and notice', async () => {
  const calls = [];
  const result = await api(async (url) => {
    calls.push(url);
    if (url.endsWith('readiness')) return { dataMode: 'desensitized_sample', notice: '样例数据，不代表实测', updatedAt: 'now', ruleVersion: 'v1' };
    return { dataMode: 'desensitized_sample', items: [] };
  }).getTrainingWorkspace();
  assert.deepEqual(calls.sort(), ['/training/archives', '/training/assessments', '/training/readiness', '/training/tasks']);
  assert.equal(result.dataMode, 'desensitized_sample');
  assert.equal(result.readiness.notice, '样例数据，不代表实测');
});

test('malformed or rejected snapshots do not become empty successful data', async () => {
  await assert.rejects(api(async () => ({})).getTrainingWorkspace(), /数据格式/);
  await assert.rejects(api(async () => { throw new Error('训练服务不可用'); }).getTrainingWorkspace(), /训练服务不可用/);
});

test('task mutations use encoded IDs and Taro data, without fetch or body', async () => {
  const calls = [];
  const client = api(async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/assessment') ? { assessment } : { task };
  });
  await client.startTrainingTask('A/B');
  await client.completeTrainingTask('A/B', 30);
  await client.createTrainingAssessment('A/B');
  await client.retryTrainingTask('A/B');
  assert.deepEqual(calls.map((call) => call.url), [
    '/training/tasks/A%2FB/start', '/training/tasks/A%2FB/complete',
    '/training/tasks/A%2FB/assessment', '/training/tasks/A%2FB/retry',
  ]);
  for (const { options } of calls) {
    assert.equal(options.method, 'POST');
    assert.equal(options.body, undefined);
  }
  assert.deepEqual(calls[1].options.data, { elapsedSeconds: 30 });
});

test('mutation failures propagate and missing receipts never report success', async () => {
  await assert.rejects(api(async () => { throw new Error('任务冲突'); }).startTrainingTask('A'), /任务冲突/);
  await assert.rejects(api(async () => ({})).startTrainingTask('A'), /回执/);
  await assert.rejects(api(async () => ({})).createTrainingAssessment('A'), /回执/);
});

test('invalid completion duration is rejected before contacting the service', async () => {
  let calls = 0;
  const client = api(async () => { calls++; return {}; });
  for (const seconds of [0, -1, 1.5, 3601, NaN]) await assert.rejects(client.completeTrainingTask('A', seconds), /1.*3600/);
  assert.equal(calls, 0);
});

test('incomplete task and score receipts fail before reaching the UI', async () => {
  await assert.rejects(api(async () => ({ task: { taskId: 'A/B', traineeId: '李警官', status: '训练中' } })).startTrainingTask('A/B'), /回执/);
  await assert.rejects(api(async () => ({ assessment: { assessmentId: 'score', taskId: 'A/B' } })).createTrainingAssessment('A/B'), /回执/);
  await assert.rejects(api(async () => ({ assessment: { ...assessment, score: { ...assessment.score, total: NaN } } })).createTrainingAssessment('A/B'), /回执/);
});
