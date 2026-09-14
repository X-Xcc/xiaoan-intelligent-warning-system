import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function renderPage(markedIds = []) {
  let exported;
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const load = relative => {
    const module = { exports: {} };
    const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
    vm.runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
      module, exports: module.exports,
      require(name) {
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
        if (name === 'react') return {
          useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }),
          useState: value => [typeof value === 'function' ? value() : value, () => {}],
        };
        if (name.endsWith('/contact-review')) {
          const data = load('./contact-review.ts');
          return { ...data, contactReviewCsv(records, draft) {
            exported = Array.from(records, record => record.occurredAt);
            return data.contactReviewCsv(records, draft);
          } };
        }
        return {};
      },
      localStorage: { getItem: () => JSON.stringify({
        version: 1, reviews: Object.fromEntries(markedIds.map(id => [id, { status: '已标记', note: '' }])),
      }) },
      URL: { createObjectURL: () => 'blob:export', revokeObjectURL() {} }, Blob,
      document: { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) },
      window: { setTimeout() {} },
    });
    return module.exports;
  };
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    walk(node.props?.children);
  }
  walk(load('../pages/ContactReviewPage.tsx').ContactReviewPage({ onBack() {} }));
  return { nodes, exported: () => exported };
}

test('contact review waits for a search before rendering record images', () => {
  const { nodes } = renderPage();
  assert.equal(nodes.find(node => node.props?.['aria-label'] === '结果排序').props.value, 'oldest');
  const cards = nodes.filter(node => /^查看 CR-/.test(node.props?.['aria-label'] ?? ''));
  assert.equal(cards.length, 0);
  assert.equal(nodes.find(node => node.props?.className === 'cr-search-empty').props.role, 'status');
});

test('marked-record exports follow the same forward time order', () => {
  const page = renderPage(['CR-001', 'CR-010', 'CR-020']);
  page.nodes.find(node => node.type === 'button' && node.props?.onClick?.name === 'exportRecords').props.onClick();
  assert.deepEqual(page.exported().map(value => value.slice(11)), ['20:13:50', '20:23:50', '20:32:50']);
});
