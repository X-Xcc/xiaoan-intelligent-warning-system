import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../components/CommandIntakeSheet.tsx', import.meta.url), 'utf8');

test('dispatch stage presents desensitized map and local-only confirmation', () => {
  assert.match(source, /DemoDispatchMap/);
  assert.match(source, /脱敏演示数据/);
  assert.match(source, /推荐通勤方式/);
  assert.match(source, /确认演示派警/);
  assert.doesNotMatch(source, /高德|百度|真实地图/);
});
