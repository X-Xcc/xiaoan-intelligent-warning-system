import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../components/DemoDispatchMap.tsx', import.meta.url), 'utf8');

test('demo map renders fictional grid, incident, units and route', () => {
  assert.match(source, /脱敏演示/);
  assert.match(source, /incident/);
  assert.match(source, /routePoints/);
  assert.match(source, /units/);
  assert.match(source, /5公里态势范围/);
  assert.match(source, /北/);
  assert.match(source, /demo-map-scale/);
  assert.match(source, /demo-dispatch-map-v2\.svg/);
  assert.match(source, /routeOptions\.map/);
  assert.match(source, /系统推荐/);
  assert.match(source, /前方拥堵/);
  assert.match(source, /demo-map-candidate-route/);
  assert.match(source, /demo-map-congestion/);
  assert.match(source, /候选路线/);
  assert.doesNotMatch(source, /地图控制|推荐通勤|dispatch-panel|缩小地图|放大地图/);
  assert.doesNotMatch(source, /AMap|amap|latitude|longitude|高德|百度|南昌/);
});
