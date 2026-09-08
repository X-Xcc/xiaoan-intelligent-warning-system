const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');

test('shared mini-program UI replaces the legacy metric-card presentation', () => {
  const ui = path.join(root, 'src/components/ui.tsx');
  assert.ok(fs.existsSync(ui), 'The approved shared UI module must exist.');
  const source = fs.readFileSync(ui, 'utf8');
  for (const component of ['Icon', 'PageHeader', 'Section', 'EmptyState', 'BottomSheet', 'EventCard']) {
    assert.match(source, new RegExp(`export function ${component}\\b`), `${component} is available to every screen.`);
  }
  assert.doesNotMatch(source, /指挥中心已收到|已联系报警人|已请求支援/);
});

test('main routes to separate citizen and staff screens without a fake password login', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/main/main.tsx'), 'utf8');
  assert.match(source, /StaffWorkspace/);
  assert.match(source, /CitizenWorkspace/);
  assert.doesNotMatch(source, /login\(staffId\.trim\(\)\)/);
  assert.doesNotMatch(source, /function HomeView|function HelpView|function StaffWorkView/);
});

test('native icons are generated from the existing icon library', () => {
  const source = path.join(root, 'src/assets/icons/icon-assets.ts');
  assert.ok(fs.existsSync(source), 'Native-compatible PNG icon manifest must exist.');
  const manifest = fs.readFileSync(source, 'utf8');
  assert.match(manifest, /siren/);
  assert.match(manifest, /white/);
  assert.match(manifest, /\.png/);
});
