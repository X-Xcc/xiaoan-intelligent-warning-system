import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformSync } from 'esbuild';

async function load() {
  const source = fs.readFileSync(new URL('../apps/dashboard/src/lib/command-voice.ts', import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
function snapshot(version = 1) {
  return { event: { id: 'a', status: '已提交' }, command: { version, evidenceIndex: [] } };
}
test('initial loads, event changes and repeated versions do not announce historical actions', async () => {
  const { voiceChanges } = await load();
  const a = snapshot();
  assert.deepEqual(voiceChanges(null, a), []);
  assert.deepEqual(voiceChanges(a, a), []);
  assert.deepEqual(voiceChanges(a, { ...snapshot(2), event: { id: 'b', status: '已派单' } }), []);
});
test('dispatch requires actual dispatch, not route preview or confirmation', async () => {
  const { voiceChanges } = await load();
  const a = snapshot();
  const b = snapshot(2);
  b.command.dispatch = { reviewStatus: 'confirmed' };
  assert.deepEqual(voiceChanges(a, b), []);
  b.command.dispatch.dispatchedAt = '2026-09-07T00:00:00Z';
  assert.deepEqual(voiceChanges(a, b), ['dispatch-sent']);
});
test('verification, evidence and handover use distinct factual cues', async () => {
  const { voiceChanges } = await load();
  const a = snapshot();
  const b = snapshot(2);
  b.command.verification = { verificationId: 'v', resultStatus: 'pending' };
  b.command.evidenceIndex = [{ evidenceId: 'e' }];
  b.command.handover = { handoverId: 'h', version: 1, status: 'submitted' };
  assert.deepEqual(voiceChanges(a, b), ['verification-ready', 'evidence-registered', 'handover-submitted']);
  const c = structuredClone(b);
  c.command.version = 3;
  c.command.handover.status = 'accepted';
  assert.deepEqual(voiceChanges(b, c), ['handover-accepted']);
  c.command.handover.status = 'rejected';
  assert.deepEqual(voiceChanges(b, c), []);
});
test('stage playback leaves inventory silent; every cue references an existing Yaoyao WAV', async () => {
  const { stageVoice, voiceTexts } = await load();
  assert.equal(stageVoice('b4'), null);
  assert.equal(stageVoice('b1'), 'new-incident');
  for (const id of Object.keys(voiceTexts)) {
    const file = fs.readFileSync(new URL(`../apps/dashboard/public/command/voice-preview/yaoyao/${id}.wav`, import.meta.url));
    assert.equal(file.toString('ascii', 0, 4), 'RIFF');
    assert.equal(file.toString('ascii', 8, 12), 'WAVE');
    assert.ok(file.length > 1000);
  }
});
