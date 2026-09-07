import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync('apps/dashboard/src/pages/VideoLinkagePage.tsx', 'utf8');
const css = readFileSync('apps/dashboard/src/styles/monitoring.css', 'utf8');

assert.match(source, /mechanicalDogFallbackFeed/);
assert.match(source, /fightAlertOpen/);
assert.match(source, /altKey && event\.key\.toLowerCase\(\) === 'm'/);
assert.match(source, /疑似肢体冲突/);
assert.match(source, /Modal/);
assert.match(source, /captureFrameForChannel\(0\)/);
assert.match(source, /setFightAlertOpen\(true\)/);
assert.match(source, /event\.key === 'Escape'/);
assert.match(source, /发起处置/);
assert.match(source, /保全证据/);
for (const component of ['Card', 'Descriptions', 'Steps', 'Tag', 'Spin', 'Button']) {
  assert.match(source, new RegExp(`\\b${component}\\b`));
}
assert.match(source, /cameraId: 'local'/);
assert.doesNotMatch(source, /monitoring-side-rail/);
assert.match(css, /\.fight-alert-modal/);
assert.match(css, /\.fight-alert-source/);
assert.match(css, /\.fight-alert-evidence/);
assert.match(css, /\.fight-alert-recommendation/);

console.log('mechanical dog alert frontend contract passed');
