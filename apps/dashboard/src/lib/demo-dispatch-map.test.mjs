import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../components/DemoDispatchMap.tsx', import.meta.url), 'utf8');

test('demo map renders fictional grid, incident, units and route', () => {
  assert.match(source, /脱敏演示/);
  assert.match(source, /incident/);
  assert.match(source, /routePoints/);
  assert.match(source, /units/);
  assert.doesNotMatch(source, /AMap|amap|latitude|longitude|高德|百度|南昌/);
});
