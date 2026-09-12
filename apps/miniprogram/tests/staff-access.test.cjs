const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { buildSync } = require('esbuild')

const directory = { items: [{ id: 'worker-1', name: 'Worker' }, { id: 'worker-2', name: 'Other' }] }
const deferred = () => {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}
const code = buildSync({
  entryPoints: [path.resolve(__dirname, '../src/features/StaffAccess.tsx')],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  external: ['@/components/ui', '@/utils/api'],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.TARO_APP_ENABLE_DEV_LOGIN': '"false"' },
  logLevel: 'silent',
}).outputFiles[0].text

function mount(request = async () => directory) {
  const slots = [], calls = [], entered = []
  let cursor = 0, dirty = true, alive = true, tree, effects = [], lateWrites = 0
  const slot = (initial) => {
    const index = cursor++
    return slots[index] || (slots[index] = initial())
  }
  const react = {
    useState(initial) {
      const state = slot(() => ({ value: initial }))
      return [state.value, (value) => {
        if (!alive) { lateWrites++; return }
        state.value = typeof value === 'function' ? value(state.value) : value
        dirty = true
      }]
    },
    useRef: (initial) => slot(() => ({ current: initial })),
    useEffect(effect, deps) {
      const state = slot(() => ({}))
      if (!state.deps || deps.some((value, index) => !Object.is(value, state.deps[index]))) {
        state.deps = deps
        effects.push(() => { state.cleanup?.(); state.cleanup = effect() })
      }
    },
  }
  const jsx = (type, props) => ({ type, props: props || {} })
  const components = new Proxy({}, { get: (_, key) => key })
  const api = {
    getAuthToken: () => '',
    requestApi: async (url) => { calls.push(url); return request(url) },
  }
  const output = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === '@tarojs/components' || id === '@/components/ui') return components
    if (id === '@/utils/api') return api
    if (id === '@tarojs/taro') return { login: async () => { calls.push('wechat'); throw new Error('No login allowed') } }
    throw new Error(`Unexpected import: ${id}`)
  }, output, output.exports)
  const all = (node) => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props.children)]
  const text = (node) => node == null || typeof node === 'boolean' ? ''
    : typeof node !== 'object' ? String(node)
      : Array.isArray(node) ? node.map(text).join('') : text(node.props.children)
  const find = (type) => all(tree).find((node) => node.type === type)
  return {
    calls, entered,
    get lateWrites() { return lateWrites },
    async settle() {
      for (let i = 0; i < 8; i++) {
        if (alive && dirty) {
          dirty = false; cursor = 0
          tree = output.exports.StaffAccess({ onEnter: (name) => entered.push(name), onBack: () => {} })
          const pending = effects; effects = []
          pending.forEach((effect) => effect())
        }
        await new Promise(setImmediate)
      }
    },
    picker: () => find('Picker'),
    enter: () => all(tree).find((node) => node.type === 'Button' && node.props.className === 'mini-primary mini-block'),
    retry: () => all(tree).find((node) => node.type === 'Button' && /重试/.test(text(node))),
    back: () => find('PageHeader').props.onBack(),
    text: () => text(tree),
    unmount() { alive = false; slots.forEach((state) => state.cleanup?.()) },
  }
}

test('staff entry loads real directory without WeChat, token, roles, or automatic identity', async () => {
  const app = mount()
  await app.settle()
  assert.deepEqual(app.calls, ['/events/staff'])
  assert.deepEqual(app.entered, [])
  assert.equal(app.enter().props.disabled, true)
  assert.deepEqual(app.picker().props.range, directory.items)
  app.picker().props.onChange({ detail: { value: '1' } })
  await app.settle()
  const enter = app.enter().props.onClick
  enter(); enter()
  assert.deepEqual(app.entered, ['Other'])
})

test('invalid selection never fabricates a worker', async () => {
  const app = mount()
  await app.settle()
  assert.ok(app.picker(), 'Directory selection is available')
  app.picker().props.onChange({ detail: { value: '99' } })
  await app.settle()
  app.enter().props.onClick()
  assert.deepEqual(app.entered, [])
})

for (const items of [[], [{ id: 'x', name: '' }], [{ name: 'Missing ID' }],
  [{ id: 'x', name: 'Same' }, { id: 'y', name: 'Same' }]]) {
  test(`empty, invalid or ambiguous directory cannot supply identity: ${JSON.stringify(items)}`, async () => {
    const app = mount(async () => ({ items }))
    await app.settle()
    assert.deepEqual(app.calls, ['/events/staff'])
    assert.deepEqual(app.entered, [])
    assert.equal(app.enter().props.disabled, true)
    assert.ok(app.retry())
  })
}

test('directory failure remains retryable', async () => {
  let attempts = 0
  const app = mount(async () => {
    if (++attempts === 1) throw new Error('Directory unavailable')
    return directory
  })
  await app.settle()
  assert.match(app.text(), /Directory unavailable/)
  await app.retry().props.onClick()
  await app.settle()
  assert.deepEqual(app.picker().props.range, directory.items)
})

for (const exit of ['back', 'unmount']) {
  test(`late directory response after ${exit} cannot enter or update unmounted state`, async () => {
    const pending = deferred()
    const app = mount(() => pending.promise)
    await app.settle()
    assert.deepEqual(app.calls, ['/events/staff'])
    app[exit]()
    pending.resolve(directory)
    await app.settle()
    assert.deepEqual(app.entered, [])
    assert.equal(app.lateWrites, 0)
  })
}

test('a stale entry callback cannot enter after returning to citizens', async () => {
  const app = mount()
  await app.settle()
  assert.ok(app.picker())
  app.picker().props.onChange({ detail: { value: '0' } })
  await app.settle()
  const enter = app.enter().props.onClick
  app.back()
  enter()
  assert.deepEqual(app.entered, [])
})
