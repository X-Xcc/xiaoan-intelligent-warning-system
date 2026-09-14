import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildSync } from 'esbuild';

async function loadModule(name) {
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(new URL(`./${name}.ts`, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node',
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const review = await loadModule('contact-review');
const inspection = await loadModule('contact-inspection');

test('contact review exposes only redacted identity values', () => {
  const sourceNames = ['xxx', '林予安', '陈景和', '周明远', '许知夏', '吴成川', '沈雨禾', '郑怀远', '宋清宁', '何嘉木'];
  const sourceIds = review.contactReviewRecords.map(record => record.companion.id);
  assert.equal(typeof review.contactCompanionDisplayLabel, 'function');
  assert.ok(review.contactReviewRecords.every(record => {
    const display = review.contactCompanionDisplayLabel(record.companion);
    return display.startsWith('脱敏对象 ') && !sourceNames.includes(display) && !sourceIds.includes(display);
  }));
  assert.ok(inspection.referenceIdentity.every(([, value]) => value === review.CONTACT_REDACTED_VALUE));
  assert.ok(inspection.referenceResidence.every(([, value]) => value === review.CONTACT_REDACTED_VALUE));
  const csv = review.contactReviewCsv(review.contactReviewRecords, {});
  assert.ok(!sourceNames.some(value => csv.includes(value)));
  assert.ok(!sourceIds.some(value => csv.includes(value)));
});

test('contact review UI does not expose raw identity placeholders', () => {
  const page = fs.readFileSync(new URL('../pages/ContactReviewPage.tsx', import.meta.url), 'utf8');
  const modal = fs.readFileSync(new URL('../components/ContactRecordModal.tsx', import.meta.url), 'utf8');
  const visibleIdentityPlaceholders = ['REF-001', 'TMP-', '>xxx<', '林予安', '陈景和', '周明远', '许知夏', '吴成川', '沈雨禾', '郑怀远', '宋清宁', '何嘉木'];
  for (const value of visibleIdentityPlaceholders) {
    assert.equal(page.includes(value), false, `page exposes ${value}`);
    assert.equal(modal.includes(value), false, `modal exposes ${value}`);
  }
});
