import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const file = new URL('./xiaoan-motion.ts', import.meta.url);
const module = new vm.SourceTextModule(
  stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' }),
  { context: vm.createContext({}) },
);
await module.link(() => assert.fail('Motion math must not depend on UI or networks'));
await module.evaluate();
const { sampleMotion, smoothValue, gazeFromPointer, nextStreamStep } = module.namespace;

test('gaze is bounded and follows pointer direction', () => {
  const left = gazeFromPointer(-1000, 300, 500, 300);
  const right = gazeFromPointer(2000, 300, 500, 300);
  assert.ok(left.x < 0 && right.x > 0);
  assert.ok(left.x >= -1 && right.x <= 1);
  assert.equal(gazeFromPointer(500, 300, 500, 300).x, 0);
});

test('eyes blink without collapsing the head or body', () => {
  const samples = Array.from({ length: 120 }, (_, i) => sampleMotion(i * 50, 'idle', 0, { x: 0, y: 0 }));
  assert.ok(samples.some(pose => pose.blink < .15));
  assert.ok(samples.some(pose => pose.blink > .9));
  assert.ok(samples.every(pose => pose.breath > .99 && pose.breath < 1.02));
});

test('gestures animate separate joints and talking animates the mouth', () => {
  const poses = Array.from({ length: 20 }, (_, i) => sampleMotion(i * 70, 'greeting', i * 70, { x: 0, y: 0 }));
  assert.ok(Math.max(...poses.map(p => p.arm)) - Math.min(...poses.map(p => p.arm)) > 10);
  const answers = Array.from({ length: 20 }, (_, i) => sampleMotion(i * 70, 'answering', i * 70, { x: 0, y: 0 }));
  assert.ok(Math.max(...answers.map(p => p.mouth)) - Math.min(...answers.map(p => p.mouth)) > .3);
});

test('smoothing is frame-rate independent and cannot overshoot', () => {
  const one = smoothValue(0, 1, .032);
  const two = smoothValue(smoothValue(0, 1, .016), 1, .016);
  assert.ok(Math.abs(one - two) < .0001);
  assert.ok(one > 0 && one < 1);
});

test('reduced motion produces a fully static neutral pose', () => {
  const a = sampleMotion(100, 'greeting', 100, { x: 1, y: 1 }, true);
  const b = sampleMotion(8000, 'answering', 230, { x: -1, y: -1 }, true);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.blink, 1);
});

test('stream progress is monotonic, bounded, and ends exactly', () => {
  let cursor = 0;
  while (cursor < 101) {
    const next = nextStreamStep(cursor, 101);
    assert.ok(next > cursor && next <= 101);
    cursor = next;
  }
  assert.equal(nextStreamStep(cursor, 101), 101);
});
