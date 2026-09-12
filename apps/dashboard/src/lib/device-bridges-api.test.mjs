import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const input = { name: 'Camera', kind: 'rtsp', host: '192.0.2.2', port: 554, channel: 1, stream: 'main', rtspPath: '/live' };

async function loadModule(path, env = {}) {
  const context = vm.createContext({
    console, AbortController, Headers, Response, URL, URLSearchParams, DOMException,
    fetch: (...args) => globalThis.fetch(...args),
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
  });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(read(path)), {
    context, initializeImportMeta: (meta) => { meta.env = env; },
  });
  await module.link((name) => {
    assert.equal(name, 'react');
    const hooks = ['useCallback', 'useEffect', 'useRef', 'useState'];
    return new vm.SyntheticModule(hooks, function () {
      for (const hook of hooks) this.setExport(hook, () => { throw new Error('Hooks are covered by parent browser acceptance'); });
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}
const api = (base) => loadModule('./device-bridges-api.ts', { VITE_API_BASE_URL: base });

test('bridge route and prefix navigation resolve independently of governance', async () => {
  const routes = await loadModule('./presentation.ts', { BASE_URL: '/public-security/' });
  assert.equal(routes.routePath('device-bridges'), '/public-security/admin/bridges');
  assert.equal(routes.viewForPath('/public-security/admin/bridges'), 'device-bridges');
  assert.equal(routes.viewForPath('/public-security/admin'), 'admin');
  assert.match(read('../pages/DashboardApp.tsx'), /<DeviceBridgesPage/);
  assert.match(read('../pages/AdminConsolePage.tsx'), /navigate\('device-bridges'\)/);
});

test('video wall never fabricates cameras or AI/evidence findings', () => {
  const page = read('../pages/VideoLinkagePage.tsx');
  assert.ok(!/fallbackCameras|defaultChannels|FightAlertReport|buildFallbackFightReport|security-ai\/judgements|已模拟|已完成证据保全/.test(page));
  assert.match(page, /BridgePreview/);
  assert.match(page, /bindings\.map/);
  assert.match(page, /<Button disabled icon=\{<BrainCircuit/);
});

test('video wall opts into placeholders without changing live preview state', () => {
  const page = read('../pages/VideoLinkagePage.tsx');
  const preview = read('../components/BridgePreview.tsx');
  assert.match(page, /placeholderSrc=\{slotPlaceholder\(index\)\}/);
  assert.match(page, /placeholderSrc=\{slotPlaceholder\(selectedChannel\)\}/);
  assert.match(page, /appBasePath.*night-market-cam-/);
  assert.match(preview, /placeholderSrc\?: string/);
  assert.match(preview, /alt="夜市场景演示图片，非实时监控"/);
  assert.doesNotMatch(preview, /<span>演示图片 · 非实时<\/span>/);
  assert.match(preview, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(preview, /data-preview-state=\{showImage \? 'live' : 'unavailable'\}/);
  for (let camera = 2; camera <= 16; camera++) {
    assert.ok(fs.existsSync(new URL(`../../public/night-market-cam-${String(camera).padStart(2, '0')}.png`, import.meta.url)));
  }
});

test('video wall omits service status and error banner without removing authorization', () => {
  const page = read('../pages/VideoLinkagePage.tsx');
  assert.doesNotMatch(page, /monitoring-service|bridge-video-alert|<Alert\b/);
  assert.match(page, /bridge\.authRequired \? <BridgeLogin/);
  assert.match(page, /const previewAvailable = bridge\.available && !bridge\.busy/);
});

test('video wall presents named scenes without inventing live device metrics', () => {
  const page = read('../pages/VideoLinkagePage.tsx');
  assert.match(page, /camera\?\.name \?\? scene\.name/);
  assert.match(page, /selected\?\.name \?\? selectedScene\.name/);
  assert.match(page, /onlineCount !== null && cameras\.length > 0/);
  assert.doesNotMatch(page, /槽位尚未读取|无视频源|解码帧率未测得|未绑定设备|设备不可用|未记录|未测得/);
  assert.match(page, /hasFreshFrame\(camera, bridge\.now\)/);
});

test('brand templates respect channel and stream, while custom paths are preserved', async () => {
  const lib = await api();
  assert.equal(lib.rtspTemplate('hikvision', 2, 'main'), '/Streaming/Channels/201');
  assert.equal(lib.rtspTemplate('hikvision', 256, 'sub'), '/Streaming/Channels/25602');
  assert.equal(lib.rtspTemplate('dahua', 3, 'sub'), '/cam/realmonitor?channel=3&subtype=1');
  assert.equal(lib.rtspTemplate('rtsp', 1, 'main'), '');
  assert.equal(lib.deviceInput({ ...input, kind: 'hikvision', rtspPath: '/manual' }).rtspPath, '/manual');
});

test('editing an empty brand path selects its template and passes path validation', async () => {
  const lib = await api();
  assert.equal(typeof lib.bridgeEditorPath, 'function');
  for (const kind of ['hikvision', 'dahua']) {
    for (const stream of ['main', 'sub']) {
      for (const rtspPath of ['', undefined]) {
        const device = { ...input, kind, channel: 2, stream, rtspPath };
        const before = plain(device);
        const initial = lib.bridgeEditorPath(device);
        assert.equal(initial.customPath, false);
        assert.equal(initial.rtspPath, lib.rtspTemplate(kind, 2, stream));
        assert.deepEqual(plain(lib.validateDeviceInput({ ...device, rtspPath: initial.rtspPath })), {});
        assert.deepEqual(plain(device), before, 'form initialization must not modify the API record');
      }
    }
  }
  const page = read('../pages/DeviceBridgesPage.tsx');
  assert.match(page, /initialPath = bridgeEditorPath\(device\)/);
  assert.match(page, /useState\(initialPath\.customPath\)/);
  assert.match(page, /rtspPath: initialPath\.rtspPath/);
});

test('editor preserves explicit paths and keeps new generic RTSP empty', async () => {
  const lib = await api();
  assert.equal(typeof lib.bridgeEditorPath, 'function');
  for (const kind of ['hikvision', 'dahua']) {
    const template = lib.rtspTemplate(kind, 1, 'main');
    assert.deepEqual(plain(lib.bridgeEditorPath({ ...input, kind, rtspPath: template })), { rtspPath: template, customPath: false });
    assert.deepEqual(plain(lib.bridgeEditorPath({ ...input, kind, rtspPath: '/manual' })), { rtspPath: '/manual', customPath: true });
  }
  assert.deepEqual(plain(lib.bridgeEditorPath()), { rtspPath: '', customPath: true });
  assert.deepEqual(plain(lib.bridgeEditorPath({ ...input, rtspPath: '' })), { rtspPath: '', customPath: true });
  assert.ok(lib.validateDeviceInput({ ...input, rtspPath: lib.bridgeEditorPath().rtspPath }).rtspPath);
});

test('editor retains initial values through StrictMode cleanup and explicitly clears cancelled passwords', () => {
  const page = read('../pages/DeviceBridgesPage.tsx');
  assert.doesNotMatch(page, /<Form\b[^>]*\bclearOnDestroy\b/);
  assert.match(page, /const initialDevice:[^\n]*kind: 'rtsp'[^\n]*port: 554[^\n]*channel: 1[^\n]*stream: 'main'/);
  assert.match(page, /initialValues=\{values\}/);
  assert.match(page, /const closeEditor = \(\) => \{\s*form\.setFieldValue\('password', ''\);\s*close\(\);/);
  assert.match(page, /\{editor && <DeviceEditor/);
});

test('empty edit passwords are omitted; Go2 never submits ignored credentials', async () => {
  const lib = await api();
  assert.equal('password' in lib.deviceInput({ ...input, password: '' }), false);
  assert.equal(lib.deviceInput({ ...input, password: ' secret ' }).password, ' secret ');
  const go2 = lib.deviceInput({ ...input, kind: 'go2', username: 'ignored', password: 'ignored' });
  assert.equal('password' in go2, false);
  assert.equal('username' in go2, false);
  assert.equal('rtspPath' in go2, false);
  const page = read('../pages/DeviceBridgesPage.tsx');
  assert.match(page, /form\.setFieldValue\('password', ''\)/);
  assert.match(page, /kind !== 'go2' && <>/);
});

test('validation rejects illegal targets, ranges, credential paths and incorrect LocalAP hosts', async () => {
  const lib = await api();
  assert.deepEqual(plain(lib.validateDeviceInput(input)), {});
  for (const [field, value] of [['name', ' '], ['host', 'rtsp://user:pass@host'], ['host', 'host/path'], ['port', 0], ['port', 65536], ['channel', 257], ['channel', 1.5], ['rtspPath', 'rtsp://host/live'], ['rtspPath', '/live?password=secret']]) {
    assert.ok(lib.validateDeviceInput({ ...input, [field]: value })[field], `${field}: ${value}`);
  }
  assert.ok(lib.validateDeviceInput({ ...input, kind: 'go2', go2Mode: 'LocalAP' }).host);
  assert.deepEqual(plain(lib.validateDeviceInput({ ...input, kind: 'go2', go2Mode: 'LocalAP', host: '192.168.12.1' })), {});
});

test('freshness requires real online frame metadata with a ten second age limit', async () => {
  const lib = await api();
  const now = Date.now();
  const device = { online: true, status: 'online', frameCount: 10, lastFrameAt: new Date(now - 1000).toISOString() };
  assert.equal(lib.hasFreshFrame(device, now), true);
  assert.equal(lib.hasFreshFrame({ ...device, lastFrameAt: now / 1000 - 1 }, now), true);
  for (const change of [{ online: false }, { status: 'stopped' }, { frameCount: 0 }, { lastFrameAt: null }, { lastFrameAt: 'invalid' }, { lastFrameAt: new Date(now - 30000).toISOString() }]) {
    assert.equal(lib.hasFreshFrame({ ...device, ...change }, now), false);
  }
});

test('bindings accept exactly sixteen nullable nonempty IDs', async () => {
  const lib = await api();
  const bindings = Array(16).fill(null);
  bindings[15] = 'bridge-16';
  assert.deepEqual(plain(lib.validateBindings(bindings)), bindings);
  for (const invalid of [[], Array(16).fill(''), Array(16).fill(1)]) assert.throws(() => lib.validateBindings(invalid));
});

test('requests carry cookie credentials and memory token headers, never URL secrets', async (t) => {
  const lib = await api('/custom/api/');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(url.endsWith('/session') ? { authorized: true, expiresIn: 3600 } : { device: { id: 'test' } }));
  });
  await lib.createBridgeSession('private-token');
  await lib.saveBridge({ ...input, password: '' }, 'test');
  assert.equal(calls[0].url, '/custom/api/device-bridges/session');
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(JSON.parse(calls[1].init.body).password, undefined);
  for (const { url, init } of calls) {
    assert.equal(init.credentials, 'include');
    assert.equal(new Headers(init.headers).get('X-Admin-Token'), 'private-token');
    assert.ok(init.signal instanceof AbortSignal);
    assert.doesNotMatch(url, /private-token/);
  }
  assert.equal(lib.bridgeMediaUrl('a/b', 'feed'), '/custom/api/device-bridges/a%2Fb/feed');
  assert.equal(lib.bridgeMediaUrl('a', 'snapshot'), '/custom/api/device-bridges/a/snapshot');
  assert.doesNotMatch(read('./device-bridges-api.ts'), /localStorage|sessionStorage/);
});

test('401 clears the token, and lock deletes the preview session and forgets credentials', async (t) => {
  const lib = await api();
  let fail = false;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(fail ? { detail: 'Unauthorized' } : { authorized: true, expiresIn: 3600 }), { status: fail ? 401 : 200 });
  });
  await lib.createBridgeSession('private-token');
  fail = true;
  await assert.rejects(lib.bridgeRequest('/auth'), (error) => error instanceof lib.BridgeApiError && error.status === 401);
  fail = false;
  await lib.bridgeRequest('/auth');
  assert.equal(new Headers(calls.at(-1).init.headers).has('X-Admin-Token'), false);
  await lib.createBridgeSession('private-token');
  await lib.closeBridgeSession();
  assert.equal(calls.at(-1).init.method, 'DELETE');
  await lib.bridgeRequest('/auth');
  assert.equal(new Headers(calls.at(-1).init.headers).has('X-Admin-Token'), false);
});

test('API uses the same-origin default and permits backend diagnostics plus cleanup within twenty seconds', async (t) => {
  const lib = await api();
  const delays = [];
  const urls = [];
  const original = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, delay, ...args) => {
    delays.push(delay);
    return original(fn, delay, ...args);
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({ ok: false, device: {}, checks: [] }));
  });
  await lib.bridgeRequest('/auth');
  const result = await lib.testBridge('test');
  assert.deepEqual(plain(result), { ok: false, device: {}, checks: [] }, 'failed diagnostics must return their server result');
  assert.deepEqual(delays, [20000, 20000]);
  assert.equal(urls[0], '/api/device-bridges/auth');
});

