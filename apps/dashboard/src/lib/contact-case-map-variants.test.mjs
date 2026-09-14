import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('CR-020 uses the supplied incident photo without changing other points or records', () => {
  const { contactReviewRecords } = load('./contact-review.ts');
  const records = contactReviewRecords.slice(0, 5);
  const original = model.getCaseMapPoints(records);
  const points = model.getCaseMapPoints(records, 'CR-020');
  const assetPath = '/contact-review-assets/cr-020-incident.jpg';
  assert.equal(points[2].scene.assetPath, assetPath);
  assert.equal(points[2].scene.thumbnailPath, assetPath);
  assert.ok(fs.existsSync(new URL(`../../public${assetPath}`, import.meta.url)));
  assert.deepEqual(points[2].scene, {
    ...original[2].scene, assetPath, thumbnailPath: assetPath,
  });
  for (const index of [0, 1, 3, 4]) assert.deepEqual(points[index], original[index]);
  assert.deepEqual(model.getCaseMapPoints(records, 'CR-018'), original);
  assert.ok(model.getCaseMapPoints(records, 'CR-019').every(point => point.scene.assetPath !== assetPath));
  assert.deepEqual(model.getCaseMapPoints([], 'CR-020'), []);
  assert.equal(model.getCaseMapPoints(records.slice(0, 2), 'CR-020').length, 2);
});

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

test('CR-019 uses the reviewer-supplied images for points one, two, three and five', () => {
  const { contactReviewRecords } = load('./contact-review.ts');
  const points = model.getCaseMapPoints(contactReviewRecords, 'CR-019');
  assert.deepEqual(points.map(point => point.scene.assetPath), [
    '/contact-review-assets/cr-019-point-1.png',
    '/contact-review-assets/cr-019-point-2.png',
    '/contact-review-assets/cr-019-point-3.jpg',
    '/night-market-cam-05.png',
    '/contact-review-assets/cr-019-point-5.png',
  ]);
  assert.deepEqual(points.map(point => point.scene.thumbnailPath), [
    '/contact-review-assets/cr-019-point-1.thumb.webp',
    '/contact-review-assets/cr-019-point-2.thumb.webp',
    '/contact-review-assets/cr-019-point-3.thumb.webp',
    '/contact-review-assets/zijing-demo-cam-05.thumb.webp',
    '/contact-review-assets/cr-019-point-5.thumb.webp',
  ]);
  for (const point of points) {
    for (const asset of [point.scene.assetPath, point.scene.thumbnailPath]) {
      assert.ok(fs.existsSync(new URL(`../../public${asset}`, import.meta.url)), asset);
    }
  }
});

test('case-specific photos preserve record associations and other cases', () => {
  const { contactReviewRecords } = load('./contact-review.ts');
  const original = JSON.stringify(model.caseStops);
  const cr020 = model.getCaseMapPoints(contactReviewRecords, 'CR-020');
  const points = model.getCaseMapPoints(contactReviewRecords, 'CR-019');
  points.forEach((point, index) => {
    assert.equal(point.record, contactReviewRecords[index]);
    assert.deepEqual(point.anchor, model.caseStops[index].anchor);
    assert.equal(point.scene.camera, model.caseStops[index].scene.camera);
    assert.equal(point.scene.occurredAt, model.caseStops[index].scene.occurredAt);
  });
  assert.equal(points[3].scene, model.caseStops[3].scene);
  for (const recordId of ['', 'CR-018']) {
    const other = model.getCaseMapPoints(contactReviewRecords, recordId);
    assert.deepEqual(other.map(point => point.scene), model.caseStops.map(stop => stop.scene));
  }
  assert.deepEqual(model.getCaseMapPoints(contactReviewRecords, 'CR-020'), cr020);
  assert.equal(JSON.stringify(model.caseStops), original);
  assert.deepEqual(model.getCaseMapPoints([], 'CR-019'), []);
  assert.equal(model.getCaseMapPoints(contactReviewRecords.slice(0, 2), 'CR-019').length, 2);
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
  for (const point of [1, 2, 3, 5]) assert.ok(cr019.includes(`cr-019-point-${point}.thumb.webp`));
  assert.doesNotMatch(cr019, /cr-nightmarket-route-key-(violet|brown)|第二条路径|对比路线/);
  const cr020 = render('CR-020');
  assert.match(cr020, /data-source-record-id="CR-020"/);
  assert.match(cr020, /CR-020 · 夜市街区/);
  assert.match(cr020, /路线重合率仅 5%/);
  assert.match(cr020, /cr-nightmarket-route-key-brown/);
  assert.match(cr020, /src="\/contact-review-assets\/cr-020-incident\.jpg"/);
  assert.doesNotMatch(cr019, /cr-020-incident\.jpg/);
  assert.doesNotMatch(cr020, /cr-nightmarket-route-key-(violet|branch)|90%/);
  assert.doesNotMatch(cr020, /cr-019-point-/);
});
