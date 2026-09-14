import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);

function load(relativePath) {
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${outputFiles[0].text}\n})`)(require, module, module.exports);
  return module.exports;
}

const model = load('./contact-case-map.ts');
const epsilon = 1e-8;
const samePoint = (a, b) => a.every((value, axis) => Math.abs(value - b[axis]) <= epsilon);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function segmentContacts(a, b, c, d) {
  const onSegment = (point, start, end) =>
    Math.abs(cross(start, end, point)) <= epsilon &&
    point.every((value, axis) =>
      value >= Math.min(start[axis], end[axis]) - epsilon &&
      value <= Math.max(start[axis], end[axis]) + epsilon);
  const endpoints = [a, b, c, d]
    .filter(point => onSegment(point, a, b) && onSegment(point, c, d))
    .filter((point, index, points) => points.findIndex(other => samePoint(point, other)) === index);

  // Two distinct common endpoints identify a collinear overlap, not a single contact.
  if (endpoints.length) return endpoints;
  if (cross(a, b, c) * cross(a, b, d) >= 0 || cross(c, d, a) * cross(c, d, b) >= 0) return [];
  const t = cross(c, d, a) / (cross(c, d, a) - cross(c, d, b));
  return [[a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]];
}

function assertOnlyIntersection(route, comparisonRoute, expected) {
  assert.ok(route.length >= 2, 'The primary polyline must contain a segment');
  assert.ok(comparisonRoute.length >= 2, 'The comparison polyline must contain a segment');
  let found = false;
  for (let i = 1; i < route.length; i++) {
    for (let j = 1; j < comparisonRoute.length; j++) {
      const contacts = segmentContacts(route[i - 1], route[i], comparisonRoute[j - 1], comparisonRoute[j]);
      const pair = `Primary segment ${i - 1}, comparison segment ${j - 1}`;
      assert.ok(contacts.length < 2, `${pair}: collinear overlap ${JSON.stringify(contacts)}`);
      for (const point of contacts) {
        assert.ok(samePoint(point, expected), `${pair}: unexpected intersection ${JSON.stringify(point)}`);
        found = true;
      }
    }
  }
  assert.ok(found, `Missing intersection at ${JSON.stringify(expected)}`);
}

function variant(recordId, pointCount) {
  assert.equal(typeof model.getCaseMapVariant, 'function', 'getCaseMapVariant must be exported');
  return model.getCaseMapVariant(recordId, pointCount);
}

test('geometry check finds interior crossings and rejects additional intersections', () => {
  assertOnlyIntersection([[0, 0], [4, 4]], [[0, 4], [4, 0]], [2, 2]);
  assertOnlyIntersection([[0, 0], [2, 0]], [[2, 0], [4, 0]], [2, 0]);
  assert.throws(() =>
    assertOnlyIntersection([[0, 0], [4, 4]], [[0, 0], [0, 4], [4, 0]], [0, 0]),
  /unexpected intersection/);
  assert.throws(() =>
    assertOnlyIntersection([[0, 0], [2, 0]], [[3, 0], [4, 0]], [2, 0]),
  /Missing intersection/);
  assert.deepEqual(segmentContacts([0, 0], [4, 0], [0, 1], [4, 1]), []);
});

test('geometry check rejects partial, contained, reversed and vertical collinear overlaps', () => {
  for (const [route, comparisonRoute] of [
    [[[0, 0], [6, 0]], [[2, 0], [8, 0]]],
    [[[0, 0], [6, 0]], [[2, 0], [4, 0]]],
    [[[0, 0], [6, 0]], [[6, 0], [0, 0]]],
    [[[0, 0], [0, 6]], [[0, 2], [0, 8]]],
  ]) {
    assert.throws(() => assertOnlyIntersection(route, comparisonRoute, comparisonRoute[0]), /collinear overlap/);
  }
});

test('CR-020 primary and comparison polylines intersect only at the incident point', () => {
  const result = variant('CR-020');
  assertOnlyIntersection(result.route, result.comparisonRoute, [640, 365]);
});

test('CR-019 branches originate at points one, one and four, never the incident point', () => {
  const result = variant('CR-019');
  assert.deepEqual(result.branches.map(branch => branch.points[0]), [
    [440, 230], [440, 230], [720, 505],
  ]);
  for (const branch of result.branches) {
    assert.ok(branch.points.length >= 2, 'Each exposed branch must contain a segment');
    assert.equal(samePoint(branch.points[0], [640, 365]), false);
    assert.notDeepEqual(branch.points.at(-1), branch.points[0]);
  }
  assert.deepEqual(result.branches[2].points.at(-1), [330, 595]);
  assert.deepEqual(result.comparisonRoute, []);
});

for (const recordId of ['CR-019', 'CR-020']) {
  test(`${recordId} exposes no geometry for invalid or sub-one point counts`, () => {
    for (const count of [NaN, Infinity, -Infinity, -1, 0, 0.5]) {
      const result = variant(recordId, count);
      assert.deepEqual(result.route, [], `Primary route for pointCount=${count}`);
      assert.deepEqual(result.branches, [], `Branches for pointCount=${count}`);
      assert.deepEqual(result.comparisonRoute, [], `Comparison route for pointCount=${count}`);
    }
  });
}

for (const [count, lastPoint, origins] of [
  [1, [440, 230], [[440, 230], [440, 230]]],
  [2, [560, 250], [[440, 230], [440, 230]]],
  [3, [640, 365], [[440, 230], [440, 230]]],
  [3.9, [640, 365], [[440, 230], [440, 230]]],
  [4, [720, 505], [[440, 230], [440, 230], [720, 505]]],
]) {
  test(`CR-019 exposes only available branch origins with pointCount=${count}`, () => {
    const result = variant('CR-019', count);
    assert.deepEqual(result.route.at(-1), lastPoint);
    assert.deepEqual(result.branches.map(branch => branch.points[0]), origins);
    assert.deepEqual(result.comparisonRoute, []);
  });
}

for (const [count, lastPoint, hasComparison] of [
  [1, [440, 230], false],
  [2, [560, 250], false],
  [2.9, [560, 250], false],
  [3, [640, 365], true],
  [4, [720, 505], true],
]) {
  test(`CR-020 exposes comparison geometry only when the incident point exists, pointCount=${count}`, () => {
    const result = variant('CR-020', count);
    assert.deepEqual(result.route.at(-1), lastPoint);
    assert.deepEqual(result.branches, []);
    if (hasComparison) {
      assertOnlyIntersection(result.route, result.comparisonRoute, [640, 365]);
    } else {
      assert.deepEqual(result.comparisonRoute, []);
    }
  });
}
