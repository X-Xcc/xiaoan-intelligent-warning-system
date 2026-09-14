import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
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
