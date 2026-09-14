import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);

function load(relativePath) {
  const path = new URL(relativePath, import.meta.url);
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(path)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${outputFiles[0].text}\n})`)(require, module, module.exports);
  return module.exports;
}

const model = load('./contact-case-map.ts');

test('separates CR-019 and CR-020 map variants', () => {
  assert.equal(typeof model.getCaseMapVariant, 'function');

  const cr020 = model.getCaseMapVariant('CR-020');
  assert.equal(cr020.id, 'CR-020');
  assert.equal(cr020.overlapRate, 5);
  assert.ok(cr020.comparisonRoute.length > 0);
  assert.ok(cr020.comparisonRoute.some(point => point[0] === 640 && point[1] === 365));

  const cr019 = model.getCaseMapVariant('CR-019');
  assert.equal(cr019.id, 'CR-019');
  assert.ok(cr019.route.length > 0);
  assert.notDeepEqual(cr019.route, cr020.route);
  assert.deepEqual(cr019.comparisonRoute, []);

  assert.notEqual(cr019.title, cr020.title);
});
