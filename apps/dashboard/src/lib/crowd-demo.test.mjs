import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const file = new URL('./crowd-demo.ts', import.meta.url);
async function load() {
  const module = new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file, 'utf8')));
  await module.link(() => assert.fail('demo must be isolated from APIs'));
  await module.evaluate();
  return module.namespace;
}

test('demo metrics are internally consistent and explicitly synthetic', async () => {
  const { crowdDemoAt } = await load();
  const sample = crowdDemoAt(60);
  assert.equal(sample.synthetic, true);
  assert.equal(sample.count, 28);
  assert.equal(sample.density, 2.8);
  assert.equal(sample.netIncrease, 9);
  assert.equal(sample.growthPercent, 47);
  assert.equal(sample.dwellSeconds, 206);
});

test('timeline clamps invalid values and never mutates previous samples', async () => {
  const { crowdDemoAt } = await load();
  const first = crowdDemoAt(0);
  crowdDemoAt(60);
  assert.equal(first.count, 19);
  assert.equal(crowdDemoAt(-5).second, 0);
  assert.equal(crowdDemoAt(500).second, 60);
  assert.equal(crowdDemoAt(Number.NaN).second, 0);
  for (let second = 0; second <= 60; second++) {
    const sample = crowdDemoAt(second);
    assert.equal(sample.netIncrease, sample.count - 19);
    assert.ok(sample.count >= 19 && sample.count <= 28);
  }
});

test('scene annotations cover foreground, both sides, middle distance and far crowd', async () => {
  const { crowdDemoBoxes } = await load();
  assert.ok(crowdDemoBoxes.length >= 80, 'the full scene must not be limited to the original 12 central people');
  const visiblePeople = [
    [265, 724], [316, 545], [505, 438], [1061, 796], [1187, 786],
    [1400, 729], [1304, 590], [980, 385], [607, 296], [827, 277],
    [741, 328], [663, 148], [895, 164], [781, 91],
  ];
  for (const [px, py] of visiblePeople) {
    assert.ok(crowdDemoBoxes.some(([x, y, w, h]) =>
      px / 1536 * 100 >= x && px / 1536 * 100 <= x + w &&
      py / 864 * 100 >= y && py / 864 * 100 <= y + h,
    ), `missing person near pixel ${px},${py}`);
  }
});

test('boxes enclose visible bodies and remain inside the source image', async () => {
  const { crowdDemoBoxes } = await load();
  for (const [x, y, w, h] of crowdDemoBoxes) {
    assert.ok([x, y, w, h].every(Number.isFinite));
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0);
    assert.ok(x + w <= 100.000001 && y + h <= 100.000001);
  }
  for (const [left, top, right, bottom] of [
    [722, 538, 766, 720], [779, 580, 817, 726], [1044, 698, 1089, 862],
  ]) {
    assert.ok(crowdDemoBoxes.some(([x, y, w, h]) =>
      x <= left / 1536 * 100 && y <= top / 864 * 100 &&
      x + w >= right / 1536 * 100 && y + h >= bottom / 864 * 100,
    ), `body is clipped at ${left},${top}`);
  }
});

test('expanded gathering region encloses every person box, including the foreground and sides', async () => {
  const { crowdDemoBoxes, crowdDemoRegion } = await load();
  assert.ok(Array.isArray(crowdDemoRegion) && crowdDemoRegion.length >= 4, 'the yellow region must be restored');
  for (const [x, y] of crowdDemoRegion) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, 'region stays within the scene');
  }
  for (const [x, y, w, h] of crowdDemoBoxes) {
    for (const [px, py] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) {
      assert.ok(crowdDemoRegion.every(([ax, ay], index) => {
        const [bx, by] = crowdDemoRegion[(index + 1) % crowdDemoRegion.length];
        return (bx - ax) * (py - ay) - (by - ay) * (px - ax) >= -0.000001;
      }), `person corner ${px},${py} must be inside the convex region`);
    }
  }
});
