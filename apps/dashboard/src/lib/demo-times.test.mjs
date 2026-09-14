import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const baseline = '20:13:50';

async function load(name) {
  const context = vm.createContext({});
  const modules = new Map();
  async function get(file) {
    if (modules.has(file.href)) return modules.get(file.href);
    const source = fs.readFileSync(file, 'utf8');
    const module = file.pathname.endsWith('.json')
      ? new vm.SyntheticModule(['default'], function () { this.setExport('default', JSON.parse(source)); }, { context })
      : new vm.SourceTextModule(stripTypeScriptTypes(source, { mode: 'transform' }), { context, identifier: file.href });
    modules.set(file.href, module);
    await module.link((specifier, parent) => get(new URL(
      specifier.endsWith('.json') ? specifier : `${specifier}.ts`, parent.identifier,
    )));
    return module;
  }
  const module = await get(new URL(`./${name}.ts`, import.meta.url));
  await module.evaluate();
  return module.namespace;
}

function clock(value) {
  const match = /(?:^|[T ])(\d{2}:\d{2}:\d{2})(?:$|[+Z])/.exec(value);
  assert.ok(match, `A second-precision clock is required: ${value}`);
  assert.ok(match[1] >= baseline && match[1] <= '23:59:59', value);
  return match[1];
}

test('all contact record clocks start at the evening baseline and retain dates and sort order', async () => {
  const { contactReviewRecords: records, selectContactRecords, contactReviewCsv } = await load('contact-review');
  assert.equal(records.length, 20);
  records.forEach(record => clock(record.occurredAt));
  assert.equal(records[0].occurredAt.slice(0, 10), '2026-09-06');
  assert.equal(records.at(-1).occurredAt.slice(0, 10), '2026-08-08');
  const oldest = selectContactRecords(records, { sort: 'oldest' });
  assert.equal(oldest[0].id, 'CR-020');
  assert.equal(clock(oldest[0].occurredAt), baseline);
  assert.equal(oldest.at(-1).id, 'CR-001');
  const csv = contactReviewCsv(records, {});
  for (const record of records) assert.ok(csv.includes(record.occurredAt));
});

test('gait map source timestamps preserve their one-minute steps and final three-minute gap', async () => {
  const { zijingDemoStops } = await load('contact-zijing');
  const times = Array.from(zijingDemoStops, stop => stop.scene.occurredAt);
  assert.equal(times.length, 5);
  times.forEach(clock);
  assert.equal(times[0], '2026-09-05 20:13:50');
  assert.deepEqual(times.map(time => (Date.parse(time) - Date.parse(times[0])) / 1000), [0, 60, 120, 180, 360]);
});

test('intake samples preserve ordered occurrence, receipt, dispatch and departure timestamps', async () => {
  const { demoIntakeEvents } = await load('intake-demo-data');
  const { buildIntakeDraft } = await load('intake-sheet');
  for (const event of demoIntakeEvents) {
    const draft = buildIntakeDraft(event);
    const milestones = ['occurredAt', 'receivedAt', 'dispatchedAt', 'departedAt']
      .map(key => draft[key]).filter(Boolean);
    milestones.forEach(clock);
    assert.deepEqual([...milestones].sort(), milestones, event.id);
    assert.equal(event.time.replace(' ', 'T'), draft.receivedAt);
    for (const match of event.description.matchAll(/\d{2}:\d{2}(?::\d{2})?/g)) clock(match[0]);
  }
  const first = demoIntakeEvents.find(event => event.id === 'alarm-demo-001');
  assert.equal(first.occurredAt, '2026-09-08T20:13:50');
  assert.equal(Date.parse(first.receivedAt) - Date.parse(first.occurredAt), 5 * 60000);
  assert.equal(Date.parse(first.departedAt) - Date.parse(first.occurredAt), 10 * 60000);
});

test('overview and night-market fallback event clocks include seconds and satisfy the baseline', () => {
  for (const file of ['../pages/DashboardApp.tsx', '../pages/NightMarketCommandPage.tsx']) {
    const matches = [...read(file).matchAll(/\b(?:time|updatedAt): '([^']+)'/g)];
    assert.ok(matches.length >= 4, file);
    matches.forEach(([, value]) => clock(value));
  }
});

test('intake presentation retains supplied seconds and leaves real values unchanged', async () => {
  const intake = await load('intake-sheet');
  assert.equal(typeof intake.displayIntakeTime, 'function');
  assert.equal(intake.displayIntakeTime('2026-09-11T20:13:50'), '20:13:50');
  assert.equal(intake.displayIntakeTime('2026-09-11T09:05:07'), '09:05:07');
  assert.equal(intake.displayIntakeTime('2026-09-11T09:05'), '09:05');
  assert.equal(intake.displayIntakeTime(''), '');
  assert.equal(intake.buildIntakeDraft({
    sourceMode: 'live', occurredAt: '2026-09-11T09:05:07',
  }).occurredAt, '2026-09-11T09:05:07');
  const component = read('../components/CommandIntakeSheet.tsx');
  assert.match(component, /displayIntakeTime\(draft\.occurredAt\)/);
  assert.match(component, /step=\{type === 'datetime-local' \? 1 : undefined\}/);
});

test('the known API demo placeholder uses the same occurrence and narrative clock', () => {
  const hook = read('./use-alarm-intake.ts');
  assert.ok(hook.includes("demoPlaceholder ? '2026-09-11T20:13:50' : item.occurredAt"));
  assert.ok(hook.includes("demoPlaceholder ? '2026-09-11T20:14:50' : item.receivedAt || item.createdAt"));
  assert.ok(hook.includes('20:13:50时许'));
});
