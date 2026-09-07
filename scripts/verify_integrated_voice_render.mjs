import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const { JSDOM, VirtualConsole } = createRequire(new URL('../tmp/command-test-runtime/package.json', import.meta.url))('jsdom');
const buildRoot = new URL('../tmp/integrated-voice-build/', import.meta.url);
const address = process.argv[2];
async function remoteText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  assert.equal(response.status, 200, `resource is available: ${url}`);
  return response.text();
}
const html = address ? await remoteText(address) : readFileSync(new URL('index.html', buildRoot), 'utf8');
const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
assert.ok(scriptPath);
const js = address ? await remoteText(new URL(scriptPath, address))
  : readFileSync(new URL(`assets/${scriptPath.split('/').at(-1)}`, buildRoot), 'utf8');
const errors = [];
const output = new VirtualConsole();
output.on('jsdomError', (error) => errors.push(error.stack || String(error)));
output.on('error', (...args) => errors.push(args.map(String).join(' ')));
const dom = new JSDOM(html, {
  url: address || 'http://localhost:5177/public-security/command/?v=render2',
  runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: output,
});
const { window } = dom;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.BroadcastChannel = class { postMessage() {} close() {} };
window.scrollTo = () => {};
const audio = [];
window.Audio = class {
  constructor(src) { this.src = src; audio.push(this); }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
};
window.fetch = async (input) => {
  const path = new URL(String(input), window.location.href).pathname;
  if (path.endsWith('/platform/overview')) return { ok: true, json: async () => ({ stats: {}, events: [] }) };
  if (path.endsWith('/training/tasks')) return { ok: true, json: async () => ({ dataMode: 'desensitized_sample', items: [] }) };
  return { ok: false, status: 503, json: async () => ({ detail: 'test offline fallback' }) };
};
const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
const click = async (selector) => {
  const node = window.document.querySelector(selector);
  assert.ok(node, selector);
  node.click();
  await wait();
};
try {
  window.eval(js);
  await wait(500);
  assert.deepEqual(errors, [], 'production entry renders without errors');
  assert.ok(window.document.querySelector('.platform-control-sidebar'));
  assert.ok(window.document.querySelector('.ops-capability-body'), 'original tools preserved');
  assert.equal(window.document.querySelector('.command-workbench'), null, 'standalone replacement is absent');
  await click('[aria-label="小安语音开关"]');
  assert.equal(audio.length, 0, 'enable does not fabricate a business event');
  const dutyLink = [...window.document.querySelectorAll('.platform-control-nav-item')]
    .find(button => button.textContent.includes('勤务态势'));
  assert.ok(dutyLink);
  dutyLink.click();
  await wait(300);
  assert.equal(window.document.querySelector('[aria-label="语音播报"]').checked, true, 'opt-in survives routing');
  await click('[aria-label="生成画像"]');
  assert.equal(audio.length, 1);
  assert.match(audio[0].src, /yaoyao\/portrait-ready.wav$/);
  assert.equal(window.document.querySelector('.duty-situation').dataset.phase, 'idle', 'wait for acknowledgement');
  audio[0].onended();
  await wait(100);
  assert.equal(window.document.querySelector('.duty-situation').dataset.phase, 'lead');
  await wait(550);
  assert.equal(window.document.querySelector('.duty-situation').dataset.phase, 'donut', 'visuals follow speech by 500ms');
  await click('[aria-label="重播画像"]');
  const cancelled = audio.at(-1);
  await click('[aria-label="返回平台总览"]');
  assert.equal(cancelled.paused, true, 'navigation stops stale acknowledgement');
  assert.equal(window.document.querySelector('[aria-label="小安语音开关"]').getAttribute('aria-checked'), 'true');
  assert.deepEqual(errors, []);
  if (address) {
    for (const cue of ['portrait-ready', 'training-passed']) {
      const response = await fetch(new URL(`/public-security/command/voice/yaoyao/${cue}.wav`, address),
        { signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', 'real WAV instead of HTML fallback');
      assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
      assert.ok(bytes.length > 1000);
      const local = readFileSync(new URL(`command/voice/yaoyao/${cue}.wav`, buildRoot));
      assert.deepEqual(bytes, local, 'published audio matches the selected Yaoyao clip');
    }
    for (const link of window.document.querySelectorAll('link[rel="stylesheet"]')) {
      const response = await fetch(new URL(link.href, address), { signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/css/);
    }
  }
  process.stdout.write(JSON.stringify({
    passed: true, originalCommand: true, originalNavigation: true, sharedVoice: true,
    a1Timing: true, navigationCancellation: true, scriptPath,
    sha256: createHash('sha256').update(js).digest('hex'), address: address || 'local-build',
    browserLayoutVerified: false,
  }) + '\n');
} finally { window.close(); }
