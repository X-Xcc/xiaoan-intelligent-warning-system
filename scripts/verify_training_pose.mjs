import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'apps/dashboard/src/lib/training-pose.ts');
const requireDashboard = createRequire(path.join(root, 'apps/dashboard/package.json'));

test('pose geometry, visibility and local deployment', async () => {
  assert.ok(fs.existsSync(source), 'pose drawing must have testable video-coordinate mapping');
  const result = await build({ entryPoints: [source], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(requireDashboard, module, module.exports);
  const { containRect, visibleLandmark, poseSummary, jointAngle, drawPose } = module.exports;
  const fitted = containRect(800, 500, 640, 480);
  for (const [key, value] of Object.entries({ x: 200 / 3, y: 0, width: 2000 / 3, height: 500 })) assert.ok(Math.abs(fitted[key] - value) < 1e-9);
  assert.deepEqual(containRect(400, 600, 1920, 1080), { x: 0, y: 187.5, width: 400, height: 225 });
  const point = (x, y, visibility = 0.8) => ({ x, y, z: 0, visibility });
  assert.equal(visibleLandmark(point(0.5, 0.5)), true);
  assert.equal(visibleLandmark(point(0.5, 0.5, 0.1)), false);
  assert.equal(visibleLandmark(point(-0.1, 0.5)), false);
  assert.equal(visibleLandmark(point(NaN, 0.5)), false);
  assert.equal(jointAngle(point(0, 0), point(0, 0), point(1, 1), 640, 480), null);
  assert.equal(jointAngle(point(0, 0), point(0, 1), point(1, 1), 640, 480), 90);
  const expected = Math.atan2(480, 640) * 180 / Math.PI;
  assert.ok(Math.abs(jointAngle(point(0, 1), point(1, 1), point(0, 0), 640, 480) - expected) < 0.001);
  assert.deepEqual(poseSummary([]), { visible: 0, visibility: null });
  assert.deepEqual(poseSummary([point(0.2, 0.2, 0.9), point(0.5, 0.5, 0.5), point(0.9, 0.9, 0.1)]), { visible: 2, visibility: 50 });
  let clears = 0;
  const arcs = [];
  const context = new Proxy({ clearRect() { clears++; }, arc(x, y) { arcs.push([x, y]); } }, {
    get(target, key) { return target[key] ?? (() => {}); },
  });
  const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width: 800, height: 500 }) };
  drawPose(canvas, [point(0.5, 0.5)], 640, 480, [], 1);
  assert.deepEqual(arcs, [[400, 250]], 'points align with the actual letterboxed video');
  drawPose(canvas, [], 640, 480, [], 1);
  assert.equal(clears, 2, 'no detections clear the previous skeleton');
  const packageDir = path.dirname(requireDashboard.resolve('@mediapipe/tasks-vision'));
  for (const name of fs.readdirSync(path.join(packageDir, 'wasm'))) {
    assert.deepEqual(fs.readFileSync(path.join(root, 'apps/dashboard/public/wasm', name)), fs.readFileSync(path.join(packageDir, 'wasm', name)), `${name} matches the installed runtime`);
  }
});

