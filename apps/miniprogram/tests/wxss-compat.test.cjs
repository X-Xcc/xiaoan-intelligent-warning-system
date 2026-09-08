const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('WeChat global WXSS excludes browser-only universal motion reset', () => {
  const wxss = fs.readFileSync(path.resolve(__dirname, '../dist/app.wxss'), 'utf8');

  assert.equal(wxss.includes('@media (prefers-reduced-motion:reduce)'), false);
  assert.equal(wxss.includes('.mini-app *'), false);
  assert.equal(wxss.includes('overflow-wrap'), false);
  assert.equal(wxss.includes('max-content'), false);
});
