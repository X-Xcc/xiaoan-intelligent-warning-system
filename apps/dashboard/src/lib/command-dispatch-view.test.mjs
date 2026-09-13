import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../components/CommandIntakeSheet.tsx', import.meta.url), 'utf8');

test('dispatch stage presents only a desensitized map and route', () => {
  assert.match(source, /DemoDispatchMap/);
  assert.match(source, /脱敏演示数据/);
  assert.doesNotMatch(source, /推荐通勤方式|确认演示派警|人工复核与派警意见|dispatch-panel|dispatch-flow/);
  assert.doesNotMatch(source, /高德|百度|真实地图/);
});
