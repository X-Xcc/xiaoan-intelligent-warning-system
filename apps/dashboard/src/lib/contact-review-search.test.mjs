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

test('身份检索结果固定只保留 CAM-11', () => {
  const { contactReviewRecords, contactDateWindow, selectContactRecords, selectIdentitySearchRecords } = loadContactReview();
  const filters = { ...contactDateWindow(30), behaviors: ['可疑接触', '可疑观察', '可疑跟随'] };
  const result = selectIdentitySearchRecords(contactReviewRecords, filters);

  assert.equal(result.length, 1);
  assert.ok(result.every(record => record.camera.toLowerCase() === 'cam-11'));
  assert.equal(result[0].id, 'CR-020');
  assert.equal(result[0].occurredAt, '2026-08-08 20:13:50');
  assert.ok(selectContactRecords(contactReviewRecords, filters).some(record => record.id === 'CR-003'));

  const narrowed = selectIdentitySearchRecords(contactReviewRecords, { ...filters, from: '2026-09-04' });
  assert.equal(narrowed.length, 0);
});
