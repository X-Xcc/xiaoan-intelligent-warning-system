import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function loadContactReview() {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('./contact-review.ts', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module,
    exports: module.exports,
  });
  return module.exports;
}

test('快速检索阶段从扫描图片逐步收敛到全部结果', () => {
  const { createContactSearchStages } = loadContactReview();
  const stages = createContactSearchStages(20, 3248);

  assert.deepEqual([...stages.map(stage => stage.scanned)], [96, 768, 1664, 2688, 3248]);
  assert.deepEqual([...stages.map(stage => stage.matched)], [2, 6, 11, 17, 20]);
  assert.ok(stages.every((stage, index) => index === 0 || stage.scanned > stages[index - 1].scanned));
  assert.ok(stages.every((stage, index) => index === 0 || stage.matched >= stages[index - 1].matched));
  assert.equal(stages.at(-1).scanned, 3248);
  assert.equal(stages.at(-1).matched, 20);
  assert.equal(stages.at(-1).phase, 'complete');
});

test('identity search includes every curated AI person photo instead of one camera', () => {
  const { identitySearchRecords = [], contactDateWindow, selectIdentitySearchRecords } = loadContactReview();
  const filters = { ...contactDateWindow(30), behaviors: ['可疑接触', '可疑观察', '可疑跟随'] };
  const result = selectIdentitySearchRecords(identitySearchRecords, filters);

  assert.equal(result.length, 52, 'All unique, provenance-backed synthetic person photos must be included');
  assert.equal(result.length, identitySearchRecords.length);
  assert.ok(new Set(result.map(record => record.camera)).size > 1);
  assert.ok(result.some(record => record.id === 'CR-020'));
});

test('identity search leads with rich crowd scenes without changing records or video screening order', () => {
  const { identitySearchRecords, contactReviewRecords, selectIdentitySearchRecords, selectContactRecords } = loadContactReview();
  const original = JSON.stringify(identitySearchRecords);
  const result = selectIdentitySearchRecords(identitySearchRecords, { sort: 'oldest' });

  assert.deepEqual(Array.from(result.slice(0, 6), record => record.id), [
    'AI-VIDEO-04', 'AI-VIDEO-05', 'AI-VIDEO-03', 'AI-VIDEO-02', 'AI-VIDEO-08', 'AI-VIDEO-14',
  ]);
  assert.deepEqual(
    Array.from(result, record => record.id).sort(),
    Array.from(identitySearchRecords, record => record.id).sort(),
  );
  const simpleSceneIndex = result.findIndex(record => record.assetPath === '/contact-review-assets/contact-20.png');
  assert.ok(result.filter(record => /night-market-(cam|sequence)-/.test(record.assetPath))
    .every(record => result.indexOf(record) < simpleSceneIndex));
  assert.equal(JSON.stringify(identitySearchRecords), original);
  const videoRecords = selectContactRecords(contactReviewRecords, { sort: 'oldest' });
  assert.ok(videoRecords.every((record, index) => index === 0 || videoRecords[index - 1].occurredAt <= record.occurredAt));
});

test('identity scene priority survives date, time, camera and status filtering', () => {
  const { identitySearchRecords, selectIdentitySearchRecords } = loadContactReview();
  const records = identitySearchRecords.map(record => ({
    ...record, status: record.camera === 'CAM-04' ? '已标记' : record.status,
  }));
  const filters = {
    from: '2026-09-02', to: '2026-09-06', timeFrom: '20:00', timeTo: '21:00',
    field: 'camera', query: 'CAM-04', status: '已标记', sort: 'oldest',
  };
  const result = selectIdentitySearchRecords(records, filters);
  assert.deepEqual(Array.from(result, record => record.id), ['AI-VIDEO-04', 'CR-004', 'AI-CONTACT-04']);
});

test('identity photo filters still respect dates, query and status', () => {
  const { identitySearchRecords = [], selectIdentitySearchRecords } = loadContactReview();
  assert.ok(identitySearchRecords.length > 0);
  const selected = identitySearchRecords[0];
  const date = selected.occurredAt.slice(0, 10);
  const result = selectIdentitySearchRecords(identitySearchRecords, { from: date, to: date, query: selected.camera });
  assert.ok(result.some(record => record.id === selected.id));
  assert.ok(result.every(record => record.occurredAt.startsWith(date)));
  assert.equal(selectIdentitySearchRecords(identitySearchRecords, { from: '2099-01-01' }).length, 0);
  assert.equal(selectIdentitySearchRecords(identitySearchRecords, { query: 'not-a-photo-location' }).length, 0);
  assert.equal(selectIdentitySearchRecords(identitySearchRecords, { status: '已排除' }).length, 0);
});

test('identity search rejects unrelated assets even when passed alongside approved records', () => {
  const { identitySearchRecords = [], selectIdentitySearchRecords } = loadContactReview();
  assert.ok(identitySearchRecords.length > 0);
  const unrelated = [
    '/contact-review-assets/query-subject.jpg',
    '/contact-review-assets/night-market-case-basemap.webp',
    '/command/phone.png',
    '/xiaoan-assistant/reference-cutout.webp',
    ...['01', '02', '11', '12'].map(camera => `/contact-review-assets/night-market-cam-${camera}.jpg`),
  ].map((assetPath, index) => ({ ...identitySearchRecords[0], id: `OTHER-${index}`, assetPath }));

  assert.equal(selectIdentitySearchRecords([...identitySearchRecords, ...unrelated], {}).length, identitySearchRecords.length);
});

test('茶铺周边选项与全部地点一致，返回全部记录', () => {
  const { contactReviewRecords, CONTACT_TEA_SHOP_LOCATION, selectContactRecords } = loadContactReview();
  const filters = {
    from: '2026-08-08',
    to: '2026-09-06',
    location: CONTACT_TEA_SHOP_LOCATION,
    behaviors: ['可疑接触', '可疑观察', '可疑跟随'],
  };

  assert.equal(selectContactRecords(contactReviewRecords, filters).length, contactReviewRecords.length);
});

test('按时分筛选同一天内的记录', () => {
  const { contactReviewRecords, selectContactRecords } = loadContactReview();
  const result = selectContactRecords(contactReviewRecords, {
    from: '2026-08-08',
    to: '2026-09-06',
    timeFrom: '20:20',
    timeTo: '20:25',
  });

  assert.equal(result.map(record => record.occurredAt.slice(11, 16)).join(','), '20:25,20:24,20:23,20:22,20:21,20:20');
});
