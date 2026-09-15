import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Run directly with --sharp-module <path>, or use SHARP_MODULE with node --test.
const { values } = parseArgs({ options: { 'sharp-module': { type: 'string' } } });
const sharpModule = values['sharp-module'] || process.env.SHARP_MODULE || 'sharp';
const require = createRequire(import.meta.url);
const sharp = require(sharpModule.startsWith('.') ? path.resolve(sharpModule) : sharpModule);
const generator = fileURLToPath(new URL('../generate_contact_case_basemap.mjs', import.meta.url));
const artifact = new URL(
  '../../apps/dashboard/public/contact-review-assets/night-market-case-basemap.webp',
  import.meta.url,
);
// Independent literals from the approved overlay, not imported generator data.
const route = [
  [440, 230], [525, 215], [560, 250], [550, 340], [640, 365], [680, 350],
  [695, 438], [720, 505], [795, 535], [830, 590], [890, 595],
];

function generate(output, extraArgs = []) {
  return execFileSync(process.execPath, [
    generator, '--sharp-module', sharpModule, '--output', output, ...extraArgs,
  ], { encoding: 'utf8' });
}

async function render() {
  const output = path.join(tmpdir(), `contact-case-basemap-${randomUUID()}.webp`);
  try {
    const report = JSON.parse(generate(output));
    return { bytes: await readFile(output), report };
  } finally {
    await unlink(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

let rendered;
const fixture = () => rendered ??= render();

test('CLI generates a detailed, opaque WebP at twice the approved B canvas size', async () => {
  const { bytes } = await fixture();
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 2400);
  assert.equal(metadata.height, 1560);
  assert.equal(metadata.hasAlpha, false);
  assert.ok(bytes.length > 100_000, `Expected detailed raster, got ${bytes.length} bytes`);
  const stats = await sharp(bytes).stats();
  assert.ok(stats.channels.every(channel => channel.stdev > 10), 'Raster must not be blank');
});

test('physical walkway centerlines preserve every exact B bend without case overlays', async () => {
  const { buildBasemapSvg } = await import('../generate_contact_case_basemap.mjs');
  const svg = buildBasemapSvg();
  assert.match(svg, /viewBox="0 0 1200 780"/);
  for (const vertices of [
    '440,230 525,215 560,250',
    '560,250 550,340 640,365 680,350',
    '680,350 695,438 720,505',
    '720,505 795,535 830,590 890,595',
  ]) {
    assert.ok(svg.includes(`points="${vertices}" fill="none" stroke="#fffdf8" stroke-width="11"`),
      `Missing physical pavement: ${vertices}`);
  }
  assert.doesNotMatch(svg, /#(?:367ee0|21856d|cf4847|a16c17)|CAM-\d|>\s*[1-5]\s*<\/text>/i);
  assert.doesNotMatch(svg, /\u7b2c\u4e00\u6b21\u63a5\u89e6\u5730\u70b9|\u6848\u53d1\u5730\u70b9|\u9500\u8d43\u70b9/);
  for (const label of [
    '\u7d2b\u8346\u5927\u9053', '\u6ee8\u6cb3\u8def', '\u5357\u73af\u8def',
    '\u5b66\u9662\u8def', '\u591c\u5e02\u6b65\u884c\u8857',
    '\u6ee8\u6cb3\u7eff\u5730', '\u516c\u5171\u505c\u8f66\u573a',
  ]) assert.ok(svg.includes(`>${label}</text>`), `Missing Chinese label: ${label}`);
});

test('decoded raster leaves all five anchors and every segment on unobstructed pavement', async () => {
  const { bytes } = await fixture();
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const expected = [255, 253, 248];
  let samples = 0;
  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1];
    const [bx, by] = route[i];
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let step = 0; step <= steps; step++) {
      const x = ax + (bx - ax) * step / steps;
      const y = ay + (by - ay) * step / steps;
      const offset = (Math.round(y * 2) * info.width + Math.round(x * 2)) * info.channels;
      const rgb = [...data.subarray(offset, offset + 3)];
      assert.ok(rgb.every((channel, index) => Math.abs(channel - expected[index]) <= 9),
        `Pavement covered at logical (${x.toFixed(2)}, ${y.toFixed(2)}): ${rgb}`);
      samples++;
    }
  }
  assert.ok(samples > 700);
});

test('decoded composition retains the left river, green park and varied building detail', async () => {
  const { bytes } = await fixture();
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => {
    const offset = (y * 2 * info.width + x * 2) * info.channels;
    return [...data.subarray(offset, offset + 3)];
  };
  const river = pixel(65, 320);
  assert.ok(river[2] - river[0] > 35 && river[1] - river[0] > 25, `River: ${river}`);
  const park = pixel(350, 520);
  assert.ok(park[1] - park[0] > 12 && park[1] - park[2] > 12, `Park: ${park}`);
  const colors = new Set();
  for (let i = 0; i < data.length; i += info.channels) colors.add(data.readUIntBE(i, 3));
  assert.ok(colors.size > 4000, `Expected varied raster detail, got ${colors.size} colors`);
});

test('repeated CLI generation is byte-identical to the checked-in raster', async () => {
  const first = await fixture();
  const second = await render();
  assert.equal(first.report.sha256, second.report.sha256);
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(await readFile(artifact), first.bytes,
    'Regenerate the checked-in raster with this generator, sharp runtime and CJK fonts');
});
