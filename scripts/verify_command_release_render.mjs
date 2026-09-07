import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const { JSDOM, VirtualConsole } = createRequire(new URL('../tmp/command-test-runtime/package.json', import.meta.url))('jsdom');
const address = process.argv[2] || 'http://47.114.37.85:8080/public-security/command/';
const local = process.argv.includes('--local');
const html = local ? readFileSync(new URL('../deliverables/command/server-release/command/index.html', import.meta.url), 'utf8')
  : await (await fetch(address)).text();
const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
assert.ok(scriptPath, 'release HTML must reference a script');
const js = local ? readFileSync(new URL(`../deliverables/command/server-release/command-release-assets/${scriptPath.split('/').at(-1)}`, import.meta.url), 'utf8')
  : await (await fetch(new URL(scriptPath, address))).text();
const errors = [];
const console = new VirtualConsole();
console.on('jsdomError', (error) => errors.push(error.stack || String(error)));
console.on('error', (...args) => errors.push(args.map(String).join(' ')));
const dom = new JSDOM(html, { url: address, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.BroadcastChannel = class { postMessage() {} close() {} };
window.fetch = async (input, options) => {
  const path = new URL(String(input), address).pathname;
  if (path.endsWith('/command/config')) return { ok: true, json: async () => ({ demoEnabled: false }) };
  if (path.endsWith('/events/staff')) return { ok: true, json: async () => ({ items: [] }) };
  throw new Error(`Unexpected request from default playback: ${path}`);
};
window.AbortSignal.timeout = () => new window.AbortController().signal;
window.addEventListener('error', (event) => errors.push(event.error?.stack || event.message));
try {
  window.eval(js);
  for (let i = 0; i < 50 && !window.document.querySelector('.command-workbench') && !errors.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(errors, [], 'deployed bundle must execute without runtime errors');
  assert.ok(window.document.querySelector('.command-workbench'), 'workbench must mount');
  assert.match(window.document.querySelector('h1').textContent, /接处警/);
  assert.ok(window.document.querySelector('[aria-label="启用小安语音"]'));
  for (const stage of ['B2', 'B3', 'B4', '移交', 'B1']) {
    const button = [...window.document.querySelectorAll('nav[aria-label="屏台阶段"] button')].find((item) => item.textContent === stage);
    assert.ok(button, stage);
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(errors, [], `${stage} must render without runtime errors`);
    const expected = stage === '移交' ? 'handover' : stage.toLowerCase();
    assert.equal(window.document.querySelector('.command-stage').dataset.stage, expected);
  }
  process.stdout.write(JSON.stringify({ result: 'passed', mode: 'JSDOM exact release bundle execution',
    scriptPath, sha256: createHash('sha256').update(js).digest('hex'),
    stages: ['b1', 'b2', 'b3', 'b4', 'handover'], layoutVerified: false }) + '\n');
} finally { dom.window.close(); }
