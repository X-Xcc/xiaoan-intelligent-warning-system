import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
async function load(name, env = { BASE_URL: '/' }) {
  const file = new URL(`./${name}.ts`, import.meta.url);
  assert.ok(fs.existsSync(file), `${name} must exist`);
  const context = vm.createContext({ crypto: webcrypto, URL, URLSearchParams, structuredClone, setTimeout, clearTimeout });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' }), {
    context, initializeImportMeta: meta => { meta.env = env; },
  });
  await module.link(() => assert.fail(`${name} must not import runtime UI code`));
  await module.evaluate();
  return module.namespace;
}

test('A1 recommendations map to distinct matching subjects without mutating tasks', async () => {
  const training = await load('training-demo');
  const before = plain(await training.trainingDemo.snapshot());
  for (const index of [1, 2, 3]) {
    const selected = training.demoTrainingSelection({ taskId: `TRAIN-READINESS-00${index}`, officerId: '' });
    assert.equal(selected.taskId, `TRAIN-DEMO-01${index + 6}-0${index}`);
    assert.equal(selected.officerId, `DEMO-OFFICER-01${index + 6}`);
    assert.ok(before.tasks.find(task => task.taskId === selected.taskId));
  }
  assert.deepEqual(plain(await training.trainingDemo.snapshot()), before);
});

test('an explicit synthetic task is not changed by readiness mapping', async () => {
  const { demoTrainingSelection } = await load('training-demo');
  assert.deepEqual(plain(demoTrainingSelection({ taskId: 'TRAIN-DEMO-019-07', officerId: '' })), {
    officerId: 'DEMO-OFFICER-019', taskId: 'TRAIN-DEMO-019-07',
  });
});

test('video addresses support relative production APIs and prefixed deployments', async () => {
  const { sceneFeedUrl } = await load('scene-video');
  assert.equal(sceneFeedUrl('/api/security-video/feed?cam=cam-003', '/api', 'https://example.test/command'),
    'https://example.test/api/security-video/feed?cam=cam-003');
  assert.equal(sceneFeedUrl('/api/security-video/feed?cam=cam-003', '/site/api', 'https://example.test/site/command'),
    'https://example.test/site/api/security-video/feed?cam=cam-003');
  assert.equal(sceneFeedUrl('/api/security-video/feed?cam=cam-003', 'http://127.0.0.1:8010/api', 'http://127.0.0.1:5177/command'),
    'http://127.0.0.1:8010/api/security-video/feed?cam=cam-003');
});

test('untrusted or malformed video addresses do not crash rendering or leave the configured API', async () => {
  const { sceneFeedUrl } = await load('scene-video');
  for (const url of ['http://[', 'javascript:alert(1)', '//other.test/frame', '/admin', 'https://user:pass@example.test/api/security-video/feed']) {
    assert.equal(sceneFeedUrl(url, '/api', 'https://example.test/command'), undefined, url);
  }
});

test('empty live registries remain empty instead of inheriting demo services', async () => {
  const { normalizeLiveOverview } = await load('platform-overview');
  const value = normalizeLiveOverview({
    stats: {}, dataCatalog: { domainCount: 0, domains: [] },
    ai_copilot: { agents: [], skills: [], mcp_connectors: [] }, businessSystems: [],
  });
  assert.deepEqual(plain(value.ai_copilot), { agents: [], skills: [], mcp_connectors: [] });
  assert.deepEqual(plain(value.businessSystems), []);
  assert.deepEqual(plain(value.dataCatalog), { domainCount: 0, domains: [] });
  assert.deepEqual(plain(value.stats), {});
});

test('partial live responses do not invent business metrics or availability', async () => {
  const { normalizeLiveOverview } = await load('platform-overview');
  const value = normalizeLiveOverview({ stats: { today_events: 0 } });
  assert.equal(value.stats.today_events, 0);
  assert.equal(value.stats.training_records, undefined);
  assert.deepEqual(plain(value.ai_copilot.agents), []);
  assert.deepEqual(plain(value.businessSystems), []);
});

test('legacy business identifiers retain their real metrics and statuses', async () => {
  const { normalizeLiveOverview } = await load('platform-overview');
  const value = normalizeLiveOverview({ stats: {}, businessSystems: [{ key: 'alarm', metric: 0, status: 'offline' }] });
  assert.equal(value.businessSystems[0].key, 'command');
  assert.equal(value.businessSystems[0].metric, 0);
  assert.equal(value.businessSystems[0].status, 'offline');
});

test('business workbench has a distinct deep link and preserves the intake route', async () => {
  for (const base of ['/', '/public-security/']) {
    const presentation = await load('presentation', { BASE_URL: base });
    assert.equal(presentation.routePath('command-workbench'), `${base}command/workbench`);
    assert.equal(presentation.viewForPath(`${base}command/workbench`), 'command-workbench');
    assert.equal(presentation.viewForPath(`${base}command`), 'command');
  }
});

test('a local datetime input roundtrips without shifting the discovery time', async () => {
  const { localDateTimeInput } = await load('command-workflow');
  assert.equal(typeof localDateTimeInput, 'function');
  const date = new Date(2026, 8, 9, 10, 30, 0);
  assert.equal(localDateTimeInput(date), '2026-09-09T10:30');
  assert.equal(new Date(localDateTimeInput(date)).getTime(), date.getTime());
});

test('uncertain requests are discoverable after reload for receipt reconciliation', async () => {
  const { RequestLedger } = await load('command-workflow');
  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const first = new RequestLedger(storage, 'audit');
  const payload = first.begin('event-1', 'evidence', { expectedVersion: 1, name: 'fixture' });
  assert.equal(typeof first.pending, 'function');
  const restored = new RequestLedger(storage, 'audit');
  assert.deepEqual(plain(restored.pending('event-1')), [{ action: 'evidence', payload: plain(payload) }]);
  restored.resolve('event-1', 'evidence');
  assert.deepEqual(plain(restored.pending('event-1')), []);
});

test('management refresh preserves dirty settings and does not infer model readiness from API health', () => {
  const source = read('../pages/AdminConsolePage.tsx');
  assert.match(source, /if \(!settingsDirty\.current\) platformForm\.setFieldsValue\(next\)/);
  assert.match(source, /onValuesChange=\{\(\) => \{ settingsDirty\.current = true; \}\}/);
  assert.doesNotMatch(source, /modelReady = Boolean\([^\n]*apiOnline/);
});

test('overview and training image URLs honor the configured asset prefix', () => {
  for (const [file, image] of [
    ['../pages/PublicSecurityPlatformPage.tsx', 'night-market-cam-02.png'],
    ['../pages/OfficerTrainingPage.tsx', 'yanhuo-shaobing-mark.png'],
  ]) {
    assert.ok(read(file).includes('`${appBasePath}/' + image + '`'), file);
  }
});

test('intake recordings stay outside the application JavaScript and avoid full eager preloading', () => {
  const source = read('../components/CommandIntakeSheet.tsx');
  for (const name of ['intake-hello.wav', 'intake-disorder-call.wav']) {
    assert.ok(source.includes(`${name}?url`), `${name} must be a separate asset`);
  }
  assert.doesNotMatch(source, /\.wav\?inline|preload="auto"/);
  assert.match(source, /preload="metadata"/);
});
