const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function mount(name, props, taro = {}) {
  const slots = [];
  let cursor = 0, dirty = true, tree;
  const cleanups = [];
  const slot = (initial) => {
    const index = cursor++;
    if (!slots[index]) slots[index] = initial();
    return slots[index];
  };
  const react = {
    useState(value) {
      const state = slot(() => ({ value: typeof value === 'function' ? value() : value }));
      return [state.value, (next) => { state.value = typeof next === 'function' ? next(state.value) : next; dirty = true; }];
    },
    useRef: (value) => slot(() => ({ current: value })),
    useEffect(callback) { const state = slot(() => ({ ran: false })); if (!state.ran) { state.ran = true; cleanups.push(callback()); } },
  };
  const jsx = (type, values) => ({ type, props: values || {} });
  const components = new Proxy({}, { get: (_, key) => key === 'eventStatusLabels' ? { '已提交': '待平台确认' } : key });
  const source = buildSync({
    entryPoints: [path.resolve(__dirname, `../src/features/citizen/${name}.tsx`)],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    external: ['@/components/ui', '@/utils/navigation'], loader: { '.scss': 'empty' },
  }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', source)(module, module.exports, (id) => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id === '@tarojs/components' || id === '@/components/ui') return components;
    if (id === '@/utils/navigation') return { openDetail() {} };
    if (id === '@tarojs/taro') return { showToast() {}, ...taro };
    throw new Error(`Unexpected import: ${id}`);
  });
  const all = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props.children)];
  const text = (node) => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props.children);
  const render = () => { if (dirty) { dirty = false; cursor = 0; tree = module.exports[name](props); } };
  return {
    nodes(type) { render(); return all(tree).filter((node) => node.type === type); },
    button(label) { render(); const node = all(tree).find((item) => item.type === 'Button' && text(item) === label); assert.ok(node, `Button: ${label}`); return node; },
    async settle() { for (let index = 0; index < 8; index++) { render(); await new Promise(setImmediate); } },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()); },
  };
}
const controller = (extra = {}) => ({
  latestHelp: undefined, savedHelpId: '', loading: false, error: '', attachmentError: '',
  pendingEvidenceCount: 0, uploadingEvidence: false, reloadEvents: async () => {},
  retryHelpEvidence: async () => {}, createHelp: async () => ({}), ...extra,
});

test('late GPS cannot overwrite an edited and confirmed manual address', async () => {
  let resolve, payload;
  const location = new Promise((yes) => { resolve = yes; });
  const app = mount('AlarmScreen', { controller: controller({ createHelp: async (data) => { payload = data; } }) },
    { getLocation: () => location });
  app.button('一键报警SOS').props.onClick();
  const pending = app.button('获取当前位置').props.onClick();
  app.nodes('Input').find((node) => node.props.placeholder.includes('街道')).props.onInput({ detail: { value: '手填地址' } });
  app.button('确认位置').props.onClick();
  resolve({ latitude: 28, longitude: 115 });
  await pending;
  await app.settle();
  app.button('一键报警SOS').props.onClick();
  await app.button('发送求助').props.onClick();
  assert.equal(payload.bay, '手填地址');
  assert.equal('latitude' in payload, false);
  app.unmount();
});

test('unresolved saved help offers receipt recovery instead of the immediate alarm button', () => {
  const app = mount('AlarmScreen', { controller: controller({ savedHelpId: 'saved-help', loading: true }) });
  assert.equal(app.nodes('Button').some((node) => node.props.id === 'alarm-submit'), false);
  app.button('发起新的求助').props.onClick();
  assert.equal(app.nodes('Button').some((node) => node.props.id === 'alarm-submit'), true);
  app.unmount();
});

test('pending evidence has a retry action after remount even without an error string', async () => {
  let retries = 0;
  const app = mount('AlarmScreen', { controller: controller({ pendingEvidenceCount: 1, retryHelpEvidence: async () => { retries++; } }) });
  await app.button('重试上传附件（1）').props.onClick();
  assert.equal(retries, 1);
  app.unmount();
});

test('a different emergency can be started while an earlier help remains open', () => {
  const app = mount('AlarmScreen', { controller: controller({ latestHelp: { id: 'old', status: '已提交', owner: '待分配' } }) });
  app.button('发起新的求助').props.onClick();
  assert.equal(app.nodes('Button').some((node) => node.props.id === 'alarm-submit'), true);
  app.unmount();
});

test('report draft inputs are disabled until the pending server response settles', async () => {
  let resolve;
  const request = new Promise((yes) => { resolve = yes; });
  const app = mount('ReportScreen', { createReport: () => request, onProgress() {} });
  app.nodes('Input').find((node) => node.props.placeholder.includes('街道')).props.onInput({ detail: { value: '夜市入口' } });
  app.nodes('Textarea')[0].props.onInput({ detail: { value: '占用消防通道' } });
  const pending = app.button('提交上报').props.onClick();
  assert.equal(app.nodes('Input').every((node) => node.props.disabled === true), true);
  assert.equal(app.nodes('Textarea')[0].props.disabled, true);
  resolve({ id: 'report-1' });
  await pending;
  app.unmount();
});