test('cancelled session creation cannot restore an in-memory token', async (t) => {
  const lib = await api();
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => {
    controller.abort();
    return new Response(JSON.stringify({ authorized: true, expiresIn: 3600 }));
  });
  await assert.rejects(lib.createBridgeSession('cancelled-token', controller.signal), (error) => error.name === 'AbortError');
  let headers;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    headers = new Headers(init.headers);
    return new Response('{}');
  });
  await lib.bridgeRequest('/auth');
  assert.equal(headers.has('X-Admin-Token'), false);
});

test('invalid session authorization or lifetime never stores a new token', async (t) => {
  for (const payload of [{ authorized: false, expiresIn: 3600 }, { authorized: true }, { authorized: true, expiresIn: 0 }, { authorized: true, expiresIn: -1 }]) {
    const lib = await api();
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload)));
    await assert.rejects(lib.createBridgeSession('invalid-token'), (error) => error instanceof lib.BridgeApiError);
    let headers;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      headers = new Headers(init.headers);
      return new Response('{}');
    });
    await lib.bridgeRequest('/auth');
    assert.equal(headers.has('X-Admin-Token'), false);
  }
});

test('transient renewal failure keeps the header token for a successful retry', async (t) => {
  const lib = await api();
  let failure = false;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(new Headers(init.headers));
    return new Response(JSON.stringify(failure ? { detail: 'Temporarily unavailable' } : { authorized: true, expiresIn: 600 }), { status: failure ? 503 : 200 });
  });
  await lib.createBridgeSession('renewable-token');
  failure = true;
  await assert.rejects(lib.createBridgeSession(), (error) => error.status === 503);
  failure = false;
  assert.equal(await lib.createBridgeSession(), 600);
  assert.equal(calls.at(-1).get('X-Admin-Token'), 'renewable-token');
  assert.equal(lib.bridgeSessionRenewAt(600, 1000), 301000);
});