test('pose overlay lifecycle: real results, pause, loss, failure and source change', async () => {
  const component = path.join(root, 'apps/dashboard/src/components/TrainingPoseOverlay.tsx');
  assert.ok(fs.existsSync(component), 'the model overlay must own and clean up its inference session');
  const { JSDOM } = await import(pathToFileURL(path.join(root, '.verify/dom-runtime/node_modules/jsdom/lib/api.js')));
  const dom = new JSDOM('<main></main>', { url: 'http://test.invalid/', pretendToBeVisual: true });
  const { window } = dom;
  const originals = new Map();
  const setGlobal = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) setGlobal(name, name === 'window' ? window : window[name]);
  setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames = new Map();
  let nextFrame = 0;
  window.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  let clears = 0;
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ clearRect() { clears++; } }, { get: (target, name) => target[name] ?? (() => {}) });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 640, height: 400 });
  setGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  let rejectLoad = false;
  let failInference = false;
  let landmarks = Array.from({ length: 33 }, (_, i) => ({ x: 0.2 + (i % 5) * 0.1, y: 0.2 + (i % 6) * 0.1, z: 0, visibility: 0.8 }));
  const instances = [];
  const attempts = [];
  const fakeVision = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    PoseLandmarker: {
      POSE_CONNECTIONS: [{ start: 11, end: 12 }],
      async createFromOptions(_files, options) {
        attempts.push(options.baseOptions.delegate);
        if (rejectLoad) throw new Error('asset load failed');
        const instance = {
          calls: 0, closed: false,
          detectForVideo() { if (failInference) throw new Error('inference failed'); this.calls++; return { landmarks: [landmarks] }; },
          close() { this.closed = true; },
        };
        instances.push(instance);
        return instance;
      },
    },
  };
  const result = await build({
    entryPoints: [component], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    plugins: [{ name: 'test-runtime', setup(b) {
      b.onResolve({ filter: /^@mediapipe\/tasks-vision$/ }, () => ({ path: 'vision', namespace: 'fake-vision' }));
      b.onLoad({ filter: /.*/, namespace: 'fake-vision' }, () => ({ contents: 'const vision = require("test-vision"); export const FilesetResolver = vision.FilesetResolver; export const PoseLandmarker = vision.PoseLandmarker;' }));
      b.onResolve({ filter: /^test-vision$/ }, () => ({ path: 'test-vision', external: true }));
      b.onResolve({ filter: /^react(?:-dom)?(?:\/|$)/ }, (args) => ({ path: requireDashboard.resolve(args.path), external: true }));
    } }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)((name) => name === 'test-vision' ? fakeVision : requireDashboard(name), module, module.exports);
  const { TrainingPoseOverlay } = module.exports;
  const React = requireDashboard('react');
  const { act } = React;
  const { createRoot } = requireDashboard('react-dom/client');
  const container = document.querySelector('main');
  const mounted = createRoot(container);
  const video = document.createElement('video');
  for (const [name, value] of Object.entries({ readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 1, paused: false, seeking: false, ended: false })) Object.defineProperty(video, name, { value, writable: true });
  let props = { videoRef: { current: video }, active: false, sourceKey: 'a', playback: false, subject: '训练科目' };
  const render = async (next = {}) => { props = { ...props, ...next }; await act(async () => mounted.render(React.createElement(TrainingPoseOverlay, props))); };
  let timestamp = 100;
  const tick = async () => { timestamp += 100; const pending = [...frames.values()]; frames.clear(); await act(async () => pending.forEach((callback) => callback(timestamp))); };
  const click = async (selector) => act(async () => container.querySelector(selector).click());
  try {
    await render();
    assert.equal(attempts.length, 0, 'no model load or inference without video');
    await render({ active: true });
    await tick();
    assert.equal(container.querySelector('[data-pose-state]').dataset.poseState, 'tracking');
    assert.match(container.textContent, /80%/);
    assert.ok(!container.textContent.includes('96%'));
    const initialClears = clears;
    await tick();
    assert.equal(instances[0].calls, 1, 'same video frame must not be inferred twice');
    assert.equal(clears, initialClears, 'same frame must retain its skeleton without flickering');
    await click('[role="switch"]');
    assert.equal(container.querySelector('[data-pose-state]').dataset.poseState, 'paused');
    assert.ok(instances[0].closed);
    assert.ok(clears > initialClears);
    await click('[role="switch"]');
    await tick();
    assert.equal(instances.at(-1).calls, 1, 'resume infers even when paused on the same video time');
    landmarks = [];
    video.currentTime++;
    await tick();
    assert.equal(container.querySelector('[data-pose-state]').dataset.poseState, 'searching');
    assert.ok(!container.textContent.includes('80%'), 'lost person clears stale metrics');
    const old = instances.at(-1);
    await render({ sourceKey: 'b', playback: true });
    assert.ok(old.closed);
    failInference = true;
    await tick();
    assert.equal(container.querySelector('[data-pose-state]').dataset.poseState, 'error');
    failInference = false;
    rejectLoad = true;
    await click('[aria-label="重试骨骼追踪"]');
    assert.deepEqual(attempts.slice(-2), ['GPU', 'CPU'], 'GPU failure must try the local CPU runtime');
    assert.equal(container.querySelector('[data-pose-state]').dataset.poseState, 'error');
    rejectLoad = false;
    await click('[aria-label="重试骨骼追踪"]');
    await tick();
    assert.equal(container.querySelector('[data-pose-state]').dataset.poseState, 'searching');
  } finally {
    await act(async () => mounted.unmount());
    assert.ok(instances.every((instance) => instance.closed), 'all created models are closed');
    assert.equal(frames.size, 0, 'unmount cancels every scheduled frame');
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
