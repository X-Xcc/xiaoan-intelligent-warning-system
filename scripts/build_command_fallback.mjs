import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'deliverables/command/fallback');
const result = buildSync({
  stdin: { contents: `export { CommandStageView } from './apps/dashboard/src/components/command/CommandStageView';
export { playbackSnapshot } from './apps/dashboard/src/lib/command-scenario';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom'],
  define: { 'import.meta.env.BASE_URL': '"/"' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { CommandStageView, playbackSnapshot } = module.exports;
const css = fs.readFileSync(path.join(root, 'apps/dashboard/src/styles/command.css'), 'utf8');
fs.mkdirSync(output, { recursive: true });
for (const stage of ['b1', 'b2', 'b3', 'b4', 'handover']) {
  let content = renderToStaticMarkup(React.createElement(CommandStageView, {
    snapshot: playbackSnapshot(), stage, reveal: 3, display: true, playback: true,
  }));
  for (const filename of fs.readdirSync(path.join(root, 'apps/dashboard/public/command')).filter((name) => name.endsWith('.png'))) {
    content = content.replaceAll(`/command/${filename}`, `data:image/png;base64,${fs.readFileSync(path.join(root, 'apps/dashboard/public/command', filename)).toString('base64')}`);
  }
  fs.writeFileSync(path.join(output, `${stage}.html`), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>小安 ${stage.toUpperCase()} 教学备用页</title>
<style>body{margin:0;background:#0c447c;font-family:"Microsoft YaHei",sans-serif} ${css}</style></head>
<body><main class="command-display-shell">${content}</main></body></html>`);
}
console.log(`Exported 5 offline HTML pages from the shared React stage component: ${output}`);