test('preview sessions renew halfway through their declared lifetime and reconnect media', async (t) => {
  const lib = await api();
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ authorized: true, expiresIn: 3600 })));
  assert.equal(await lib.createBridgeSession('private-token'), 3600);
  assert.equal(lib.bridgeSessionRenewAt(3600, 1000), 1801000);
  const source = read('./device-bridges-api.ts');
  assert.match(source, /Date\.now\(\) >= sessionRenewAt\.current/);
  assert.match(source, /sessionRenewAt\.current = bridgeSessionRenewAt\(expiresIn\)/);
  assert.match(source, /setPreviewEpoch\(\(value\) => value \+ 1\)/);
  assert.equal(lib.bridgeStageLabel('network'), '网络连接');
  assert.equal(lib.bridgeStageLabel('auth'), '设备认证');
  assert.equal(lib.bridgeStageLabel('decode'), '视频解码');
});

test('changed source identities invalidate preview keys and do not change feed URLs on failure', async () => {
  const lib = await api();
  const device = { ...input, id: 'source-1', updatedAt: 'first', hasPassword: true };
  for (const change of [{ id: 'source-2' }, { host: '192.0.2.9' }, { rtspPath: '/other' }, { updatedAt: 'changed' }]) {
    assert.notEqual(lib.bridgeSourceKey(device), lib.bridgeSourceKey({ ...device, ...change }));
  }
  const preview = read('../components/BridgePreview.tsx');
  assert.match(preview, /onError=/);
  assert.match(preview, /setFailedAt\(device\.frameCount\)/);
  assert.match(preview, /showImage && device && <img/);
  assert.doesNotMatch(preview, /crossOrigin="anonymous"|\.png|\.jpg|token=/);
});

