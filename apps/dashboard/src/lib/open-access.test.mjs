import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('dashboard governance labels describe open access without implying authorization gates', () => {
  const dashboard = read('../pages/DashboardApp.tsx');
  const admin = read('../pages/AdminConsolePage.tsx');
  for (const source of [dashboard, admin]) {
    assert.doesNotMatch(source, /统一身份与最小权限|按授权查询|分级授权/);
    assert.match(source, /开放访问/);
  }
  assert.match(dashboard, /identity: '公共工作台'/);
  assert.match(admin, /按记录查询/);
  assert.doesNotMatch(read('../pages/CommandOperationsPage.tsx'), /\{<>/);
});

test('dashboard pages have no project login, persona, lock or reenable-auth controls', () => {
  for (const file of ['AdminConsolePage', 'CommandOperationsPage', 'DeviceBridgesPage', 'VideoLinkagePage', 'PoliceDomainPages']) {
    assert.doesNotMatch(read(`../pages/${file}.tsx`), /BridgeLogin|bridge\.authRequired|bridge\.lock|signIn|signOut|demoLogin|personaOptions|command-token|tokenInput|创建服务密钥|密钥生命周期|name="(?:adminAuthEnabled|sourceAuthEnabled)"/, file);
  }
  for (const file of ['CommandScene', 'TrainingCameraPreview', 'BridgePreview']) {
    assert.doesNotMatch(read(`../components/${file}.tsx`), /BridgeLogin|bridge\.authRequired|bridge\.login/, file);
  }
  assert.doesNotMatch(read('./device-bridges-api.ts').split('export function useBridgeInventory()')[1],
    /authRequired|const login|const lock|authorization\.enabled/);
  assert.match(read('../pages/CommandOperationsPage.tsx'), /void commandRequest<Principal>\('\/command\/me', '', \{ signal: abort\.signal \}\)/);
});

test('admin reads work without supplying a credential', async (t) => {
  const code = stripTypeScriptTypes(read('./admin-request.ts'));
  const { createAdminRequest } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(new Headers(init.headers).has('X-Admin-Token'), false);
    return Response.json({ ok: true });
  });
  assert.deepEqual(await createAdminRequest('http://localhost/api')('/overview'), { ok: true });
});

test('command actions ignore roles but still enforce stage, online and playback constraints', async () => {
  const code = stripTypeScriptTypes(read('./command-workflow.ts'), { mode: 'transform' });
  const { actionAllowed } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const event = { status: '已提交', meta: { command: { summary: { reviewStatus: 'pending' } } } };
  assert.equal(actionAllowed(event, [], 'intake', 'rehearsal', true), true);
  assert.equal(actionAllowed(event, [], 'dispatch', 'rehearsal', true), false);
  assert.equal(actionAllowed(event, [], 'intake', 'playback', true), false);
  assert.equal(actionAllowed(event, [], 'intake', 'rehearsal', false), false);
  event.status = '已完成';
  assert.equal(actionAllowed(event, [], 'intake', 'rehearsal', true), false);
});

test('bridge hook establishes an anonymous compatible preview session and loads inventory', async () => {
  const effects = [];
  const slots = [];
  const calls = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useCallback: (callback) => callback,
    useEffect: (effect) => effects.push(effect),
  };
  const context = vm.createContext({
    AbortController, Headers, Response, URL, URLSearchParams, DOMException,
    setTimeout: () => 1, clearTimeout() {},
    window: { setInterval: () => 1, clearInterval() {} },
    fetch: async (url, init) => {
      calls.push(url);
      assert.equal(new Headers(init.headers).has('X-Admin-Token'), false);
      assert.equal(init.credentials, 'include');
      if (url.endsWith('/session')) return Response.json({ authorized: true, expiresIn: 3600 });
      assert.ok(url.endsWith('/device-bridges/'));
      return Response.json({ items: [], bindings: Array(16).fill(null),
        runtime: { running: 0, av: true, opencv: true, go2: false, maxDevices: 16 } });
    },
  });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(read('./device-bridges-api.ts')), {
    context, initializeImportMeta(meta) { meta.env = { VITE_API_BASE_URL: '/api' }; },
  });
  await module.link(() => new vm.SyntheticModule(Object.keys(hooks), function () {
    for (const [name, value] of Object.entries(hooks)) this.setExport(name, value);
  }, { context }));
  await module.evaluate();
  module.namespace.useBridgeInventory();
  const cleanups = effects.map((effect) => effect());
  try {
    await new Promise(setImmediate);
    cursor = 0;
    const bridge = module.namespace.useBridgeInventory();
    assert.equal(bridge.previewReady, true);
    assert.equal(bridge.available, true);
    assert.equal(bridge.inventory.bindings.length, 16);
    assert.deepEqual(calls, ['/api/device-bridges/session', '/api/device-bridges/']);
    assert.equal('login' in bridge, false);
    assert.equal('lock' in bridge, false);
  } finally {
    cleanups.forEach((cleanup) => cleanup?.());
  }
});
