import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(new URL('../tmp/command-test-runtime/package.json', import.meta.url))('jsdom');
const dom = new JSDOM('<div id="root"></div><div id="second"></div>', { url: 'http://localhost/command' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'SVGElement', 'ShadowRoot', 'Node',
  'MutationObserver', 'Event', 'MouseEvent']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.getComputedStyle = (element) => dom.window.getComputedStyle(element);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
const React = require('react');
const { createRoot } = require('react-dom/client');
const built = buildSync({
  entryPoints: [fileURLToPath(new URL('../apps/dashboard/src/components/command/CommandVoice.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom', 'antd', 'lucide-react'], define: { 'import.meta.env.BASE_URL': '"/"' },
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports);
const players = [];
let blocked = false;
globalThis.Audio = class {
  constructor(src) { this.src = src; this.paused = false; players.push(this); }
  play() { this.paused = false; return blocked ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() {}
};
let held = false;
Object.defineProperty(navigator, 'locks', { configurable: true, value: {
  async request(name, options, callback) {
    assert.equal(name, 'cicsic-command-voice');
    if (held) return callback(null);
    held = true;
    try { await callback({ name }); } finally { held = false; }
  },
} });
function snapshot(id, version, status = '已提交') {
  return { event: { id, status }, command: { version, evidenceIndex: [] } };
}
const click = async (root, label) => React.act(async () => root.querySelector(`[aria-label="${label}"]`).click());
test('real voice controls: opt-in, exclusive owner, pause, stop, silent B4 and playback errors', async () => {
  const container = document.getElementById('root');
  const second = document.getElementById('second');
  const root = createRoot(container), other = createRoot(second);
  const props = { events: [], snapshot: null, stage: 'b1', playback: true, online: false };
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, props)));
  assert.equal(players.length, 0);
  await click(container, '启用小安语音');
  assert.match(players.at(-1).src, /yaoyao\/new-incident.wav$/);
  await React.act(async () => other.render(React.createElement(mod.exports.CommandVoice, props)));
  const count = players.length;
  await click(second, '启用小安语音');
  assert.equal(players.length, count);
  assert.match(second.textContent, /另一个工作台/);
  await click(container, '暂停播报');
  assert.equal(players.at(-1).paused, true);
  await click(container, '继续播报');
  assert.equal(players.at(-1).paused, false);
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, { ...props, stage: 'b4' })));
  assert.equal(players.at(-1).paused, true);
  assert.equal(players.length, count);
  assert.equal(container.querySelector('[aria-label="重播小安语音"]').disabled, true);
  blocked = true;
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, { ...props, stage: 'b2' })));
  assert.match(container.textContent, /未能播放/);
  blocked = false;
  await click(container, '重播小安语音');
  assert.match(players.at(-1).src, /dispatch-sent.wav$/);
  await click(container, '停止当前播报');
  assert.equal(players.at(-1).paused, true);
  await React.act(async () => root.unmount());
  assert.equal(held, false);
  await click(second, '启用小安语音');
  assert.equal(held, true);
  await React.act(async () => other.unmount());
  assert.equal(held, false);
});
test('business updates do not repeat; switching events stops speech but retains opt-in', async () => {
  const container = document.getElementById('root');
  const root = createRoot(container);
  let props = { events: [{ id: 'a', status: '已提交' }], snapshot: snapshot('a', 1), eventId: 'a',
    stage: 'b2', playback: false, online: true };
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, props)));
  const count = players.length;
  await click(container, '启用小安语音');
  assert.equal(players.length, count);
  props = { ...props, snapshot: snapshot('a', 2) };
  props.snapshot.command.dispatch = { dispatchedAt: 'now' };
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, props)));
  assert.equal(players.length, count + 1);
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, structuredClone(props))));
  assert.equal(players.length, count + 1);
  props = { ...props, snapshot: snapshot('b', 5), eventId: 'b' };
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, props)));
  assert.equal(players.at(-1).paused, true);
  assert.equal(container.querySelector('[aria-label="启用小安语音"]').getAttribute('aria-checked'), 'true');
  assert.equal(players.length, count + 1);
  props = { ...props, snapshot: snapshot('b', 6, '已到达') };
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, props)));
  assert.match(players.at(-1).src, /field-arrived.wav$/);
  await React.act(async () => window.dispatchEvent(new window.Event('pagehide')));
  assert.equal(players.at(-1).paused, true);
  assert.equal(held, false);
  await React.act(async () => root.unmount());
});
test('new queue arrivals play once while first synchronization stays silent', async () => {
  const container = document.getElementById('root');
  const root = createRoot(container);
  let props = { events: [], snapshot: null, stage: 'b1', playback: false, online: false };
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, props)));
  await click(container, '启用小安语音');
  const count = players.length;
  props = { ...props, online: true, events: [{ id: 'old', status: '已提交' }] };
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, props)));
  assert.equal(players.length, count);
  props = { ...props, events: [...props.events, { id: 'new', status: '已提交' }] };
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, props)));
  assert.equal(players.length, count + 1);
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice, structuredClone(props))));
  assert.equal(players.length, count + 1);
  await React.act(async () => root.unmount());
});
test('HTTP without Web Locks can play and yields when another window claims voice', async () => {
  const saved = navigator.locks;
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  const channels = [];
  const Original = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = class {
    constructor() { channels.push(this); }
    postMessage(message) { this.lastMessage = message; }
    close() {}
  };
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(mod.exports.CommandVoice,
    { events: [], snapshot: null, stage: 'b1', playback: true, online: false })));
  const count = players.length;
  await click(document.getElementById('root'), '启用小安语音');
  assert.equal(players.length, count + 1);
  assert.deepEqual(channels[0].lastMessage, { type: 'claim' });
  await React.act(async () => channels[0].onmessage({ data: { type: 'claim' } }));
  assert.equal(players.at(-1).paused, true);
  await React.act(async () => root.unmount());
  Object.defineProperty(navigator, 'locks', { configurable: true, value: saved });
  globalThis.BroadcastChannel = Original;
  dom.window.close();
});
