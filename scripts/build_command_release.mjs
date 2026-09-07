import { build } from 'esbuild';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dashboardRequire = createRequire(path.join(root, 'apps/dashboard/package.json'));
const out = path.join(root, 'deliverables/command/server-release');
await mkdir(out, { recursive: true });
const built = await build({
  absWorkingDir: root, entryPoints: ['apps/dashboard/src/command-release.tsx'],
  outdir: path.join(out, 'command-release-assets'), entryNames: '[name]-[hash]',
  bundle: true, minify: true, sourcemap: false, write: true, metafile: true,
  format: 'esm', target: ['es2022'], jsx: 'automatic',
  // Hoisted UI packages must share the dashboard renderer's React instance.
  alias: {
    react: path.dirname(dashboardRequire.resolve('react/package.json')),
    'react-dom': path.dirname(dashboardRequire.resolve('react-dom/package.json')),
  },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.BASE_URL': '"/public-security/"',
    'import.meta.env.DEV': 'false', 'import.meta.env.VITE_API_BASE_URL': '"/public-security/api"' },
});
const outputs = Object.keys(built.metafile.outputs);
const reactRoots = new Set(Object.keys(built.metafile.inputs)
  .filter((name) => /node_modules\/react\/(?:index|cjs\/react\.production)\.js$/.test(name))
  .map((name) => name.slice(0, name.lastIndexOf('/react/') + 7)));
if (reactRoots.size !== 1) throw new Error(`Expected one React instance, found ${reactRoots.size}`);
const js = outputs.find((name) => name.endsWith('.js'));
const css = outputs.find((name) => name.endsWith('.css'));
if (!js || !css) throw new Error('Missing release bundle');
await cp(path.join(root, 'apps/dashboard/public/command'), path.join(out, 'command'), { recursive: true });
await writeFile(path.join(out, 'command/index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>小安接处警 · 瑶瑶语音</title><link rel="stylesheet" href="/public-security/command-release-assets/${path.basename(css)}">
<script type="module" src="/public-security/command-release-assets/${path.basename(js)}"></script></head>
<body><div id="root"></div></body></html>`);
const backend = ['main.py', 'api/routes/command.py', 'api/routes/events.py', 'services/command_workflow.py',
  'services/models.py', 'services/event_store.py', 'services/realtime.py', 'services/security_linkage.py',
  'data/command/night_market_b1_b4_v1.json'];
for (const name of backend) {
  const to = path.join(out, 'backend/app', name);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(path.join(root, 'server/app', name), to);
}
const hashes = {};
const baseline = {};
for (const name of backend) hashes[name] = createHash('sha256').update(await readFile(path.join(out, 'backend/app', name))).digest('hex');
for (const name of backend) {
  try {
    baseline[name] = createHash('sha256').update(await readFile(path.join(root, 'tmp/command-release-baseline/app', name))).digest('hex');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    baseline[name] = null;
  }
}
await writeFile(path.join(out, 'backend-files.json'), JSON.stringify(hashes, null, 2));
await writeFile(path.join(out, 'backend-baseline.json'), JSON.stringify(baseline, null, 2));
await cp(path.join(root, 'scripts/deploy_command_release.py'), path.join(out, 'deploy_command_release.py'));
console.log(JSON.stringify({ out, js, css, backendFiles: backend.length }));
