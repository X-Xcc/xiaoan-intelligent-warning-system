import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';

async function load() {
  const source = fs.readFileSync(new URL('./gait-analysis.ts', import.meta.url), 'utf8');
  const output = stripTypeScriptTypes(source, { mode: 'transform' });
  return import(`data:text/javascript;base64,${Buffer.from(`${output}\n`).toString('base64')}`);
}

test('gait pose keeps the reference body centered and exposes mirrored lower limbs', async () => {
  const { computeGaitPose } = await load();
  const pose = computeGaitPose(0);

  assert.equal(pose.joints.shoulder.x, 400);
  assert.equal(pose.joints.hipL.x, 382);
  assert.equal(pose.joints.hipR.x, 418);
  assert.equal(pose.joints.kneeL.x, 382);
  assert.equal(pose.joints.kneeR.x, 418);
  assert.ok(Math.abs(pose.angles.hipL) < 1e-12);
  assert.ok(Math.abs(pose.angles.hipR) < 1e-12);
  assert.ok(pose.joints.ankleL.y > pose.joints.kneeL.y);
  assert.ok(pose.joints.ankleR.y > pose.joints.kneeR.y);
});

test('gait phase advances with speed and wraps at one full cycle', async () => {
  const { advanceGaitPhase } = await load();
  const fullCycleMs = 1000;

  assert.equal(advanceGaitPhase(0, fullCycleMs, 1), 0);
  assert.equal(advanceGaitPhase(0, 250, 2), Math.PI);
  assert.equal(advanceGaitPhase(Math.PI * 1.5, 500, 1), Math.PI / 2);
});
