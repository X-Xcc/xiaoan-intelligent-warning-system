import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relativePath) {
  const path = new URL(relativePath, import.meta.url);
  if (!fs.existsSync(path)) return {};
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(path)], bundle: true, write: false,
    format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic',
    loader: { '.css': 'empty' }, define: { 'import.meta.env.BASE_URL': '"/"' },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${outputFiles[0].text}\n})`)(require, module, module.exports);
  return module.exports;
}

const model = load('./contact-case-map.ts');
const { contactReviewRecords } = load('./contact-review.ts');
const { ContactGaitMap } = load('../components/ContactGaitMap.tsx');
const records = contactReviewRecords.slice(0, 5);

test('the approved map labels cameras 02, 04 and 08 with the correct case roles', () => {
  assert.ok(model.caseStops, 'A fictional case map model must exist');
  assert.deepEqual(model.caseStops.map(stop => [stop.scene.camera, stop.label]), [
    ['CAM-02', '第一次接触地点'], ['CAM-03', '途经点'], ['CAM-04', '案发地点'],
    ['CAM-05', '途经点'], ['CAM-08', '销赃点'],
  ]);
  assert.deepEqual(model.caseStops.map(stop => stop.role), ['contact', 'transit', 'incident', 'transit', 'disposal']);
});

test('the map uses fictional local coordinates and preserves the accepted B positions', () => {
  assert.ok(model.caseBasemap, 'The bitmap must describe fictional geography');
  assert.equal(model.caseBasemap.kind, 'fictional-street-map');
  assert.equal(model.caseBasemap.width, 1200);
  assert.equal(model.caseBasemap.height, 780);
  assert.equal(model.caseBasemap.assetPath, '/contact-review-assets/night-market-case-basemap.webp');
  assert.equal('attributionUrl' in model.caseBasemap, false);
  assert.deepEqual(model.caseStops.map(stop => stop.anchor), [[440, 230], [560, 250], [640, 365], [720, 505], [890, 595]]);
  for (const stop of model.caseStops) {
    assert.ok(stop.anchor[0] > 0 && stop.anchor[0] < model.caseBasemap.width);
    assert.ok(stop.anchor[1] > 0 && stop.anchor[1] < model.caseBasemap.height);
    assert.equal(stop.scene.kind, 'night-market-demo-not-zijing-capture');
    assert.ok(fs.existsSync(new URL(`../../public${stop.scene.thumbnailPath}`, import.meta.url)));
  }
});

test('point association preserves source record identity and handles short/empty lists', () => {
  assert.equal(typeof model.getCaseMapPoints, 'function');
  const original = JSON.stringify(records);
  const points = model.getCaseMapPoints(records);
  assert.equal(points.length, 5);
  points.forEach((point, index) => assert.equal(point.record, records[index]));
  assert.equal(JSON.stringify(records), original);
  assert.deepEqual(model.getCaseMapPoints([]), []);
  assert.equal(model.getCaseMapPoints(records.slice(0, 2)).length, 2);
  assert.equal(model.getCaseMapPoints(contactReviewRecords).length, 5);
});

test('the drawn route follows corridor bends and stops at the last available point', () => {
  assert.equal(typeof model.getCaseMapRoute, 'function');
  assert.deepEqual(model.getCaseMapRoute(5), [
    [440, 230], [525, 215], [560, 250], [550, 340], [640, 365], [680, 350],
    [695, 438], [720, 505], [795, 535], [830, 590], [890, 595],
  ]);
  assert.deepEqual(model.getCaseMapRoute(0), []);
  assert.deepEqual(model.getCaseMapRoute(-1), []);
  assert.deepEqual(model.getCaseMapRoute(NaN), []);
  for (let count = 1; count <= 5; count++) {
    assert.deepEqual(model.getCaseMapRoute(count).at(-1), model.caseStops[count - 1].anchor);
  }
  assert.deepEqual(model.getCaseMapRoute(10), model.getCaseMapRoute(5));
});

test('CR-20 defines the comparison route contract', () => {
  assert.equal(typeof model.getCaseComparisonRoute, 'function');
  assert.equal(model.caseRouteOverlapRate, 5);
  const route = model.getCaseComparisonRoute(5);
  assert.ok(route.some(point => point[0] === 640 && point[1] === 365));
  for (const point of [[440, 230], [560, 250], [720, 505], [890, 595]]) {
    assert.equal(route.some(candidate => candidate[0] === point[0] && candidate[1] === point[1]), false);
  }
});

test('defines outward route branches from points one and three', () => {
  assert.equal(model.routeOverlapPercent, 90);
  assert.equal(model.caseRouteBranches.length, 3);
  assert.deepEqual(model.caseRouteBranches.map(branch => branch.points[0]), [
    [440, 230], [440, 230], [640, 365],
  ]);
  for (const branch of model.caseRouteBranches) {
    assert.notDeepEqual(branch.points.at(-1), branch.points[0]);
    assert.ok(branch.points.length >= 2);
  }
  assert.deepEqual(model.caseRouteBranches[2].points.at(-1), [900, 470]);
});

test('defines two explicitly colored paths for the map renderer', () => {
  assert.deepEqual(model.caseRoutes.map(route => [route.id, route.color]), [
    ['primary-route', 'blue'], ['comparison-route', 'violet'],
  ]);
  assert.equal(model.caseRoutes[0].points.at(-1)[0], 890);
  assert.ok(model.caseRoutes[1].points.some(point => point[0] === 640 && point[1] === 365));
});

test('the rendered map presents a selected timeline and photo strip with explicit simulation provenance', () => {
  const selected = records[2].id;
  const html = renderToStaticMarkup(React.createElement(ContactGaitMap, { records, selectedId: selected, onSelect() {} }));
  assert.match(html, /aria-label="关联时间线"/);
  assert.match(html, /aria-label="关联点位图片"/);
  for (const label of ['第一次接触地点', '案发地点', '销赃点', '仿真街区']) assert.ok(html.includes(label), label);
  assert.match(html, /night-market-case-basemap\.webp/);
  assert.doesNotMatch(html, /OpenStreetMap|地理参考|南昌市紫荆夜市<\/h3>/);
  const selectedButtons = [...html.matchAll(new RegExp(`<button\\b[^>]*data-record-id="${selected}"[^>]*>`, 'g'))];
  assert.equal(selectedButtons.length, 2, 'The selected record must appear in the timeline and photo strip');
  selectedButtons.forEach(([tag]) => assert.match(tag, /aria-pressed="true"/));
  assert.match(html, /重新加载地图和图片/);
  assert.match(html, /放大 CAM-04 夜市场景图/);
});

test('the rendered map exposes the route overlap and draws three branch lines in the SVG route layer', () => {
  const html = renderToStaticMarkup(React.createElement(ContactGaitMap, { records, selectedId: records[0].id, onSelect() {} }));
  assert.match(html, /aria-label="路线重合率 90%"/);
  assert.match(html, /路线重合率 90%/);
  assert.equal(model.caseRouteBranches.length, 3);
  assert.deepEqual(model.caseRouteBranches.map(branch => branch.points[0]), [
    [440, 230], [440, 230], [640, 365],
  ]);
});

test('missing records render an empty state without a misleading route or photo controls', () => {
  const html = renderToStaticMarkup(React.createElement(ContactGaitMap, { records: [], selectedId: '', onSelect() {} }));
  assert.match(html, /暂无关联点位/);
  assert.doesNotMatch(html, /cr-nightmarket-anchor|放大 CAM-/);
});

test('route overlap badge highlights ninety percent in red', () => {
  const css = fs.readFileSync(new URL('../styles/contact-case-map.css', import.meta.url), 'utf8');
  const rule = css.match(/^\.cr-nightmarket-route-overlap \{([^}]+)\}/m)?.[1];
  assert.ok(rule, 'The overlap badge must have a dedicated style');
  assert.match(rule, /(?:^|;)\s*color:\s*#cf1322\s*;/);
  assert.match(rule, /border:\s*1px solid #ffa39e\s*;/);
  assert.match(rule, /background:\s*#fff1f0\s*;/);
});

test('map points one two four and five are green while the incident stays red', () => {
  const { parse } = require('postcss');
  const css = parse(fs.readFileSync(new URL('../styles/contact-case-map.css', import.meta.url), 'utf8'));
  const declarations = (selector) => {
    const values = {};
    css.walkRules(rule => {
      if (rule.selectors.includes(selector)) rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    return values;
  };
  const markers = model.caseStops.map(stop => declarations(`.cr-nightmarket-anchor.cr-case-${stop.role}`));
  assert.deepEqual(markers.map(marker => marker['--cr-marker']), [
    '#21856d', '#21856d', '#cf1322', '#21856d', '#21856d',
  ]);
  assert.deepEqual(markers.map(marker => marker['--cr-marker-text']), [
    'white', 'white', 'white', 'white', 'white',
  ]);
  const anchor = declarations('.cr-nightmarket-anchor');
  assert.equal(anchor.background, 'var(--cr-marker)');
  assert.equal(anchor.color, 'var(--cr-marker-text)');
  assert.match(declarations('.cr-nightmarket-anchor[aria-pressed=true]')['box-shadow'], /var\(--cr-marker\)/);
  assert.match(declarations('.cr-nightmarket-anchor:hover').outline, /var\(--cr-marker\)/);
});
