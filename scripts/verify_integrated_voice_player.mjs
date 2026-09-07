import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(new URL('../tmp/command-test-runtime/package.json', import.meta.url))('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/public-security/' });
for (const key of ['window', 'document', 'HTMLElement', 'Node']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const players = [];
let rejectPlayback = false;
globalThis.Audio = class {
  constructor(src) { this.src = src; players.push(this); }
  play() { return rejectPlayback ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
  pause() { this.paused = true; }
};

test('shared player is opt-in, fixed Yaoyao, deduplicated, cancellable and failure-safe', async () => {
  const path = new URL('../apps/dashboard/src/components/XiaoanVoice.tsx', import.meta.url);
  assert.ok(existsSync(path), 'shared voice component must exist');
  const built = buildSync({
    entryPoints: [fileURLToPath(path)], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', 'lucide-react'], loader: { '.css': 'empty' },
    define: { 'import.meta.env.BASE_URL': '"/public-security/"' },
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports);
  const { XiaoanVoiceProvider, useXiaoanVoice } = mod.exports;
  let voice;
  function Probe() { voice = useXiaoanVoice(); return React.createElement('span', {}, String(voice.enabled)); }
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(XiaoanVoiceProvider, {}, React.createElement(Probe))));
  assert.equal(await voice.speak('portrait-ready', 'a1:0'), false);
  assert.equal(players.length, 0);
  await React.act(async () => voice.setEnabled(true));
  let playback;
  await React.act(async () => { playback = voice.speak('portrait-ready', 'a1:1'); });
  assert.match(players.at(-1).src, /public-security\/command\/voice\/yaoyao\/portrait-ready.wav$/);
  assert.equal(players.at(-1).playbackRate, 1.1);
  assert.equal(await voice.speak('portrait-ready', 'a1:1'), false);
  await React.act(async () => players.at(-1).onended());
  assert.equal(await playback, true);
  await React.act(async () => { playback = voice.speak('training-passed', 'a3:1'); });
  await React.act(async () => voice.stop());
  assert.equal(players.at(-1).paused, true);
  assert.equal(await playback, false);
  assert.equal(voice.enabled, true, 'stopping on navigation preserves opt-in');
  rejectPlayback = true;
  await React.act(async () => { playback = voice.speak('portrait-ready', 'a1:2'); });
  assert.equal(await playback, false);
  assert.match(voice.error, /未能播放/);
  rejectPlayback = false;
  await React.act(async () => { playback = voice.speak('portrait-ready', 'a1:3'); });
  await React.act(async () => voice.setEnabled(false));
  assert.equal(await playback, false);
  assert.equal(players.at(-1).paused, true);
  await React.act(async () => root.unmount());
});
