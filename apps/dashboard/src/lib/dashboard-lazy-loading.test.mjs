import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToString } from 'react-dom/server';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const pages = {
  CommandOperationsPage: ['CommandOperationsPage'],
  AdminConsolePage: ['AdminConsolePage'],
  DeviceBridgesPage: ['DeviceBridgesPage'],
  PublicSecurityPlatformPage: ['PublicSecurityPlatformPage'],
  VideoLinkagePage: ['VideoLinkagePage'],
  NightMarketCommandPage: ['NightMarketCommandPage'],
  OfficerTrainingPage: ['OfficerTrainingPage'],
  ContactReviewPage: ['ContactReviewPage'],
  DutySituationPage: ['DutySituationPage'],
  PoliceDomainPages: ['AICenterPage', 'CommunityPolicingPage', 'CommandOperationsPage'],
};
const fixture = await build({
  absWorkingDir: root, entryPoints: ['src/pages/DashboardApp.tsx'],
  bundle: true, write: false, format: 'cjs', packages: 'external', jsx: 'automatic',
  define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: '/api', BASE_URL: '/' }) },
  plugins: [{
    name: 'isolate-page-loading',
    setup(builder) {
      builder.onResolve({ filter: /^\.\// }, args => {
        const name = args.path.slice(2);
        if (args.importer.endsWith('DashboardApp.tsx') && pages[name]) return { path: name, namespace: 'page' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'page' }, args => ({
        resolveDir: root,
        contents: `import React from 'react';
          globalThis.pageLoads.push(${JSON.stringify(args.path)});
          ${pages[args.path].map(name => `export function ${name}(props) {
            return React.createElement('section', { 'data-page': '${name}', 'data-gait': props.showGait });
          }`).join('\n')}`,
      }));
      builder.onResolve({ filter: /\/components\/Xiaoan(Voice|Assistant)$/ }, args => ({
        path: args.path, namespace: 'assistant',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'assistant' }, () => ({
        resolveDir: root,
        contents: `import React from 'react';
          const voice = { stop() {}, speak() {}, setEnabled() {} };
          export const useXiaoanVoice = () => voice;
          export const XiaoanVoiceControls = () => React.createElement('span', { 'data-voice': true });
          export const XiaoanAssistant = () => React.createElement('aside', { 'data-assistant': true });`,
      }));
    },
  }],
});

function dashboard(path = '/platform', search = '') {
  const pageLoads = [];
  const module = { exports: {} };
  const icon = props => React.createElement('i', props);
  const context = {
    module, exports: module.exports, pageLoads, URLSearchParams,
    window: { location: { pathname: path, search } },
    require(name) {
      if (name === 'lucide-react') return new Proxy({}, { get: () => icon });
      if (name === 'antd') return {
        Tooltip: ({ children }) => children,
        Spin: () => React.createElement('span'),
      };
      return require(name);
    },
  };
  vm.runInNewContext(fixture.outputFiles[0].text, context);
  return {
    pageLoads,
    render: () => renderToString(React.createElement(module.exports.DashboardApp)),
  };
}

test('initial overview evaluates no non-overview page modules', () => {
  const app = dashboard();
  assert.deepEqual(app.pageLoads, ['PublicSecurityPlatformPage']);
  assert.match(app.render(), /data-page="PublicSecurityPlatformPage"/);
  assert.deepEqual(app.pageLoads, ['PublicSecurityPlatformPage']);
});

const routes = [
  ['/command', 'PoliceDomainPages', 'CommandOperationsPage'],
  ['/command/workbench', 'CommandOperationsPage', 'CommandOperationsPage'],
  ['/command/workbench', 'CommandOperationsPage', 'CommandOperationsPage', '?surface=display'],
  ['/community', 'PoliceDomainPages', 'CommunityPolicingPage'],
  ['/ai-center', 'PoliceDomainPages', 'AICenterPage'],
  ['/admin', 'AdminConsolePage', 'AdminConsolePage'],
  ['/admin/bridges', 'DeviceBridgesPage', 'DeviceBridgesPage'],
  ['/video', 'VideoLinkagePage', 'VideoLinkagePage'],
  ['/night-market/command', 'NightMarketCommandPage', 'NightMarketCommandPage'],
  ['/duty-situation/training', 'OfficerTrainingPage', 'OfficerTrainingPage'],
  ['/duty-situation', 'DutySituationPage', 'DutySituationPage'],
  ['/contact-review', 'ContactReviewPage', 'ContactReviewPage'],
  ['/identity-search', 'ContactReviewPage', 'ContactReviewPage'],
];
for (const [path, moduleName, exportName, search] of routes) {
  test(`direct entry ${path}${search ?? ''} suspends safely and resolves the named page`, async () => {
    const app = dashboard(path, search);
    const pending = app.render();
    assert.match(pending, /role="status"/);
    assert.match(pending, /aria-busy="true"/);
    assert.match(pending, /data-assistant="true"/);
    if (['/command', '/community', '/ai-center', '/admin', '/admin/bridges', '/contact-review', '/identity-search'].includes(path)) {
      assert.match(pending, /platform-control-sidebar/);
      assert.match(pending, /data-voice="true"/);
    }
    await new Promise(setImmediate);
    const ready = app.render();
    assert.match(ready, new RegExp(`data-page="${exportName}"`));
    if (path === '/identity-search') assert.match(ready, /data-gait="true"/);
    assert.deepEqual(app.pageLoads, ['PublicSecurityPlatformPage', moduleName]);
  });
}

test('production import graph keeps non-overview pages outside the eager entry closure', async () => {
  const result = await build({
    absWorkingDir: root, entryPoints: ['src/main.tsx'], bundle: true, write: false,
    metafile: true, splitting: true, format: 'esm', outdir: 'audit-memory-only',
    packages: 'external', jsx: 'automatic', logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: '/api', BASE_URL: '/' }) },
    loader: { '.css': 'empty', '.wav': 'file', '.mp3': 'file', '.svg': 'file' },
  });
  const outputs = result.metafile.outputs;
  const entry = Object.keys(outputs).find(path => outputs[path].entryPoint === 'src/main.tsx');
  assert.ok(entry);
  const visited = new Set();
  function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    for (const dependency of outputs[path].imports) {
      if (!dependency.external && dependency.kind === 'import-statement') visit(dependency.path);
    }
  }
  visit(entry);
  const eagerInputs = [...visited].flatMap(path => Object.keys(outputs[path].inputs));
  assert.ok(eagerInputs.includes('src/pages/PublicSecurityPlatformPage.tsx'));
  for (const name of Object.keys(pages).filter(name => name !== 'PublicSecurityPlatformPage')) {
    assert.ok(!eagerInputs.includes(`src/pages/${name}.tsx`), `${name} is still eager`);
  }
  const source = fs.readFileSync(new URL('../pages/DashboardApp.tsx', import.meta.url), 'utf8');
  assert.match(source, /ContactReviewPage key="contact-review"/);
  assert.match(source, /ContactReviewPage key="identity-search"/);
});
