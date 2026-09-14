import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);

function load(relativePath) {
  const path = new URL(relativePath, import.meta.url);
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(path)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env.BASE_URL': '"/"' },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${outputFiles[0].text}\n})`)(require, module, module.exports);
  return module.exports;
}

const model = load('./contact-case-map.ts');

test('separates CR-019 and CR-020 map variants', () => {
  assert.equal(typeof model.getCaseMapVariant, 'function');

  const cr020 = model.getCaseMapVariant('CR-020');
  assert.equal(cr020.id, 'CR-020');
  assert.equal(cr020.overlapRate, 5);
  assert.ok(cr020.comparisonRoute.length > 0);
  assert.ok(cr020.comparisonRoute.some(point => point[0] === 640 && point[1] === 365));

  const cr019 = model.getCaseMapVariant('CR-019');
  assert.equal(cr019.id, 'CR-019');
  assert.ok(cr019.route.length > 0);
  assert.deepEqual(cr019.route, model.getCaseMapRoute(5), 'Keep the existing numbered main route');
  assert.deepEqual(cr019.comparisonRoute, []);
  assert.equal(cr019.overlapRate, 90);
  assert.deepEqual(cr019.branches.map(branch => branch.points[0]), [
    [440, 230], [440, 230], [720, 505],
  ]);
  assert.deepEqual(cr019.branches[2].points.at(-1), [330, 595]);
  assert.deepEqual(cr020.branches, []);
  assert.equal(cr020.comparisonColor, 'brown');
  assert.notEqual(cr019.title, cr020.title);
});

test('the map renders the source record page independently of the selected timeline point', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { ContactGaitMap } = load('../components/ContactGaitMap.tsx');
  const { contactReviewRecords } = load('./contact-review.ts');
  const records = [...contactReviewRecords].reverse().slice(0, 5);
  const render = sourceRecordId => renderToStaticMarkup(React.createElement(ContactGaitMap, {
    sourceRecordId, records, selectedId: 'CR-020', onSelect() {},
  }));
  const cr019 = render('CR-019');
  assert.match(cr019, /data-source-record-id="CR-019"/);
  assert.match(cr019, /CR-019 · 夜市街区/);
  assert.match(cr019, /路线重合率 90%/);
  assert.doesNotMatch(cr019, /cr-nightmarket-route-key-(violet|brown)|第二条路径|对比路线/);
  const cr020 = render('CR-020');
  assert.match(cr020, /data-source-record-id="CR-020"/);
  assert.match(cr020, /CR-020 · 夜市街区/);
  assert.match(cr020, /路线重合率仅 5%/);
  assert.match(cr020, /cr-nightmarket-route-key-brown/);
  assert.doesNotMatch(cr020, /cr-nightmarket-route-key-(violet|branch)|90%/);
});
