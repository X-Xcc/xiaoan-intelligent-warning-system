import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';

const plain = value => JSON.parse(JSON.stringify(value));
const state = version => ({ event: { id: 'synthetic-event' }, command: { version } });
async function load(responses) {
  const calls = [];
  const context = vm.createContext({
    crypto: webcrypto, AbortSignal, FormData,
    fetch: async (url, options) => {
      calls.push({ url, method: options.method || 'GET' });
      assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, 'unexpected request');
      return Response.json(response.body, { status: response.status || 200 });
    },
  });
  const modules = new Map();
  async function module(name) {
    if (modules.has(name)) return modules.get(name);
    const result = new vm.SourceTextModule(
      stripTypeScriptTypes(fs.readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8'), { mode: 'transform' }),
      { context, initializeImportMeta: meta => { meta.env = { VITE_API_BASE_URL: '/api' }; } },
    );
    modules.set(name, result);
    await result.link(specifier => module(specifier.replace('./', '')));
    return result;
  }
  const api = await module('command-api');
  const workflow = await module('command-workflow');
  await api.evaluate();
  await workflow.evaluate();
  const ledger = new workflow.namespace.RequestLedger();
  const pending = ledger.begin('synthetic-event', 'summary/confirm', { expectedVersion: 2, text: 'Synthetic' });
  return { api: api.namespace, ledger, pending, calls };
}

test('confirmed receipts clear pending requests without replacing a newer snapshot', async () => {
  const { api, ledger, calls } = await load([{ body: state(4) }, { body: state(3) }]);
  const result = await api.reconcileCommandRequests('synthetic-event', 'synthetic-token', ledger);
  assert.equal(result.snapshot.command.version, 4);
  assert.equal(result.pendingCount, 0);
  assert.equal(ledger.pending('synthetic-event').length, 0);
  assert.ok(calls.every(call => call.method === 'GET'));
});

test('a missing receipt at the same version retains its original id for a safe retry', async () => {
  const { api, ledger, pending } = await load([{ body: state(2) }, { status: 404, body: { detail: 'Absent' } }]);
  const result = await api.reconcileCommandRequests('synthetic-event', 'synthetic-token', ledger);
  assert.equal(result.pendingCount, 1);
  assert.deepEqual(plain(ledger.pending('synthetic-event')[0].payload), plain(pending));
  assert.equal(ledger.begin('synthetic-event', 'summary/confirm', { expectedVersion: 2, text: 'Synthetic' }).requestId, pending.requestId);
});

test('a stale missing request can be cleared only once optimistic versioning prevents it from committing', async () => {
  const { api, ledger } = await load([{ body: state(3) }, { status: 404, body: { detail: 'Absent' } }]);
  const result = await api.reconcileCommandRequests('synthetic-event', 'synthetic-token', ledger);
  assert.equal(result.pendingCount, 0);
});

test('authorization and transport failures do not discard uncertain requests', async () => {
  for (const responses of [
    [{ status: 403, body: { detail: 'Denied' } }],
    [{ body: state(3) }, { status: 403, body: { detail: 'Denied' } }],
    [{ body: state(3) }, new TypeError('Network unavailable')],
  ]) {
    const { api, ledger } = await load(responses);
    await assert.rejects(api.reconcileCommandRequests('synthetic-event', 'synthetic-token', ledger));
    assert.equal(ledger.pending('synthetic-event').length, 1);
  }
});

test('the business route and busy controls are integrated without replacing the intake page', () => {
  const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const dashboard = read('../pages/DashboardApp.tsx');
  const workbench = read('../pages/CommandOperationsPage.tsx');
  const controls = read('../components/command/CommandControls.tsx');
  assert.match(dashboard, /view === 'command-workbench'[\s\S]*?<CommandWorkbench onBack=\{\(\) => navigate\('command'\)\}/);
  assert.match(dashboard, /view === 'command'[\s\S]*?<CommandOperationsPage overview=/);
  assert.match(dashboard, /const standalonePage = view === 'command-workbench' && new URLSearchParams\(window\.location\.search\)\.get\('surface'\) === 'display'\s*\? <CommandWorkbench \/>/);
  assert.match(dashboard, /\{standalonePage \?\? <main className="platform-control-shell">/);
  assert.match(dashboard, /<\/main>\}\s*<XiaoanAssistant/);
  assert.match(workbench, /<CommandControls value=\{control\} onChange=\{updateControl\} disabled=\{busy\}/);
  assert.ok(workbench.includes('if (display || busy || control.paused || control.reveal >= 3) return;'),
    'automatic stage changes must pause while a business action is pending');
  assert.match(controls, /if \(disabled\) return;/);
  assert.match(workbench, /params\.get\('mode'\) === 'playback' \? 'playback' : 'rehearsal'/);
});

test('a delayed create acknowledgment cannot navigate after leaving the workbench', async () => {
  const source = fs.readFileSync(new URL('../pages/CommandOperationsPage.tsx', import.meta.url), 'utf8');
  const updateStart = source.indexOf('  const updateControl = useCallback');
  const createStart = source.indexOf('  const create = async');
  const code = source.slice(updateStart, source.indexOf('  useEffect', updateStart))
    .replace('const updateControl', 'export const updateControl')
    + source.slice(createStart, source.indexOf('  const pickEvent', createStart))
      .replace('const create', 'export const create');
  for (const leavePage of [false, true]) {
    let acknowledge;
    const navigations = [];
    const stored = new Map();
    const mounted = { current: true };
    const context = vm.createContext({
      mounted, useCallback: callback => callback, URLSearchParams,
      setControl() {}, channel: { current: null },
      window: { location: { search: '' }, history: { replaceState: (...args) => navigations.push(args) } },
      sessionStorage: {
        getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
        removeItem: key => stored.delete(key),
      },
      operation: { current: false }, principal: { openid: 'fixture', roles: ['intake'] },
      playback: false, newText: 'Synthetic intake', newBay: 'Synthetic location', token: 'fixture',
      control: { runKey: 'old', revision: 1 }, commandRequestId: () => 'fixture-request',
      commandRequest: () => new Promise(resolve => { acknowledge = resolve; }),
      initialControl: (runKey, mode) => ({ runKey, mode }),
      routePath: () => '/command/workbench',
      setBusy() {}, setCreateOpen() {}, setNewText() {}, setNewBay() {}, setFeedback() {}, setError() {},
    });
    const module = new vm.SourceTextModule(stripTypeScriptTypes(code, { mode: 'transform' }), { context });
    await module.link(() => assert.fail('Unexpected dependency'));
    await module.evaluate();
    const creation = module.namespace.create(false);
    assert.ok(stored.has('command-create:fixture'));
    if (leavePage) mounted.current = false;
    acknowledge({ event: { id: 'created-event' }, command: { runKey: 'created-run' } });
    await creation;
    assert.equal(navigations.length, leavePage ? 0 : 1);
    assert.equal(stored.has('command-create:fixture'), false, 'a received acknowledgment still resolves the pending create');
  }
  assert.match(source, /mounted\.current = true;[\s\S]*?return \(\) => \{ mounted\.current = false; \}/);
});
