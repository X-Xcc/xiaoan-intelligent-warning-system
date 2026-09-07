import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, root), 'utf8');
test('main application retains original command workbench, not standalone replacement', () => {
  const shell = source('apps/dashboard/src/pages/DashboardApp.tsx');
  assert.doesNotMatch(shell, /from '\.\/CommandOperationsPage'/);
  assert.doesNotMatch(shell, /get\('surface'\)/);
  assert.match(source('apps/dashboard/src/pages/PoliceDomainPages.tsx'), /export function CommandOperationsPage/);
});
test('document-backed provider exists at stable application root', () => {
  assert.match(source('apps/dashboard/src/main.tsx'), /<XiaoanVoiceProvider>/);
});
test('original duty screen uses shared Yaoyao instead of OS default speech', () => {
  const duty = source('apps/dashboard/src/pages/DutySituationPage.tsx');
  assert.doesNotMatch(duty, /SpeechSynthesisUtterance/);
  assert.match(duty, /speak\('portrait-ready'/);
});
test('all-three pass requires exact tasks, confirmed assessments and passing archives', () => {
  const path = new URL('apps/dashboard/src/lib/xiaoan-voice-rules.ts', root);
  assert.ok(fs.existsSync(path), 'document voice rules must exist');
  const built = buildSync({ entryPoints: [path.pathname.replace(/^\/([A-Z]:)/, '$1')],
    bundle: true, write: false, platform: 'node', format: 'cjs' });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports);
  const { trainingPassKey, DOCUMENT_VOICE_CUES } = mod.exports;
  assert.deepEqual(DOCUMENT_VOICE_CUES, { 'portrait-ready': '画像已生成', 'training-passed': '全体科目达标' });
  const ids = ['TRAIN-READINESS-001', 'TRAIN-READINESS-002', 'TRAIN-READINESS-003'];
  const snapshot = {
    tasks: ids.map(taskId => ({ taskId, status: '已归档' })),
    assessments: ids.map(taskId => ({ taskId, assessmentId: taskId, reviewStatus: 'confirmed' })),
    archives: ids.map(taskId => ({ taskId, result: '合格', recordId: taskId })),
  };
  assert.ok(trainingPassKey(snapshot));
  assert.equal(trainingPassKey({ ...snapshot, tasks: snapshot.tasks.slice(0, 1) }), null);
  assert.equal(trainingPassKey({ ...snapshot, assessments: [] }), null);
  assert.equal(trainingPassKey({ ...snapshot, archives: [] }), null);
  for (const part of ['tasks', 'assessments', 'archives']) {
    const next = structuredClone(snapshot);
    Object.assign(next[part][1], { status: '待复训', reviewStatus: 'pending', result: '待补训' });
    assert.equal(trainingPassKey(next), null);
  }
});