test('polling schedules only after settlement and supports abort cleanup', () => {
  const source = read('./device-bridges-api.ts');
  assert.match(source, /finally \{[\s\S]*timer = setTimeout\(poll, 3000\)/);
  assert.match(source, /clearTimeout\(timer\); pollController\.current\?\.abort\(\)/);
  assert.doesNotMatch(source, /setInterval\(.*(?:poll|getBridgeInventory|bridgeRequest)/);
});

test('sixteen snapshots share at most three requests without queuing inventory behind the wall', async (t) => {
  const lib = await api();
  assert.equal(typeof lib.requestBridgeSnapshot, 'function');
  let active = 0;
  let maximum = 0;
  const pending = [];
  const snapshotCalls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!url.endsWith('/snapshot')) return new Response('{}');
    snapshotCalls.push({ url, init });
    active += 1;
    maximum = Math.max(maximum, active);
    return new Promise((resolve) => pending.push(() => {
      active -= 1;
      resolve(new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'Content-Type': 'image/jpeg' } }));
    }));
  });
  const snapshots = Array.from({ length: 16 }, (_, index) => lib.requestBridgeSnapshot(`device-${index}`));
  await new Promise(setImmediate);
  assert.equal(snapshotCalls.length, 3);
  await lib.bridgeRequest('/auth');
  for (let index = 0; index < 16; index += 1) {
    assert.ok(pending.length, 'queued snapshots should progress after each completed request');
    pending.shift()();
    await new Promise(setImmediate);
  }
  const images = await Promise.all(snapshots);
  assert.equal(images.length, 16);
  assert.equal(maximum, 3);
  assert.ok(images.every((image) => image.type === 'image/jpeg' && image.size > 0));
  assert.ok(snapshotCalls.every(({ init }) => init.credentials === 'include' && init.cache === 'no-store'));
});

