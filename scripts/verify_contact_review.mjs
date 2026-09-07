import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { transformSync } from 'esbuild';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

async function moduleFrom(path, loader = 'ts') {
  const { code } = transformSync(read(path), {
    loader,
    format: 'esm',
    define: {
      'import.meta.env.VITE_API_BASE_URL': '"http://test.invalid/api"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.BASE_URL': '"/"',
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('contact review has a stable route', async () => {
  const { routePath, viewForPath } = await moduleFrom('apps/dashboard/src/lib/presentation.ts');
  assert.equal(routePath('contact-review'), '/contact-review');
  assert.equal(viewForPath('/contact-review'), 'contact-review');
});

test('static assets cannot shadow the contact review page route', async () => {
  const { routePath } = await moduleFrom('apps/dashboard/src/lib/presentation.ts');
  const { contactReviewRecords } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
  const route = routePath('contact-review');
  assert.ok(contactReviewRecords.every((record) => !record.assetPath.startsWith(`${route}/`)));
  assert.equal(fs.existsSync(new URL(`../apps/dashboard/public${route}`, import.meta.url)), false);
});

test('demo records contain 20 records and repeat one companion', async () => {
  const { contactReviewRecords } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
  assert.equal(contactReviewRecords.length, 20);
  assert.equal(contactReviewRecords.every((item) => item.assetPath.startsWith('/contact-review-assets/')), true);
  assert.equal(contactReviewRecords.filter((item) => item.companion.id === 'P-2048').length, 11);
  assert.equal(new Set(contactReviewRecords.map((item) => item.companion.id)).size, 10);
});

test('record filtering searches location, camera, and companion id', async () => {
  const { filterContactRecords, contactReviewRecords } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
  assert.equal(filterContactRecords(contactReviewRecords, 'camera', 'CAM-07').length > 0, true);
  assert.equal(filterContactRecords(contactReviewRecords, 'companion', 'P-2048').length, 11);
  assert.equal(filterContactRecords(contactReviewRecords, 'status', '待复核').length, 20);
});

test('date windows use inclusive calendar days and reject reversed ranges', async () => {
  const { contactDateWindow, selectContactRecords, contactReviewRecords } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
  assert.deepEqual(contactDateWindow(30), { from: '2026-08-08', to: '2026-09-06' });
  assert.deepEqual(contactDateWindow(7), { from: '2026-08-31', to: '2026-09-06' });
  assert.equal(selectContactRecords(contactReviewRecords, { ...contactDateWindow(7) }).length, 5);
  assert.equal(selectContactRecords(contactReviewRecords, { from: '2026-09-06', to: '2026-09-06' }).length, 1);
  assert.equal(selectContactRecords(contactReviewRecords, { from: '2026-09-07', to: '2026-09-06' }).length, 0);
});

test('sorting is explicit and does not mutate the dataset', async () => {
  const { selectContactRecords, contactReviewRecords } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
  const original = contactReviewRecords.map((r) => r.id);
  assert.equal(selectContactRecords(contactReviewRecords, { sort: 'oldest' })[0].id, 'CR-020');
  const repeated = selectContactRecords(contactReviewRecords, { sort: 'frequency' });
  assert.ok(repeated.slice(0, 11).every((r) => r.companion.id === 'P-2048'));
  assert.deepEqual(contactReviewRecords.map((r) => r.id), original);
  assert.ok(contactReviewRecords.every((r) => !('ruleScore' in r) && !('duration' in r)));
});

test('review drafts discard unknown IDs, invalid statuses, and malformed storage', async () => {
  const { parseContactDraft } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
  assert.deepEqual(parseContactDraft('broken'), {});
  assert.deepEqual(parseContactDraft('{"version":2,"reviews":{}}'), {});
  const draft = parseContactDraft(JSON.stringify({ version: 1, reviews: {
    'CR-001': { status: '已标记', note: 'sample note' },
    'CR-002': { status: 'not-valid', note: 'bad' },
    unknown: { status: '已标记', note: 'bad' },
  } }));
  assert.deepEqual(draft, { 'CR-001': { status: '已标记', note: 'sample note' } });
});

test('CSV exports only selected records and escapes notes as inert spreadsheet cells', async () => {
  const { contactReviewCsv, contactReviewRecords } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
  const csv = contactReviewCsv(contactReviewRecords.slice(0, 1), { 'CR-001': { status: '已标记', note: '=1+1,"test"\nnext' } });
  assert.ok(csv.includes('合成演示'));
  assert.ok(csv.includes('CR-001'));
  assert.ok(!csv.includes('CR-002'));
  assert.ok(csv.includes("'=1+1"));
  assert.ok(csv.includes('""test""'));
});

test('generation scene manifest matches every displayed time, place and companion', async () => {
  const { contactReviewRecords } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
  const manifest = JSON.parse(read('docs/contact-review-scenes.json'));
  assert.equal(manifest.model, 'gpt-image-2');
  assert.equal(manifest.scenes.length, 20);
  assert.equal(new Set(manifest.scenes.map((scene) => scene.scene)).size, 20);
  for (const record of contactReviewRecords) {
    const index = Number(record.id.slice(3));
    const scene = manifest.scenes.find((item) => item.index === index);
    assert.equal(scene.location, record.location);
    assert.equal(scene.camera, record.camera);
    assert.equal(scene.occurredAt, record.occurredAt);
    assert.equal(scene.companionId, record.companion.id);
  }
});

test('new workspace text stays readable and the scroll grid does not shrink records', () => {
  const css = read('apps/dashboard/src/styles/contact-review.css');
  for (const match of css.matchAll(/font-size:\s*([\d.]+)px/g)) {
    assert.ok(Number(match[1]) >= 12, `font-size ${match[1]} is too small`);
  }
  assert.ok(css.includes('grid-auto-rows: max-content'));
});

if (process.argv.includes('--assets')) {
  test('all 20 served frames and thumbnails exist with the requested role distribution', async () => {
    const { contactReviewRecords } = await moduleFrom('apps/dashboard/src/lib/contact-review.ts');
    const manifest = JSON.parse(read('apps/dashboard/public/contact-review-assets/manifest.json'));
    assert.equal(manifest.count, 20);
    assert.equal(manifest.recurringCompanionCount, 11);
    assert.ok(manifest.synthetic);
    assert.equal(new Set(manifest.records.map((record) => record.sha256Pixels)).size, 20);
    for (const record of contactReviewRecords) {
      const image = fs.readFileSync(new URL(`../apps/dashboard/public${record.assetPath}`, import.meta.url));
      assert.equal(image.subarray(1, 4).toString(), 'PNG');
      assert.ok(image.length > 50000);
      assert.ok(image.includes(Buffer.from('SYNTHETIC')) || image.includes(Buffer.from('synthetic')));
      const thumb = fs.readFileSync(new URL(`../apps/dashboard/public${record.assetPath.replace(/\.png$/, '.thumb.webp')}`, import.meta.url));
      assert.equal(thumb.subarray(0, 4).toString(), 'RIFF');
      assert.equal(thumb.subarray(8, 12).toString(), 'WEBP');
      assert.equal(manifest.records.find((entry) => entry.recordId === record.id)?.companionId, record.companion.id);
    }
  });
}
