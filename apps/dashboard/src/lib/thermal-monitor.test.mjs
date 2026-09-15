import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const flush = () => new Promise(setImmediate);

function fixture({ failure = false, deferredDecode = false, mode = 'thermal', hidden = false } = {}) {
  const path = new URL('./thermal-stream.ts', import.meta.url);
  assert.ok(fs.existsSync(path), 'real thermal snapshot lifecycle must be implemented');
  let now = 20000;
  let requests = 0;
  let pending = 0;
  let maxPending = 0;
  let closed = 0;
  let draws = 0;
  let puts = 0;
  let signal;
  let resolveDecode;
  const frames = [];
  const errors = [];
  const timers = [];
  const device = { id: 'hikvision', fresh: true, host: 'camera-a' };
  const document = { hidden };
  const bitmap = { width: 1280, height: 720, close() { closed++; } };
  const metrics = { averageTemperature: 25, peakTemperature: 40, edgeDensity: 10, complexity: 0.3, brightAreaPercent: 12 };
  const canvas = {
    width: 0, height: 0,
    getContext() { return {
      drawImage() { draws++; },
      getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData() { puts++; },
    }; },
  };
  const api = {
    hasFreshFrame: value => value.fresh,
    bridgeSourceKey: value => `${value.id}:${value.host}`,
    bridgeErrorMessage: e => e.message,
    requestBridgeSnapshot: async (id, abortSignal) => {
      assert.equal(id, 'hikvision');
      signal = abortSignal;
      requests++;
      maxPending = Math.max(maxPending, ++pending);
      now += 20;
      await Promise.resolve();
      pending--;
      if (failure) throw new Error('snapshot unavailable');
      return {};
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(path, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, AbortController, Uint8ClampedArray, document,
    Date: { now: () => now }, performance: { now: () => now },
    require(name) {
      if (name.endsWith('device-bridges-api')) return api;
      if (name.endsWith('thermal-frame')) return { processThermalFrame: (data) => ({ pixels: data, metrics }) };
      throw new Error(`unexpected import ${name}`);
    },
    createImageBitmap: () => deferredDecode
      ? new Promise(resolve => { resolveDecode = () => resolve(bitmap); }) : Promise.resolve(bitmap),
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
  });
  const stop = module.exports.startThermalStream({
    canvas, device: () => device, mode, edges: true,
    onFrame: frame => frames.push(frame), onError: error => errors.push(error),
  });
  return {
    device, document, frames, errors, canvas, timers, stop,
    get requests() { return requests; }, get maxPending() { return maxPending; },
    get closed() { return closed; }, get draws() { return draws; }, get puts() { return puts; },
    get aborted() { return signal?.aborted; },
    decode() { resolveDecode(); },
    async next() {
      await flush();
      const timer = timers.shift();
      assert.ok(timer, 'active stream must schedule another frame');
      now += timer.delay;
      timer.callback();
      await flush();
    },
  };
}

test('thermal reads the bound camera, disposes bitmaps and keeps requests single-flight at <=8fps', async () => {
  const f = fixture();
  await flush();
  assert.equal(f.frames.at(-1).deviceId, 'hikvision');
  assert.equal(f.frames.at(-1).metrics.averageTemperature, 25);
  assert.equal(f.canvas.width, 480);
  assert.equal(f.canvas.height, 270);
  assert.ok(f.timers[0].delay >= 100);
  await f.next();
  assert.equal(f.maxPending, 1);
  assert.equal(f.closed, f.requests);
  assert.equal(f.draws, 2);
  assert.equal(f.puts, 2);
  f.stop();
  assert.equal(f.aborted, true);
  assert.equal(f.timers.length, 0);
});

test('snapshot errors clear analysis and back off without synthetic frames', async () => {
  const f = fixture({ failure: true });
  await flush();
  assert.equal(f.frames.at(-1), null);
  assert.equal(f.errors.at(-1), 'snapshot unavailable');
  assert.equal(f.draws, 0);
  assert.ok(f.timers[0].delay >= 900);
  f.stop();
});

test('cancellation during bitmap decoding never paints or reschedules', async () => {
  const f = fixture({ deferredDecode: true });
  await flush();
  f.stop();
  f.decode();
  await flush();
  assert.equal(f.draws, 0);
  assert.equal(f.closed, 1);
  assert.equal(f.timers.length, 0);
  assert.equal(f.frames.filter(Boolean).length, 0);
});

test('a camera becoming stale during decoding cannot publish its old frame', async () => {
  const f = fixture({ deferredDecode: true });
  await flush();
  f.device.fresh = false;
  f.decode();
  await flush();
  assert.equal(f.draws, 0);
  assert.equal(f.closed, 1);
  assert.equal(f.frames.at(-1), null);
  f.stop();
});

test('a changed source under the same device id cannot publish a pending old frame', async () => {
  const f = fixture({ deferredDecode: true });
  await flush();
  f.device.host = 'camera-b';
  f.decode();
  await flush();
  assert.equal(f.draws, 0);
  assert.equal(f.closed, 1);
  assert.equal(f.frames.at(-1), null);
  f.stop();
});

test('a hidden tab does not fetch until visible again', async () => {
  const f = fixture({ hidden: true });
  await flush();
  assert.equal(f.requests, 0);
  f.document.hidden = false;
  await f.next();
  assert.equal(f.requests, 1);
  f.stop();
});

test('original mode preserves the RGB image while calculating the same labeled metrics', async () => {
  const f = fixture({ mode: 'original' });
  await flush();
  assert.equal(f.draws, 1);
  assert.equal(f.puts, 0);
  assert.equal(f.frames.at(-1).mode, 'original');
  assert.equal(f.frames.at(-1).metrics.averageTemperature, 25);
  f.stop();
});
