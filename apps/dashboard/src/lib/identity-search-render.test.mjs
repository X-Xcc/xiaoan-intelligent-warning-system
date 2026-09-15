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

const { identitySearchRecords } = load('./contact-review.ts');
const { ContactReviewPage } = load('../pages/ContactReviewPage.tsx');

test('identity search offers three unchecked appearance options and one primary screening action', () => {
  const html = renderToStaticMarkup(React.createElement(ContactReviewPage, { showGait: true, onBack() {} }));
  const checkboxes = html.match(/<input\b[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.equal(checkboxes.length, 3, 'Expected three appearance checkboxes');
  assert.ok(checkboxes.every(input => !input.includes('checked')));
  for (const label of ['面部未遮挡', '未佩戴眼镜', '未佩戴帽子']) {
    assert.ok(html.includes(label), `Missing appearance option: ${label}`);
  }
  const screeningButtons = html.match(/<button\b[^>]*aria-label="筛查"[^>]*>/g) ?? [];
  assert.equal(screeningButtons.length, 1, 'Expected one screening action');
  assert.ok(screeningButtons[0].includes('primary'), 'Screening must use the blue primary button');
  assert.ok(screeningButtons[0].includes('type="submit"'));
  assert.ok(!screeningButtons[0].includes('aria-haspopup'), 'Screening updates the gallery without opening a popup');
  assert.ok(!html.includes('重新检索'));
  assert.equal((html.match(/role="listitem"/g) ?? []).length, identitySearchRecords.length);
  assert.ok(!html.includes('identity-screening-demo.jpg'), 'Demo image should load only when opened');
});

test('video screening does not expose identity appearance demo controls', () => {
  const html = renderToStaticMarkup(React.createElement(ContactReviewPage, { onBack() {} }));
  assert.ok(!html.includes('type="checkbox"'));
  assert.ok(!html.includes('aria-label="筛查"'));
  assert.ok(!html.includes('identity-screening-demo.jpg'));
  assert.ok(html.includes('筛选记录'));
});

test('identity search displays every approved AI person photo on first render', () => {
  const html = renderToStaticMarkup(React.createElement(ContactReviewPage, { showGait: true, onBack() {} }));
  assert.equal((html.match(/role="listitem"/g) ?? []).length, identitySearchRecords.length);
  for (const record of identitySearchRecords) {
    const preview = record.thumbnailPath ?? record.assetPath.replace(/\.png$/, '.thumb.webp');
    assert.ok(html.includes(`src="${preview}"`), `Missing initial photo: ${record.assetPath}`);
  }
  assert.doesNotMatch(html, /cr-search-empty|query-subject\.jpg|night-market-case-basemap\.webp/);
});

test('identity gallery opens with the most visually rich scenes selected first', () => {
  const html = renderToStaticMarkup(React.createElement(ContactReviewPage, { showGait: true, onBack() {} }));
  const cards = [...html.matchAll(/<button\b[^>]*aria-label="查看 ([^"]+)"[^>]*>/g)];
  assert.deepEqual(cards.slice(0, 6).map(match => match[1]), [
    'AI-VIDEO-04', 'AI-VIDEO-05', 'AI-VIDEO-03', 'AI-VIDEO-02', 'AI-VIDEO-08', 'AI-VIDEO-14',
  ]);
  assert.match(cards[0][0], /aria-pressed="true"/);
});

test('video screening still waits for an explicit search', () => {
  const html = renderToStaticMarkup(React.createElement(ContactReviewPage, { onBack() {} }));
  assert.equal((html.match(/role="listitem"/g) ?? []).length, 0);
  assert.match(html, /cr-search-empty/);
});
