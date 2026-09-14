import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function load() {
  const source = fs.readFileSync(new URL('./thermal-frame.ts', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module,
    exports: module.exports,
    Uint8ClampedArray,
  });
  return module.exports;
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${expected}, received ${actual}`);
}

function grayFrame(values) {
  return new Uint8ClampedArray(values.flatMap(gray => [gray, gray, gray, 255]));
}

test('a single black pixel maps to blue with baseline metrics and no edges', () => {
  let processThermalFrame;
  assert.doesNotThrow(() => {
    ({ processThermalFrame } = load());
  }, 'the standalone thermal processor must load without browser dependencies');
  const result = processThermalFrame(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1);

  assert.ok(result.pixels instanceof Uint8ClampedArray);
  assert.deepEqual([...result.pixels], [0, 0, 255, 255]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.metrics)), {
    averageTemperature: 15,
    peakTemperature: 15,
    edgeDensity: 0,
    complexity: 0,
    brightAreaPercent: 0,
  });
});

test('the lookup follows blue-cyan-green-yellow-red segments and weighted luminance', () => {
  const { processThermalFrame } = load();
  const cases = [
    [[0, 0, 0], [0, 0, 255]],
    [[32, 32, 32], [0, 128, 255]],
    [[63, 63, 63], [0, 252, 255]],
    [[64, 64, 64], [0, 255, 254]],
    [[96, 96, 96], [0, 255, 126]],
    [[127, 127, 127], [0, 255, 2]],
    [[128, 128, 128], [2, 255, 0]],
    [[160, 160, 160], [130, 255, 0]],
    [[191, 191, 191], [254, 255, 0]],
    [[192, 192, 192], [255, 252, 0]],
    [[224, 224, 224], [255, 124, 0]],
    [[255, 255, 255], [255, 0, 0]],
    [[255, 0, 0], [0, 255, 206]],
    [[0, 255, 0], [90, 255, 0]],
    [[0, 0, 255], [0, 116, 255]],
    [[0, 1, 0], [0, 4, 255]],
  ];

  for (const [rgb, expected] of cases) {
    const { pixels } = processThermalFrame(new Uint8ClampedArray([...rgb, 255]), 1, 1, false);
    assert.deepEqual([...pixels], [...expected, 255], `source RGB ${rgb}`);
  }
});

test('brightness metrics use unrounded luminance and a strict bright-area threshold', () => {
  const { processThermalFrame } = load();
  const cases = [
    { values: [255, 0, 0, 255], width: 1, height: 1, average: 25.465, peak: 26.96, bright: 0 },
    { values: [0, 255, 0, 255], width: 1, height: 1, average: 35.545, peak: 38.48, bright: 0 },
    { values: [0, 0, 255, 255], width: 1, height: 1, average: 18.99, peak: 19.56, bright: 0 },
    { values: [255, 255, 255, 255], width: 1, height: 1, average: 50, peak: 55, bright: 100 },
    {
      values: [0, 210, 211, 255].flatMap(gray => [gray, gray, gray, 255]),
      width: 4, height: 1, average: 38.19607843137255, peak: 55, bright: 50,
    },
    {
      values: Array.from({ length: 12 }, () => [170, 170, 170, 255]).flat(),
      width: 4, height: 3, average: 38.33333333333333, peak: 41.66666666666667, bright: 0,
    },
    {
      values: Array.from({ length: 9 }, () => [255, 255, 255, 255]).flat(),
      width: 3, height: 3, average: 50, peak: 55, bright: 100,
    },
  ];

  for (const { values, width, height, average, peak, bright } of cases) {
    const { metrics } = processThermalFrame(new Uint8ClampedArray(values), width, height);
    assertClose(metrics.averageTemperature, average);
    assertClose(metrics.peakTemperature, peak);
    assert.equal(metrics.brightAreaPercent, bright);
    assert.equal(metrics.edgeDensity, 0);
    assert.equal(metrics.complexity, 0);
  }
});

test('Sobel metrics use both axes, a strict threshold of 32, and whole-frame edge density', () => {
  const { processThermalFrame } = load();
  for (const right of [0, 4, 8, 9, 23, 24, 255]) {
    const frames = [
      [0, 100, right, 0, 100, right, 0, 100, right],
      [0, 0, 0, 100, 100, 100, right, right, right],
    ];
    for (const values of frames) {
      const { metrics } = processThermalFrame(grayFrame(values), 3, 3);
      // Only the center has a full kernel; its Sobel magnitude is four times the step.
      const averageMagnitude = right > 8 ? right * 4 : 0;
      const density = right > 8 ? 100 / 9 : 0;
      assertClose(metrics.edgeDensity, density);
      assertClose(metrics.complexity, density / 100 * 0.8 + averageMagnitude / 255 * 0.2);
    }
  }
});

test('complexity averages only magnitudes above 32 over the detected edge count', () => {
  const { processThermalFrame } = load();
  const row = [0, 0, 4, 10, 24];
  const input = grayFrame([...row, ...row, ...row]);
  const { metrics } = processThermalFrame(input, 5, 3);

  // Interior magnitudes are 16, 40 and 80: only two edges contribute, averaging 60.
  assertClose(metrics.edgeDensity, 13.333333333333334);
  assertClose(metrics.complexity, 0.15372549019607843);
});

test('dense high-contrast edges clamp complexity to one', () => {
  const { processThermalFrame } = load();
  const values = Array.from({ length: 256 }, (_, index) => index % 4 < 2 ? 0 : 255);
  const { metrics } = processThermalFrame(grayFrame(values), 16, 16);

  assert.equal(metrics.edgeDensity, 76.5625);
  assert.equal(metrics.complexity, 1);
});

test('the optional overlay uses cyan above 32 and stronger cyan only above 95', () => {
  const { processThermalFrame } = load();
  const cases = [
    { right: [8, 8, 8], center: 100, expected: [0, 255, 110, 255] },
    { right: [9, 9, 9], center: 100, expected: [0, 240, 255, 255] },
    { right: [23, 23, 23], center: 200, expected: [0, 250, 255, 255] },
    // This RGB value has luminance 23.75, giving a center magnitude of exactly 95.
    { right: [35, 17, 29], center: 100, expected: [0, 240, 255, 255] },
    { right: [24, 24, 24], center: 100, expected: [80, 255, 255, 255] },
    { right: [255, 255, 255], center: 100, expected: [80, 255, 255, 255] },
    { right: [9, 9, 9], center: 255, expected: [0, 255, 255, 255] },
  ];
  for (const { right, center, expected } of cases) {
    const row = [0, 0, 0, 255, center, center, center, 255, ...right, 255];
    const input = new Uint8ClampedArray([...row, ...row, ...row]);
    const withEdges = processThermalFrame(input, 3, 3);
    const withoutEdges = processThermalFrame(input, 3, 3, false);

    assert.deepEqual([...withEdges.pixels.slice(16, 20)], expected);
    assert.deepEqual(withEdges.metrics, withoutEdges.metrics);
    assert.deepEqual([...withEdges.pixels.slice(0, 16)], [...withoutEdges.pixels.slice(0, 16)]);
    assert.deepEqual([...withEdges.pixels.slice(20)], [...withoutEdges.pixels.slice(20)]);
    const centerColor = processThermalFrame(grayFrame([center]), 1, 1, false).pixels;
    assert.deepEqual([...withoutEdges.pixels.slice(16, 20)], [...centerColor]);
  }
});

test('invalid dimensions throw RangeError before processing or allocating a frame', () => {
  const { processThermalFrame } = load();
  const input = grayFrame([0]);
  const cases = [
    [0, 1], [1, 0], [-1, 1], [1, -1], [-1, -1],
    [1.5, 1], [1, 1.5], [NaN, 1], [1, NaN],
    [Infinity, 1], [1, Infinity], [-Infinity, 1],
    [Number.MAX_SAFE_INTEGER + 1, 1], [1, Number.MAX_SAFE_INTEGER + 1],
    [Number.MAX_SAFE_INTEGER, 2], [Number.MAX_SAFE_INTEGER, 1],
    ['1', 1], [1, undefined], [null, 1],
  ];

  for (const [width, height] of cases) {
    assert.throws(
      () => processThermalFrame(input, width, height),
      { name: 'RangeError', message: /dimensions/i },
      `dimensions ${width} x ${height}`,
    );
  }
});

test('RGBA length must exactly match the dimensions', () => {
  const { processThermalFrame } = load();
  const cases = [
    { length: 0, width: 1, height: 1 },
    { length: 3, width: 1, height: 1 },
    { length: 5, width: 1, height: 1 },
    { length: 8, width: 1, height: 1 },
    { length: 12, width: 2, height: 2 },
    { length: 20, width: 2, height: 2 },
    { length: 4, width: 1_000_000_000, height: 1 },
  ];
  for (const { length, width, height } of cases) {
    assert.throws(
      () => processThermalFrame(new Uint8ClampedArray(length), width, height),
      { name: 'RangeError', message: /length/i },
      `${length} bytes for dimensions ${width} x ${height}`,
    );
  }
});

test('diagonal edges use Euclidean magnitude without processing incomplete border kernels', () => {
  const { processThermalFrame } = load();
  const cases = [
    { corner: 20, edge: false, color: [0, 0, 255, 255] },
    { corner: 23, edge: true, color: [0, 230, 255, 255] },
    { corner: 67, edge: true, color: [0, 230, 255, 255] },
    { corner: 68, edge: true, color: [80, 255, 255, 255] },
  ];
  for (const { corner, edge, color } of cases) {
    const input = grayFrame([0, 0, 0, 0, 0, 0, 0, 0, corner]);
    const { pixels, metrics } = processThermalFrame(input, 3, 3);
    const density = edge ? 100 / 9 : 0;
    assert.deepEqual([...pixels.slice(16, 20)], color);
    assertClose(metrics.edgeDensity, density);
    // The lone corner contributes equally to the two perpendicular Sobel axes.
    const averageMagnitude = edge ? corner * Math.SQRT2 : 0;
    assertClose(metrics.complexity, density / 100 * 0.8 + averageMagnitude / 255 * 0.2);
  }
});

test('frames thinner than a Sobel kernel have finite metrics and no edge overlay', () => {
  const { processThermalFrame } = load();
  for (const [width, height] of [[1, 4], [4, 1], [2, 2], [2, 4], [4, 2]]) {
    const input = grayFrame(Array.from({ length: width * height }, (_, index) => index % 2 * 255));
    const result = processThermalFrame(input, width, height);
    const withoutEdges = processThermalFrame(input, width, height, false);
    assert.deepEqual([...result.pixels], [...withoutEdges.pixels]);
    assertClose(result.metrics.averageTemperature, 32.5);
    assertClose(result.metrics.peakTemperature, 55);
    assert.equal(result.metrics.brightAreaPercent, 50);
    assert.equal(result.metrics.edgeDensity, 0);
    assert.equal(result.metrics.complexity, 0);
  }
});

test('processing is deterministic, preserves alpha and source subviews, and owns its output', () => {
  const { processThermalFrame } = load();
  const backing = new Uint8ClampedArray(44).fill(77);
  const input = backing.subarray(4, 40);
  input.set(grayFrame([0, 100, 255, 0, 100, 255, 0, 100, 255]));
  const alpha = [0, 1, 63, 127, 128, 129, 200, 254, 255];
  alpha.forEach((value, index) => { input[index * 4 + 3] = value; });
  const original = backing.slice();
  const first = processThermalFrame(input, 3, 3);
  const second = processThermalFrame(input, 3, 3, true);
  const withoutEdges = processThermalFrame(input, 3, 3, false);

  assert.deepEqual(backing, original);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['metrics', 'pixels']);
  for (const result of [first, second, withoutEdges]) {
    assert.notEqual(result.pixels.buffer, backing.buffer);
    assert.equal(result.pixels.length, input.length);
    assert.deepEqual([...result.pixels].filter((_, index) => index % 4 === 3), alpha);
  }
  assert.notEqual(first.pixels.buffer, second.pixels.buffer);
  assert.notEqual(first.metrics, second.metrics);

  first.pixels.fill(0);
  first.metrics.peakTemperature = -100;
  assert.deepEqual(processThermalFrame(input, 3, 3), second);
  assert.deepEqual(backing, original);
});
