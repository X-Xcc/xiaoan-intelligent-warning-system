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
const { clampPosition, parsePosition, demoReply, snapPosition } = module.namespace;
const plain = value => JSON.parse(JSON.stringify(value));

test('positions are clamped to the visible viewport', () => {
  assert.deepEqual(plain(clampPosition({ x: -40, y: 1200 }, 390, 844)),
    { x: 12, y: 594 });
  assert.deepEqual(plain(clampPosition({ x: 9999, y: -40 }, 1440, 900)),
    { x: 1272, y: 76 });
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
    { x: 222, y: 594 });
});

test('drag release snaps to the closest edge', () => {
  assert.equal(snapPosition({ x: 100, y: 200 }, 1440, 900).x, 12);
  assert.equal(snapPosition({ x: 1100, y: 200 }, 1440, 900).x, 1272);
});

test('all preset replies are explicitly synthetic and cannot execute actions', () => {
  for (const query of ['今日概览', '工作台导航', '生成值守简报', '请派警', '<script>alert(1)</script>']) {
    const reply = demoReply(query);
    assert.equal(reply.demo, true);
    assert.ok(reply.title.length > 0);
    assert.ok(reply.lines.length > 0);
    assert.ok(reply.lines.every(line => typeof line === 'string'));
    assert.equal('action' in reply, false);
    assert.equal('request' in reply, false);
    assert.ok(['overview', 'navigation', 'brief', 'chat'].includes(reply.topic));
  }
});

test('keyword classification is bounded and does not echo unsafe input', () => {
  assert.match(demoReply('今日概览').title, /今日/);
  assert.match(demoReply('生成值守简报').title, /简报/);
  assert.match(demoReply('工作台导航').title, /导航/);
  assert.ok(!JSON.stringify(demoReply('<img src=x onerror=alert(1)>')).includes('<img'));
});

test('follow-up replies preserve the conversation topic without claiming business access', () => {
  const brief = demoReply('生成值守简报');
  const followup = demoReply('再简短一点', brief);
  assert.equal(followup.topic, 'brief');
  assert.match(followup.lines[0], /简报/);
  assert.equal(followup.lines.length, 1);
  assert.match(demoReply('帮我派警').lines.join(''), /不会/);
  assert.ok(!JSON.stringify(demoReply('今日概览')).includes('12 项'));
});
