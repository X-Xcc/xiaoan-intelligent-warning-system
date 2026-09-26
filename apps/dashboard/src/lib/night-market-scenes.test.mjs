import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(path, loader) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = transformSync(source, { loader, format: 'cjs', jsx: 'automatic' }).code;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(
    name => name === '../lib/presentation' ? { appBasePath: '/test-app' } : require(name),
    module, module.exports,
  );
  return module.exports;
}

const { nightMarketScenes } = load('./night-market-scenes.ts', 'ts');
const { NightMarketStill } = load('../components/NightMarketStill.tsx', 'tsx');

test('fifteen distinct existing assets map to their burned-in camera numbers, reserving slot one', () => {
  assert.equal(nightMarketScenes.length, 16);
  assert.equal(nightMarketScenes[0].assetPath, undefined);
  const hashes = nightMarketScenes.slice(1).map((scene, i) => {
    assert.equal(scene.assetPath, `/night-market-cam-${String(i + 2).padStart(2, '0')}.png`);
    const bytes = fs.readFileSync(new URL(`../../public${scene.assetPath}`, import.meta.url));
    return createHash('sha256').update(bytes).digest('hex');
  });
  assert.equal(new Set(hashes).size, 15);
});

test('wall and focused samples respect deployment prefixes and explicitly remain non-live', () => {
  for (const compact of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(NightMarketStill, {
      ...nightMarketScenes[1], compact,
    }));
    assert.ok(html.includes('src="/test-app/night-market-cam-02.png"'));
    assert.ok(html.includes('AI 合成 · 非实时'));
    assert.ok(html.includes('东门主通道'));
    assert.ok(html.includes('data-preview-state="sample"'));
    assert.ok(!html.includes('data-preview-state="live"'));
    assert.ok(!html.includes('bridge-preview-live'));
  }
});
