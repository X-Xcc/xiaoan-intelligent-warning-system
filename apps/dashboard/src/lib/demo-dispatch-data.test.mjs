import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./demo-dispatch-data.ts', import.meta.url), 'utf8');

test('demo dispatch data contains only fictional canvas coordinates', () => {
  assert.ok(source.includes('演示辖区'));
  assert.ok(source.includes('demo-unit-01'));
  assert.ok(source.includes('recommended: true'));
  assert.doesNotMatch(source, /latitude|longitude|高德|百度|南昌/);
});

test('demo dispatch data exposes enough local choices', () => {
  assert.match(source, /units:\s*\[/);
  assert.match(source, /commuteOptions:\s*\[/);
  assert.match(source, /routePoints:\s*\[/);
  assert.match(source, /selectRecommendedUnit/);
});
