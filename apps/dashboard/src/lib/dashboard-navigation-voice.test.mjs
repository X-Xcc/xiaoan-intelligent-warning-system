import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function dashboard(initialPath = '/platform') {
  const slots = [];
  const effects = [];
  const listeners = new Map();
  let cursor = 0;
  let tree;
  const voice = {
    enabled: false, active: false, calls: [], stops: 0,
    setEnabled(value) { voice.enabled = value; },
    speak(cue, eventKey) {
      voice.calls.push({ cue, eventKey, enabled: voice.enabled });
      voice.active = voice.enabled;
      return Promise.resolve(voice.active);
    },
    stop() { voice.stops++; voice.active = false; },
  };
  const location = { pathname: initialPath, search: '' };
  const window = {
    location,
    history: { pushState(_state, _title, path) { location.pathname = path; } },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); },
    setInterval() { return 1; }, clearInterval() {}, scrollTo() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: effect() };
        });
      }
    },
    useMemo: callback => callback(),
    useCallback: callback => callback,
  };
  function load(relative) {
    const module = { exports: {} };
    const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
    const { code } = transformSync(source, {
      loader: 'tsx', format: 'cjs', jsx: 'automatic',
      define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: '/api', BASE_URL: '/' }) },
    });
    vm.runInNewContext(code, {
      module, exports: module.exports, window,
      URLSearchParams, PopStateEvent: class { constructor(type) { this.type = type; } },
      fetch: async () => ({ ok: true, json: async () => ({ stats: {}, events: [] }) }),
      require(name) {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
        if (name.endsWith('/XiaoanVoice')) return { useXiaoanVoice: () => voice };
        if (name.endsWith('/presentation')) return load('./presentation.ts');
        if (name.endsWith('/platform-overview')) return { normalizeLiveOverview: value => value };
        return {};
      },
    });
    return module.exports;
  }
  const { DashboardApp } = load('../pages/DashboardApp.tsx');
  function render() {
    cursor = 0;
    tree = DashboardApp();
    while (effects.length) effects.shift()();
  }
  const text = node => Array.isArray(node) ? node.map(text).join('')
    : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
  function find(node, label) {
    if (Array.isArray(node)) return node.map(child => find(child, label)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === 'button' && text(node) === label) return node;
    return find(node.props?.children, label);
  }
  render();
  return {
    voice, location,
    click(label) {
      const button = find(tree, label);
      assert.ok(button, `Missing button: ${label}`);
      button.props.onClick();
      render();
    },
    visit(path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent({ type: 'popstate' });
      render();
    },
  };
}

test('clicking dispatch enables and plays the alert without the route change stopping it', () => {
  const page = dashboard();
  assert.equal(page.voice.calls.length, 0);
  const stops = page.voice.stops;
  page.click('接处警系统');
  assert.equal(page.location.pathname, '/command');
  assert.equal(page.voice.calls.length, 1);
  assert.equal(page.voice.calls[0].cue, 'incident-arrival');
  assert.equal(page.voice.calls[0].enabled, true);
  assert.equal(page.voice.active, true);
  assert.equal(page.voice.stops, stops);
});

test('each dispatch click can replay, while other routes stop the alert without announcing it', () => {
  const page = dashboard();
  page.click('接处警系统');
  page.click('接处警系统');
  assert.equal(page.voice.calls.length, 2);
  assert.notEqual(page.voice.calls[0].eventKey, page.voice.calls[1].eventKey);
  page.click('平台总览');
  assert.equal(page.voice.calls.length, 2);
  assert.equal(page.voice.active, false);
});

test('loading the dispatch route without clicking does not announce an incident', () => {
  assert.equal(dashboard('/command').voice.calls.length, 0);
});

test('the navigation alert has the exact requested caption and a local WAV asset', () => {
  const source = fs.readFileSync(new URL('./xiaoan-voice-rules.ts', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports,
  });
  const text = '您有新的警情，请注意查收';
  assert.equal(module.exports.DOCUMENT_VOICE_CUES['incident-arrival'], text);
  const base = new URL('../../public/command/voice/yaoyao/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base), 'utf8'));
  assert.equal(manifest.cues.find(cue => cue.id === 'incident-arrival')?.text, text);
  const wav = fs.readFileSync(new URL('incident-arrival.wav', base));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.ok(wav.length > 1000);
});
