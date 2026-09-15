import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relativePath) {
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    bundle: true, write: false, format: 'cjs', platform: 'node',
    packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
    define: { 'import.meta.env.BASE_URL': '"/"' },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${outputFiles[0].text}\n})`)(require, module, module.exports);
  return module.exports;
}

test('only non-victim head boxes expose an identity menu', () => {
  const { ContactPersonAnnotations } = load('../components/ContactPersonAnnotations.tsx');
  const { contactAnnotations } = load('./contact-inspection.ts');
  const html = renderToStaticMarkup(React.createElement(ContactPersonAnnotations, {
    annotations: contactAnnotations['CR-020'], selectedId: '01', panelId: 'identity',
    onSelect() {}, onRoleChange() {},
  }));
  assert.equal((html.match(/class="cr-person-box /g) ?? []).length, 6);
  assert.equal((html.match(/aria-haspopup="menu"/g) ?? []).length, 5);
  assert.equal((html.match(/role-auto/g) ?? []).length, 5);
  const victim = html.match(/<button[^>]*data-annotation-id="01"[^>]*>/)?.[0];
  assert.ok(victim);
  assert.match(victim, /role-victim/);
  assert.doesNotMatch(victim, /aria-haspopup|aria-expanded/);
  assert.doesNotMatch(html, /role="menu"/, 'picker is initially closed');
});
