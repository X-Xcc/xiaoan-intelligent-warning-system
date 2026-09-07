import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import test from 'node:test';

const root = new URL('../', import.meta.url);
async function load(file) {
  const result = await build({ entryPoints: [new URL(file, root).pathname.replace(/^\/([A-Z]:)/i, '$1')], bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env.BASE_URL': '"/"' } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

test('training is an A1 child route with legacy link compatibility', async () => {
  const { routePath, viewForPath } = await load('apps/dashboard/src/lib/presentation.ts');
  assert.equal(routePath('duty-plan'), '/duty-situation/training');
  assert.equal(viewForPath('/duty-situation/training'), 'duty-plan');
  assert.equal(viewForPath('/duty-plan'), 'duty-plan');
  assert.equal(viewForPath('/duty-situation'), 'duty-situation');
});

test('A1 entry memory is defensive and specific course links override the last officer', async () => {
  const file = 'apps/dashboard/src/lib/training-navigation.ts';
  assert.ok(fs.existsSync(new URL(file, root)), 'a shared module owns A1 return and training selection');
  const values = new Map();
  const original = globalThis.window;
  globalThis.window = { sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    const nav = await load(file);
    assert.equal(nav.trainingEntryPath(), '/duty-situation/training');
    nav.rememberTrainingSelection({ taskId: 'TRAIN-001', officerId: 'OFFICER-017' });
    assert.deepEqual(nav.readTrainingSelection(), { taskId: 'TRAIN-001', officerId: 'OFFICER-017' });
    assert.equal(nav.trainingEntryPath(), '/duty-situation/training?task=TRAIN-001&officer=OFFICER-017');
    assert.equal(nav.trainingEntryPath('TRAIN-002'), '/duty-situation/training?task=TRAIN-002');
    nav.rememberSituationView({ selectedId: 'A', scrollY: 1260, phase: 'hotspot', remainingMs: 340, paused: true, sound: false, panels: [5, 8, 13] });
    assert.deepEqual(nav.readSituationView(), { selectedId: 'A', scrollY: 1260, phase: 'hotspot', remainingMs: 340, paused: true, sound: false, panels: [5, 8, 13] });
    for (const key of values.keys()) values.set(key, '{invalid');
    assert.equal(nav.readSituationView().selectedId, 'B');
    assert.equal(nav.trainingEntryPath(), '/duty-situation/training');
    globalThis.window.sessionStorage.getItem = () => { throw new Error('storage blocked'); };
    globalThis.window.sessionStorage.setItem = () => { throw new Error('storage blocked'); };
    assert.doesNotThrow(() => nav.rememberTrainingSelection({ taskId: 'one', officerId: '017' }));
    assert.equal(nav.trainingEntryPath('one / two'), '/duty-situation/training?task=one+%2F+two');
  } finally { globalThis.window = original; }
});
