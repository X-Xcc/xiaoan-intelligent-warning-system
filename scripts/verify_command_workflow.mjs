import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { transformSync, buildSync } from 'esbuild';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(new URL('../tmp/command-test-runtime/package.json', import.meta.url))('jsdom');

const root = new URL('../', import.meta.url);
async function workflow() {
  const path = new URL('apps/dashboard/src/lib/command-workflow.ts', root);
  assert.ok(fs.existsSync(path), 'command workflow module must exist');
  const { code } = transformSync(fs.readFileSync(path, 'utf8'), { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('playback controls never alter the business event or generate commands', async () => {
  const { advanceControl, initialControl } = await workflow();
  let control = initialControl('run-one', 'playback');
  const frozen = structuredClone(control);
  for (let i = 0; i < 24; i++) control = advanceControl(control, 'next');
  assert.deepEqual(frozen, initialControl('run-one', 'playback'));
  assert.equal(control.stage, 'handover');
  control = advanceControl(control, 'reset');
  assert.equal(control.stage, 'b1');
  assert.equal(control.reveal, 0);
  assert.equal(control.runKey, 'run-one');
  assert.equal(control.mode, 'playback');
});

test('no action is writable in playback, stale snapshots or display-only roles', async () => {
  const { actionAllowed } = await workflow();
  const event = { status: '已提交', meta: { command: { version: 1, summary: { reviewStatus: 'confirmed' },
    dispatch: { reviewStatus: 'confirmed' } } } };
  assert.equal(actionAllowed(event, ['dispatch'], 'dispatch', 'playback', true), false);
  assert.equal(actionAllowed(event, ['dispatch'], 'dispatch', 'rehearsal', false), false);
  assert.equal(actionAllowed(event, ['display'], 'dispatch', 'rehearsal', true), false);
  assert.equal(actionAllowed(event, ['dispatch'], 'dispatch', 'rehearsal', true), true);
});

test('late responses cannot overwrite another event or a newer version', async () => {
  const { acceptsResponse } = await workflow();
  assert.equal(acceptsResponse('event-b', 3, { event: { id: 'event-a' }, command: { version: 9 } }), false);
  assert.equal(acceptsResponse('event-b', 3, { event: { id: 'event-b' }, command: { version: 2 } }), false);
  assert.equal(acceptsResponse('event-b', 3, { event: { id: 'event-b' }, command: { version: 3 } }), true);
});

test('retries keep their original request id and payload until a receipt or explicit failure', async () => {
  const { RequestLedger } = await workflow();
  const ledger = new RequestLedger();
  const first = ledger.begin('event-a', 'dispatch', { expectedVersion: 4, recommendationId: 'rec' });
  const retry = ledger.begin('event-a', 'dispatch', { expectedVersion: 4, recommendationId: 'rec' });
  assert.equal(first.requestId, retry.requestId);
  assert.throws(() => ledger.begin('event-a', 'dispatch', { expectedVersion: 5, recommendationId: 'changed' }));
  ledger.resolve('event-a', 'dispatch');
  assert.notEqual(ledger.begin('event-a', 'dispatch', { expectedVersion: 5 }).requestId, first.requestId);
});

test('request IDs work on HTTP without randomUUID and retain UUID version bits', async () => {
  const { commandRequestId } = await workflow();
  const source = { getRandomValues: (bytes) => { bytes.fill(127); return bytes; } };
  assert.equal(commandRequestId(source), '7f7f7f7f-7f7f-4f7f-bf7f-7f7f7f7f7f7f');
});

test('control component handles keyboard only on its own canvas and never calls fetch', async () => {
  const file = new URL('apps/dashboard/src/components/command/CommandControls.tsx', root);
  assert.ok(fs.existsSync(file), 'control component must exist');
  const require = createRequire(import.meta.url);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/command' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const result = buildSync({ entryPoints: [file.pathname.replace(/^\/([A-Z]:)/, '$1')], bundle: true,
    write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { initialControl } = await workflow();
  const controls = [];
  const oldFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async () => { writes++; throw new Error('controls may not request business writes'); };
  const mounted = createRoot(document.getElementById('root'));
  await React.act(async () => mounted.render(React.createElement(module.exports.CommandControls, {
    value: initialControl('test', 'playback'), onChange: (value) => controls.push(value),
  })));
  const canvas = document.querySelector('[data-command-controls]');
  await React.act(async () => canvas.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: ' ', shiftKey: true, bubbles: true, cancelable: true,
  })));
  assert.equal(controls.at(-1).reveal, 1);
  const input = document.createElement('input');
  canvas.appendChild(input);
  await React.act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: ' ', shiftKey: true, bubbles: true, cancelable: true,
  })));
  assert.equal(controls.length, 1);
  assert.equal(writes, 0);
  await React.act(async () => mounted.unmount());
  globalThis.fetch = oldFetch;
  dom.window.close();
});

test('staff command tasks cannot complete before handover or navigate teaching coordinates', async () => {
  const path = new URL('apps/miniprogram/src/features/staff/staff-model.ts', root);
  const { code } = transformSync(fs.readFileSync(path, 'utf8'), { loader: 'ts', format: 'esm' });
  const { taskTransitionError, isAssignedTask, navigationDestination } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const task = { id: 'CMD-test', status: '处理中', owner: '王队', meta: {
    assignment: { staffId: 'wang', staffName: '王队' }, command: { sourceMode: 'desensitized_demo', handover: { status: 'submitted' } },
    alarmLocation: { latitude: 28, longitude: 115, source: 'desensitized_demo' },
  } };
  assert.match(taskTransitionError(task, '王队', '已完成', '结果已填写'), /移交/);
  assert.equal(navigationDestination(task), undefined);
  assert.equal(isAssignedTask({ ...task, status: '已提交' }, '王队'), false);
});