test('cancelled queued snapshots never fetch and active aborts release their slots', async (t) => {
  const lib = await api();
  assert.equal(typeof lib.requestBridgeSnapshot, 'function');
  const calls = [];
  t.mock.method(globalThis, 'fetch', (url, init) => {
    calls.push(url);
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  });
  const controllers = Array.from({ length: 5 }, () => new AbortController());
  const requests = controllers.map((controller, index) => lib.requestBridgeSnapshot(`device-${index}`, controller.signal));
  const completion = Promise.allSettled(requests);
  await new Promise(setImmediate);
  assert.equal(calls.length, 3);
  controllers[3].abort();
  await assert.rejects(requests[3], (error) => error.name === 'AbortError');
  controllers[0].abort();
  await new Promise(setImmediate);
  assert.equal(calls.length, 4);
  assert.ok(calls.at(-1).endsWith('/device-4/snapshot'));
  controllers.forEach((controller) => controller.abort());
  assert.ok((await completion).every((result) => result.status === 'rejected'));
});

test('snapshot three-second timeout includes the response body and releases the queue', async (t) => {
  const lib = await api();
  assert.equal(typeof lib.requestBridgeSnapshot, 'function');
  let expire;
  const original = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    if (delay === 3000) { expire = callback; return 0; }
    return original(callback, delay, ...args);
  });
  t.mock.method(globalThis, 'fetch', async (_url, init) => ({
    ok: true, status: 200, headers: new Headers({ 'Content-Type': 'image/jpeg' }),
    blob: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })),
  }));
  const request = lib.requestBridgeSnapshot('slow-device');
  await new Promise(setImmediate);
  assert.equal(typeof expire, 'function');
  expire();
  await assert.rejects(request, (error) => error.status === 408);
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'Content-Type': 'image/jpeg' } }));
  assert.equal((await lib.requestBridgeSnapshot('next-device')).size, 4);
});

test('compact previews use cancellable snapshots with object URL cleanup, not MJPEG', () => {
  const preview = read('../components/BridgePreview.tsx');
  assert.match(preview, /props\.compact \? <SnapshotSource/);
  assert.match(preview, /requestBridgeSnapshot\(/);
  assert.match(preview, /setTimeout\(load, 500\)/);
  assert.match(preview, /URL\.revokeObjectURL\(/);
  assert.match(preview, /controller\.abort\(\)/);
  assert.match(preview, /hasFreshFrame\(/);
  assert.match(preview, /now - receivedAt <= 10000/);
});

test('inventory accepts USB and HTTP access methods while legacy records omit new fields', async (t) => {
  const lib = await api();
  assert.equal(lib.bridgeKindLabels.usb, 'USB 摄像头');
  assert.equal(lib.bridgeKindLabels.http_snapshot, 'HTTP 快照');
  assert.equal(lib.bridgeKindLabels.http_mjpeg, 'HTTP MJPEG');
  const items = ['go2', 'hikvision', 'dahua', 'rtsp', 'usb', 'http_snapshot', 'http_mjpeg']
    .map((kind) => ({ ...input, id: kind, kind, status: 'stopped' }));
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    items, bindings: Array(16).fill(null), runtime: { av: true, opencv: true, go2: false, running: 0, maxDevices: 16 },
  })));
  assert.equal((await lib.getBridgeInventory()).items.length, 7);
});

