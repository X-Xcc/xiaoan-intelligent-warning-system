import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { transformSync } from 'esbuild';
import postcss from 'postcss';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

async function helpers() {
  const { code } = transformSync(read('apps/dashboard/src/lib/presentation.ts'), { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('all ten routes round-trip, including the operational map', async () => {
  const { routePath, viewForPath } = await helpers();
  for (const view of ['platform', 'command', 'case', 'community', 'duty-plan', 'mobile', 'ai-center', 'admin', 'video', 'night-market-command']) {
    assert.equal(viewForPath(routePath(view)), view);
  }
  assert.equal(routePath('night-market-command'), '/night-market/command');
  assert.equal(viewForPath('/'), 'platform');
  assert.equal(viewForPath('/unknown'), 'platform');
  assert.equal(viewForPath('/case/example'), 'case');
});

test('event filters search received fields and preserve original records', async () => {
  const { filterEvents } = await helpers();
  const events = [
    { id: '1', title: 'A', area: 'East', owner: 'Team 1', status: '待人工确认', level: '高风险' },
    { id: '2', title: 'B', area: 'West', owner: 'Team 2', status: '处理中', level: '中风险' },
    { id: '3', title: 'C', area: 'North', status: '已完成', level: '低风险' },
  ];
  assert.deepEqual(filterEvents(events, 'pending', '').map((item) => item.id), ['1']);
  assert.deepEqual(filterEvents(events, 'active', 'west').map((item) => item.id), ['2']);
  assert.deepEqual(filterEvents(events, 'all', 'Team 1').map((item) => item.id), ['1']);
  assert.deepEqual(filterEvents(events, 'all', 'missing'), []);
  assert.equal(filterEvents(events, 'all', '').length, 3);
  assert.equal(events.length, 3);
  assert.deepEqual(filterEvents(undefined, 'all', ''), []);
});

test('missing metrics never become fabricated zeroes', async () => {
  const { formatMetric } = await helpers();
  assert.equal(formatMetric(undefined), '—');
  assert.equal(formatMetric(null), '—');
  assert.equal(formatMetric(0), '0');
  assert.equal(formatMetric(1200), '1,200');
});

test('active stylesheet is modular with readable typography and no override patches', () => {
  const entry = read('apps/dashboard/src/styles.css');
  const parsed = postcss.parse(entry);
  const imports = [];
  parsed.walkAtRules('import', (rule) => imports.push(rule.params.replace(/['"]/g, '')));
  assert.ok(imports.length >= 6, 'expected scoped stylesheet imports');
  assert.ok(!entry.includes('Final cascade'), 'legacy patch layers must not remain active');
  for (const path of imports) {
    const sheet = postcss.parse(read(`apps/dashboard/src/${path.replace(/^\.\//, '')}`));
    sheet.walkDecls((decl) => {
      assert.ok(!decl.important, `${path}: !important on ${decl.prop}`);
      if (decl.prop === 'font-size') {
        assert.ok(!decl.value.includes('vw'), `${path}: viewport-scaled font`);
        if (/^\d+(\.\d+)?px$/.test(decl.value)) assert.ok(parseFloat(decl.value) >= 12, `${path}: text smaller than 12px`);
      }
      if (decl.prop === 'letter-spacing') assert.match(decl.value, /^(0|normal|0px)$/, `${path}: nonzero letter spacing`);
    });
  }
});
