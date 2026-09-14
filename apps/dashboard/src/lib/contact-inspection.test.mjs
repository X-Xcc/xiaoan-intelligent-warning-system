import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildSync } from 'esbuild';

function loadModule(name) {
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(new URL(`./${name}.ts`, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node',
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const inspection = await loadModule('contact-inspection');
const { contactReviewRecords } = await loadModule('contact-review');

test('reviewed demo names belong to the selected record and annotation', () => {
  assert.equal(typeof inspection.contactRoleIdentity, 'function');
  for (const [recordId, annotationId, name] of [
    ['CR-020', '01', '小王'], ['CR-020', '04', '赵六'],
    ['CR-019', '04', '张三'], ['CR-019', '03', '李四'],
  ]) {
    const annotation = inspection.contactAnnotations[recordId].find(item => item.id === annotationId);
    const fields = inspection.contactRoleIdentity(recordId, annotation);
    assert.deepEqual(fields[0], ['演示角色', name]);
    assert.deepEqual(fields.find(([label]) => label === '身份资料'), ['身份资料', '已脱敏']);
  }
  const unedited = inspection.contactAnnotations['CR-018'].find(item => item.id === '04');
  assert.deepEqual(inspection.contactRoleIdentity('CR-018', unedited)[0], ['演示角色', '嫌疑人']);
  assert.deepEqual(inspection.contactRoleIdentity('CR-020'), []);
});

test('suspect identity fields omit the redundant redacted name row', () => {
  assert.equal(typeof inspection.contactRoleIdentity, 'function');
  for (const recordId of ['CR-019', 'CR-020']) {
    for (const annotation of inspection.contactAnnotations[recordId].filter(item => item.role === 'suspect')) {
      const fields = inspection.contactRoleIdentity(recordId, annotation);
      assert.equal(fields.some(([label]) => label === '姓名'), false);
      assert.deepEqual(fields.find(([label]) => label === '人员编号'), ['人员编号', '已脱敏']);
    }
  }
});

test('the first scene has the four manually assigned demo roles', () => {
  const annotations = inspection.contactAnnotations['CR-020'];
  assert.deepEqual(annotations.map(item => [item.id, item.role]), [
    ['01', 'victim'], ['02', 'suspect'], ['03', 'suspect'], ['04', 'suspect'],
  ]);
  const headCenters = [[22, 39], [44.5, 44], [66.5, 29.5], [58.5, 27]];
  annotations.forEach((annotation, index) => {
    const [x, y, width, height] = annotation.bounds;
    const [centerX, centerY] = headCenters[index];
    assert.ok(centerX >= x && centerX <= x + width, annotation.id);
    assert.ok(centerY >= y && centerY <= y + height, annotation.id);
    assert.ok(width > 0 && height > 0 && x + width <= 100 && y + height <= 100);
  });
});

test('CR-019 marks the four people from the reviewed scene', () => {
  const annotations = inspection.contactAnnotations['CR-019'];
  assert.deepEqual(annotations.map(item => [item.id, item.role]), [
    ['01', 'victim'], ['02', 'suspect'], ['03', 'suspect'], ['04', 'suspect'],
  ]);
  annotations.forEach(annotation => {
    const [x, y, width, height] = annotation.bounds;
    assert.ok(width > 0 && height > 0 && x + width <= 100 && y + height <= 100, annotation.id);
  });
});

test('every scene gives each annotated person a consistent demo role', () => {
  assert.deepEqual(inspection.contactAnnotations['CR-017'].map(item => item.id), ['01', '02', '03', '04']);
  assert.deepEqual(inspection.contactAnnotations['CR-016'].map(item => item.id), ['01', '02', '03', '04']);
  for (const annotations of Object.values(inspection.contactAnnotations)) {
    assert.ok(annotations.length >= 3);
    assert.ok(annotations.every(item => item.role === (item.person === 'reference' ? 'victim' : 'suspect')));
  }
});

test('every annotation frames the head only', () => {
  for (const [recordId, annotations] of Object.entries(inspection.contactAnnotations)) {
    for (const annotation of annotations) {
      const [x, y, width, height] = annotation.bounds;
      assert.ok(width > 0 && width <= 12 && height > 0 && height <= 20,
        `${recordId}/${annotation.id}: ${width}x${height}`);
      assert.ok(x >= 0 && y >= 0 && x + width <= 100 && y + height <= 100);
    }
  }
});

test('head frames cover the reviewed head centers in all twelve source images', () => {
  // Percentages measured on the full source image, independent of modal size.
  const headCenters = {
    'night-market-cam-03.jpg': [[46, 25], [54.6, 10.5], [66.7, 11], [14, 20]],
    'night-market-cam-04.jpg': [[16.5, 23.5], [33, 20], [39, 10], [44.6, 11]],
    'night-market-cam-05.jpg': [[32.5, 48], [40, 50], [49.2, 36], [57.4, 37.4]],
    'night-market-cam-06.jpg': [[46.4, 37.5], [52, 26.5], [61.4, 25.2], [64.7, 19.8]],
    'night-market-cam-07.jpg': [[38.8, 29.8], [43.6, 31.7], [52.2, 19.2], [60.8, 16.5]],
    'night-market-cam-08.jpg': [[32.8, 37], [40.2, 39.3], [49.1, 23], [57.5, 25]],
    'night-market-cam-09.jpg': [[45.8, 33.3], [32.2, 28.5], [45.2, 11], [38.1, 7]],
    'night-market-cam-10.jpg': [[34.3, 29.5], [40.8, 20], [48, 23], [56, 21.5]],
    'night-market-sequence-01.jpg': [[22, 39], [44.5, 44], [66.5, 29.5], [58.5, 27]],
    'night-market-sequence-02.jpg': [[33, 46], [55, 23], [69.2, 24], [58, 37]],
    'night-market-sequence-03.jpg': [[33, 48], [40, 44.2], [54.5, 24], [60, 29.5]],
    'night-market-sequence-04.jpg': [[23.8, 40.5], [47.5, 40.5], [66, 32.7], [74, 34]],
  };
  assert.equal(contactReviewRecords.length, 20);
  assert.equal(new Set(contactReviewRecords.map(record => record.assetPath)).size, 12);
  for (const record of contactReviewRecords) {
    const centers = headCenters[record.assetPath.split('/').at(-1)];
    assert.ok(centers, record.assetPath);
    const annotations = inspection.contactAnnotations[record.id];
    assert.equal(annotations.length, centers.length, record.id);
    annotations.forEach((annotation, index) => {
      const [x, y, width, height] = annotation.bounds;
      const [cx, cy] = centers[index];
      assert.ok(cx >= x && cx <= x + width && cy >= y && cy <= y + height,
        `${record.id}/${annotation.id}: frame misses reviewed head center`);
    });
  }
});

test('records sharing an image share the same head positions', () => {
  const byAsset = new Map();
  for (const record of contactReviewRecords) {
    const annotations = inspection.contactAnnotations[record.id];
    if (byAsset.has(record.assetPath)) assert.deepEqual(annotations, byAsset.get(record.assetPath));
    else byAsset.set(record.assetPath, annotations);
  }
});

test('annotation labels distinguish assigned roles and keep legacy labels', () => {
  assert.equal(typeof inspection.contactAnnotationLabel, 'function');
  assert.deepEqual(inspection.contactAnnotations['CR-020'].map(inspection.contactAnnotationLabel), [
    '受害者 01', '嫌疑人 02', '嫌疑人 03', '嫌疑人 04',
  ]);
  assert.deepEqual(inspection.contactAnnotations['CR-018'].map(inspection.contactAnnotationLabel), [
    '受害者 01', '嫌疑人 02', '嫌疑人 03', '嫌疑人 04',
  ]);
});

test('comparison candidates keep CAM-11 records in nearest-time order without including the current record', () => {
  assert.equal(typeof inspection.contactComparisonRecords, 'function');
  const origin = contactReviewRecords.find(record => record.id === 'CR-019');
  const originalOrder = contactReviewRecords.map(record => record.id);
  const candidates = inspection.contactComparisonRecords(origin);
  assert.equal(candidates.length, 19);
  assert.ok(candidates.every(record => record.id !== origin.id));
  const camera11 = candidates.filter(record => record.camera === 'CAM-11');
  assert.deepEqual(camera11.map(record => record.id), ['CR-020', 'CR-003']);
  assert.equal(camera11[0].assetPath, '/contact-review-assets/night-market-sequence-01.jpg');
  assert.deepEqual(contactReviewRecords.map(record => record.id), originalOrder);
  const camera11Origin = contactReviewRecords.find(record => record.id === 'CR-020');
  assert.ok(inspection.contactComparisonRecords(camera11Origin).every(record => record.id !== 'CR-020'));
});
