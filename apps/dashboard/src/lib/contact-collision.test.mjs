import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

async function load(name) {
  const context = vm.createContext({});
  const modules = new Map();
  async function get(file) {
    if (modules.has(file.href)) return modules.get(file.href);
    const source = fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(
      stripTypeScriptTypes(source, { mode: 'transform' }),
      { context, identifier: file.href },
    );
    modules.set(file.href, module);
    await module.link((specifier, parent) => get(new URL(`${specifier}.ts`, parent.identifier)));
    return module;
  }
  const module = await get(new URL(`./${name}.ts`, import.meta.url));
  await module.evaluate();
  return module.namespace;
}

test('虚拟轨迹碰撞数据保持四人四线和关键证据点', async () => {
  const {
    collisionEvidencePoints,
    collisionOverlapRate,
    collisionRoutes,
  } = await load('contact-collision');

  assert.equal(collisionRoutes.length, 4);
  assert.equal(collisionRoutes.map((route) => route.person).join('|'), '赵六|受害人|张三|李四');
  assert.ok(collisionRoutes.every((route) => route.points.length >= 4));
  assert.equal(new Set(collisionRoutes.map((route) => route.color)).size, 4);
  assert.equal(collisionOverlapRate, 68);
  assert.equal(
    collisionEvidencePoints.map((point) => point.label).join('|'),
    'P-03 · 第一次接触|案发地 · 同时接触|P-04 · 再次重合',
  );
  assert.ok(collisionEvidencePoints.every((point) => point.imagePath.startsWith('/contact-review-assets/')));
});