test('USB validates its zero-based device index without network or RTSP fields', async () => {
  const lib = await api();
  const usb = { ...input, kind: 'usb', host: '', rtspPath: '', usbIndex: 0 };
  assert.deepEqual(plain(lib.validateDeviceInput(usb)), {});
  assert.deepEqual(plain(lib.validateDeviceInput({ ...usb, usbIndex: undefined })), {});
  assert.deepEqual(plain(lib.validateDeviceInput({ ...usb, usbIndex: 15 })), {});
  for (const usbIndex of [-1, 16, 0.5, '1', null]) assert.ok(lib.validateDeviceInput({ ...usb, usbIndex }).usbIndex);
  const clean = lib.deviceInput({ ...usb, host: 'discarded', port: 80, username: 'discarded', password: 'discarded', httpPath: '/discarded', rtspPath: '/discarded' });
  assert.equal(clean.host, '');
  assert.equal(clean.port, 554);
  assert.equal(clean.usbIndex, 0);
  for (const field of ['username', 'password', 'rtspPath', 'httpPath', 'httpScheme']) assert.equal(field in clean, false, field);
});

test('HTTP kinds validate separate scheme host port and credential-free paths', async () => {
  const lib = await api();
  for (const kind of ['http_snapshot', 'http_mjpeg']) {
    const camera = { ...input, kind, port: 80, rtspPath: '', httpScheme: 'http', httpPath: '/camera?channel=2' };
    assert.deepEqual(plain(lib.validateDeviceInput(camera)), {});
    assert.deepEqual(plain(lib.validateDeviceInput({ ...camera, httpScheme: undefined })), {});
    assert.deepEqual(plain(lib.validateDeviceInput({ ...camera, httpScheme: 'https', port: 443 })), {});
    assert.ok(lib.validateDeviceInput({ ...camera, httpScheme: 'ftp' }).httpScheme);
    for (const host of ['', 'http://camera', 'user:secret@camera', 'camera:80']) assert.ok(lib.validateDeviceInput({ ...camera, host }).host);
    for (const port of [0, 65536, 1.5]) assert.ok(lib.validateDeviceInput({ ...camera, port }).port);
    for (const httpPath of ['', 'camera.jpg', '//other/path', 'https://other/path', '/image#fragment', '/image?password=secret', '/image?api_key=secret', '/image?user%6Eame=reader', '/image%3Ftoken%3Dsecret', '/image?authorization=secret', '/image\\other', '/image%0a']) {
      assert.ok(lib.validateDeviceInput({ ...camera, httpPath }).httpPath, `${kind}: ${httpPath}`);
    }
    const clean = lib.deviceInput({ ...camera, password: ' new secret ', usbIndex: 7, rtspPath: '/discarded' });
    assert.equal(clean.httpScheme, 'http');
    assert.equal(clean.httpPath, '/camera?channel=2');
    assert.equal(clean.password, ' new secret ');
    assert.equal('usbIndex' in clean, false);
    assert.equal('rtspPath' in clean, false);
  }
});

