import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const source = new URL('./xiaoan-assistant.ts', import.meta.url);
const context = vm.createContext({});
const module = new vm.SourceTextModule(
  stripTypeScriptTypes(fs.readFileSync(source, 'utf8'), { mode: 'transform' }),
  { context },
);
await module.link(() => assert.fail('Assistant helpers must remain local and side-effect free'));
await module.evaluate();
const { ASSISTANT_SIZE, clampPosition, parsePosition, demoReply, snapPosition } = module.namespace;
const plain = value => JSON.parse(JSON.stringify(value));

test('positions are clamped to the visible viewport', () => {
  assert.deepEqual(plain(clampPosition({ x: -40, y: 1200 }, 390, 844)),
    { x: 12, y: 540 });
  assert.deepEqual(plain(clampPosition({ x: 9999, y: -40 }, 1440, 900)),
    { x: 1300, y: 76 });
});

test('compact assistant leaves the bottom action area clear after dragging or restoring', () => {
  assert.deepEqual(plain(ASSISTANT_SIZE), { width: 128, height: 208 });
  for (const [width, height] of [[390, 844], [1440, 900], [844, 390]]) {
    for (const position of [
      clampPosition({ x: width, y: height }, width, height),
      snapPosition({ x: width, y: height }, width, height),
      parsePosition(JSON.stringify({ x: width - 232, y: height - 360 }), width, height),
    ]) {
      assert.ok(position.y + ASSISTANT_SIZE.height <= height - 96);
    }
  }
});

test('tiny viewports still return finite nonnegative positions', () => {
  const position = clampPosition({ x: NaN, y: Infinity }, 100, 120);
  assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
  assert.ok(position.x >= 0 && position.y >= 0);
});

test('stored state is validated and clamped instead of hiding the pet', () => {
  for (const raw of ['broken json', 'null', '[]', '{"x":"90","y":80}']) {
    assert.equal(parsePosition(raw, 390, 844), null);
  }
  assert.deepEqual(plain(parsePosition('{"x":9000,"y":8000}', 390, 844)),
    { x: 250, y: 540 });
});

test('drag release snaps to the closest edge', () => {
  assert.equal(snapPosition({ x: 100, y: 200 }, 1440, 900).x, 12);
  assert.equal(snapPosition({ x: 1100, y: 200 }, 1440, 900).x, 1300);
});

test('all preset replies are explicitly synthetic and cannot execute actions', () => {
  for (const query of ['今日概览', '今日勤务预案', '今日训练方案', '请派警', '<script>alert(1)</script>']) {
    const reply = demoReply(query);
    assert.equal(reply.demo, true);
    assert.ok(reply.title.length > 0);
    assert.ok(reply.lines.length > 0);
    assert.ok(reply.lines.every(line => typeof line === 'string'));
    assert.equal('action' in reply, false);
    assert.equal('request' in reply, false);
    assert.ok(['overview', 'navigation', 'brief', 'dutyPlan', 'training', 'chat'].includes(reply.topic));
  }
});

test('keyword classification is bounded and does not echo unsafe input', () => {
  assert.match(demoReply('今日概览').title, /今日/);
  assert.match(demoReply('今日勤务预案').title, /预案/);
  assert.match(demoReply('今日训练方案').title, /训练/);
  assert.ok(!JSON.stringify(demoReply('<img src=x onerror=alert(1)>')).includes('<img'));
});

test('training reply provides one paragraph and the three requested course links', () => {
  const reply = demoReply('今日训练方案');
  assert.equal(reply.lines.length, 1);
  assert.match(reply.lines[0], /勤务态势/);
  assert.equal(reply.lines[0], '按勤务态势的推荐，今天先练下面三项。具体要求听教官安排。');
  assert.deepEqual(plain(reply.trainingLinks), [
    { label: '单警装备快速取用', taskId: 'TRAIN-READINESS-001' },
    { label: '弱光队形转换', taskId: 'TRAIN-READINESS-002' },
    { label: '现场警戒与人员疏散', taskId: 'TRAIN-READINESS-003' },
  ]);
});

test('training follow-ups retain course links without leaking them to other topics', () => {
  const training = demoReply('今日训练方案');
  assert.equal(training.trainingLinks?.length, 3);
  for (const prompt of ['展开说说', '再简短一点']) {
    assert.deepEqual(plain(demoReply(prompt, training).trainingLinks), plain(training.trainingLinks));
  }
  for (const prompt of ['今日概览', '今日勤务预案', '请派警']) {
    assert.equal(demoReply(prompt, training).trainingLinks, undefined);
  }
});

test('follow-up replies preserve the conversation topic without claiming business access', () => {
  const training = demoReply('今日训练方案');
  const followup = demoReply('再简短一点', training);
  assert.equal(followup.topic, 'training');
  assert.match(followup.lines[0], /训练/);
  assert.equal(followup.lines.length, 1);
  assert.match(demoReply('帮我派警').lines.join(''), /不会/);
  assert.ok(!JSON.stringify(demoReply('今日概览')).includes('12 项'));
});
