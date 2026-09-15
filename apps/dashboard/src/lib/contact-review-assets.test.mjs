import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';

test('the first four chronological records use the supplied scenes in order', () => {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('./contact-review.ts', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports,
  });
  const { contactReviewRecords, selectContactRecords } = module.exports;
  const records = selectContactRecords(contactReviewRecords, { sort: 'oldest' }).slice(0, 4);

  assert.deepEqual(Array.from(records, record => record.id), ['CR-020', 'CR-019', 'CR-018', 'CR-017']);
  assert.deepEqual(Array.from(records, record => record.assetPath), [
    '/contact-review-assets/night-market-sequence-01.jpg',
    '/contact-review-assets/night-market-sequence-02.jpg',
    '/contact-review-assets/night-market-sequence-03.jpg',
    '/contact-review-assets/night-market-sequence-04.jpg',
  ]);
  for (const record of records) {
    const image = fs.readFileSync(new URL(`../../public${record.assetPath}`, import.meta.url));
    assert.equal(image.subarray(0, 3).toString('hex'), 'ffd8ff', record.assetPath);
  }
});

test('identity gallery contains the synthetic manifest and unique reviewed person assets', () => {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL('./contact-review.ts', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports,
  });
  const { identitySearchRecords = [] } = module.exports;
  const manifest = JSON.parse(fs.readFileSync(new URL('../../public/contact-review-assets/manifest.json', import.meta.url), 'utf8'));
  const expected = [
    ...manifest.records.filter(record => record.synthetic).map(record => record.filename),
    'contact-01-self-portrait.png', 'contact-02-self-portrait.png',
    ...Array.from({ length: 8 }, (_, index) => `night-market-cam-${String(index + 3).padStart(2, '0')}.jpg`),
    ...Array.from({ length: 4 }, (_, index) => `night-market-sequence-${String(index + 1).padStart(2, '0')}.jpg`),
    'cr-019-point-1.png', 'cr-019-point-2.png', 'cr-019-point-5.png',
  ];
  const paths = new Set(identitySearchRecords.map(record => record.assetPath));
  for (const filename of expected) {
    assert.ok(paths.has(`/contact-review-assets/${filename}`), `Missing synthetic person photo: ${filename}`);
  }
  for (let camera = 2; camera <= 16; camera++) {
    const assetPath = `/night-market-cam-${String(camera).padStart(2, '0')}.png`;
    assert.ok(paths.has(assetPath), `Missing generated video-wall still: ${assetPath}`);
  }
  assert.equal(identitySearchRecords.length, 52);
  assert.equal(paths.size, identitySearchRecords.length);
  assert.equal(new Set(identitySearchRecords.map(record => record.id)).size, identitySearchRecords.length);
  const hashes = identitySearchRecords.map(record => {
    const image = fs.readFileSync(new URL(`../../public${record.assetPath}`, import.meta.url));
    const thumbnail = record.thumbnailPath ?? record.assetPath.replace(/\.png$/, '.thumb.webp');
    assert.ok(fs.existsSync(new URL(`../../public${thumbnail}`, import.meta.url)), `Missing preview: ${thumbnail}`);
    return createHash('sha256').update(image).digest('hex');
  });
  assert.equal(new Set(hashes).size, identitySearchRecords.length, 'Repeated files must not appear as extra photos');
});