test('mode transitions reset discarded credentials and choose protocol defaults', async () => {
  const lib = await api();
  assert.equal(typeof lib.bridgeModeFields, 'function');
  const source = { ...input, username: 'reader', password: 'discarded-secret', httpPath: '/old', httpScheme: 'http' };
  const http = { ...source, kind: 'http_snapshot', ...lib.bridgeModeFields({ ...source, kind: 'http_snapshot' }, { kind: 'http_snapshot' }) };
  assert.equal(http.port, 80);
  assert.equal(http.password, '');
  assert.equal(http.username, '');
  assert.equal(http.rtspPath, '');
  assert.equal(lib.bridgeModeFields({ ...http, httpScheme: 'https' }, { httpScheme: 'https' }).port, 443);
  assert.equal(lib.bridgeModeFields(http, { httpScheme: 'http' }).port, 80);
  assert.equal(lib.bridgeModeFields({ ...http, kind: 'http_mjpeg', httpScheme: 'https' }, { kind: 'http_mjpeg' }).port, 443);
  const usb = lib.bridgeModeFields({ ...http, kind: 'usb' }, { kind: 'usb' });
  assert.equal(usb.host, '');
  assert.equal(usb.usbIndex, 0);
  assert.equal(usb.httpPath, '');
  assert.equal(usb.password, '');
  const rtsp = lib.bridgeModeFields({ ...http, kind: 'hikvision' }, { kind: 'hikvision' });
  assert.equal(rtsp.port, 554);
  assert.equal(rtsp.rtspPath, '/Streaming/Channels/101');
  assert.equal(rtsp.httpPath, '');
  assert.equal(rtsp.password, '');
  const go2 = lib.bridgeModeFields({ ...http, kind: 'go2', go2Mode: 'LocalAP' }, { kind: 'go2' });
  assert.equal(go2.host, '192.168.12.1');
  assert.equal(go2.password, '');
  assert.deepEqual(plain(lib.bridgeModeFields(source, { name: 'renamed' })), {});
});

test('same-kind blank passwords preserve credentials but changing network kind clears old secrets', async (t) => {
  const lib = await api();
  const http = { ...input, kind: 'http_snapshot', httpPath: '/image', password: '' };
  assert.equal('password' in lib.deviceInput(http, 'http_snapshot'), false);
  assert.equal(lib.deviceInput(http, 'rtsp').password, '');
  assert.equal(lib.deviceInput({ ...http, password: 'replacement' }, 'rtsp').password, 'replacement');
  let body;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ device: { id: 'same-id' } }));
  });
  await lib.saveBridge(http, 'same-id', undefined, 'rtsp');
  assert.equal(body.password, '');
  const go2 = lib.deviceInput({ ...input, kind: 'go2', httpPath: '/discarded', usbIndex: 4, password: 'discarded' });
  for (const field of ['password', 'username', 'httpPath', 'httpScheme', 'usbIndex', 'rtspPath']) assert.equal(field in go2, false);
});

test('new source parameters invalidate previews and USB addresses never look like network endpoints', async () => {
  const lib = await api();
  const device = { ...input, id: 'camera', kind: 'http_snapshot', updatedAt: 'unchanged', httpScheme: 'http', httpPath: '/image', usbIndex: 0 };
  for (const patch of [{ httpScheme: 'https' }, { httpPath: '/other' }, { usbIndex: 1 }]) {
    assert.notEqual(lib.bridgeSourceKey(device), lib.bridgeSourceKey({ ...device, ...patch }));
  }
  assert.equal(typeof lib.bridgeDeviceAddress, 'function');
  assert.equal(lib.bridgeDeviceAddress({ ...input, kind: 'usb', usbIndex: 3 }), 'USB #3');
  assert.equal(lib.bridgeDeviceAddress({ ...input, kind: 'usb' }), 'USB #0');
  assert.equal(lib.bridgeDeviceAddress({ ...device, port: 80 }), 'http://192.0.2.2:80');
  assert.equal(lib.bridgeDeviceAddress({ ...input, host: '::1' }), '[::1]:554');
});

test('editor shows type-specific USB and HTTP fields without automatic device activation', () => {
  const page = read('../pages/DeviceBridgesPage.tsx');
  assert.ok(page.includes('name="usbIndex"'));
  assert.ok(page.includes('name="httpScheme"'));
  assert.ok(page.includes('name="httpPath"'));
  assert.ok(page.includes("kind !== 'usb' &&"));
  assert.ok(page.includes('isRtspBridge(kind) &&'));
  assert.ok(page.includes('isHttpBridge(kind) &&'));
  assert.ok(page.includes('bridgeModeFields(all, changed)'));
  assert.ok(page.includes('bridgeDeviceAddress(device)'));
  assert.ok(page.includes("kind === device?.kind"));
  assert.doesNotMatch(page, /getUserMedia|enumerateDevices|navigator\.mediaDevices/);
});

test('HTTP diagnostics redact URL credentials just like RTSP diagnostics', async () => {
  const lib = await api();
  for (const protocol of ['http', 'https', 'rtsp', 'rtsps']) {
    assert.doesNotMatch(lib.redactBridgeMessage(`${protocol}://reader:private-password@192.0.2.2/image`), /reader|private-password/);
  }
});
