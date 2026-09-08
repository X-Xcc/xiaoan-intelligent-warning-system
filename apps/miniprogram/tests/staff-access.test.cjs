const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { buildSync } = require('esbuild')

const TOKEN_KEY = 'yanhuo-shaobing-auth-token'
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const user = { openid: 'worker-openid', displayName: 'Worker', role: '巡防', permissions: ['dispatch'] }
const session = { token: 'fresh-token', user, provider: 'wechat' }
const directory = { items: [{ id: 'worker-1', name: 'Worker' }] }
const devDirectory = { items: [{ id: 'other', name: 'Other worker' }, { id: 'wang', name: '王队' }] }
const bundles = new Map()

function mount({ development = false, environment = development ? 'development' : 'production' } = {}) {
  let token = 'expired-token'
  const calls = [], entered = [], slots = []
  let cursor = 0, dirty = true, alive = true, tree, effects = [], lateWrites = 0, backs = 0
  const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const slot = (initial) => {
    const index = cursor++
    return slots[index] || (slots[index] = initial())
  }
  const react = {
    useState(initial) {
      const state = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }))
      return [state.value, (value) => {
        if (!alive) { lateWrites++; return }
        state.value = typeof value === 'function' ? value(state.value) : value
        dirty = true
      }]
    },
    useRef: (initial) => slot(() => ({ current: initial })),
    useCallback(callback, deps) {
      const state = slot(() => ({}))
      if (!sameDeps(state.deps, deps)) { state.deps = deps; state.value = callback }
      return state.value
    },
    useEffect(effect, deps) {
      const state = slot(() => ({}))
      if (!sameDeps(state.deps, deps)) {
        state.deps = deps
        effects.push(() => { state.cleanup?.(); state.cleanup = effect() })
      }
    },
  }
  const taro = {
    getStorageSync: () => token,
    setStorageSync(key, value) { assert.equal(key, TOKEN_KEY); calls.push(['save-token', value]); token = value },
    login: async () => { calls.push(['wechat']); return { code: 'fresh-code' } },
  }
  const api = {
    getAuthToken: () => token,
    requestApi: async (url, options) => {
      calls.push([url, options, token])
      if (url === '/auth/wechat-login') return session
      if (url === '/auth/me') return { user }
      if (url === '/events/staff') return development && environment === 'development' ? devDirectory : directory
      throw new Error(`Unexpected endpoint: ${url}`)
    },
    async loginWithWechat() {
      const result = await taro.login()
      const next = await api.requestApi('/auth/wechat-login', { method: 'POST', data: { code: result.code } })
      taro.setStorageSync(TOKEN_KEY, next.token)
      return next
    },
  }
  const bundleKey = `${development}:${environment}`
  if (!bundles.has(bundleKey)) {
    bundles.set(bundleKey, buildSync({
      entryPoints: [path.resolve(__dirname, '../src/features/StaffAccess.tsx')],
      bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
      external: ['@/components/ui', '@/utils/api'],
      define: {
        'process.env.TARO_APP_ENABLE_DEV_LOGIN': JSON.stringify(String(development)),
        'process.env.NODE_ENV': JSON.stringify(environment),
      },
      logLevel: 'silent',
    }).outputFiles[0].text)
  }
  const jsx = (type, props) => ({ type, props: props || {} })
  const components = new Proxy({}, { get: (_, key) => key })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundles.get(bundleKey))((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === '@tarojs/components' || id === '@/components/ui') return components
    if (id === '@tarojs/taro') return taro
    if (id === '@/utils/api') return api
    throw new Error(`Unexpected import: ${id}`)
  }, module, module.exports)
  const all = (node) => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props.children)]
  const text = (node) => node == null || typeof node === 'boolean' ? ''
    : typeof node !== 'object' ? String(node)
      : Array.isArray(node) ? node.map(text).join('') : text(node.props.children)
  const find = (predicate) => {
    const found = all(tree).find(predicate)
    assert.ok(found, 'Expected control is present')
    return found
  }
  return {
    api, taro, calls, entered,
    get token() { return token },
    set token(value) { token = value },
    get backs() { return backs },
    get lateWrites() { return lateWrites },
    async settle() {
      for (let i = 0; i < 8; i++) {
        if (alive && dirty) {
          dirty = false
          cursor = 0
          tree = module.exports.StaffAccess({ onEnter: (name) => entered.push(name), onBack: () => backs++ })
          const pending = effects; effects = []
          pending.forEach((effect) => effect())
        }
        await new Promise(setImmediate)
      }
    },
    enter: () => find((node) => node.type === 'Button' && node.props.className === 'mini-primary mini-block'),
    inputs: () => all(tree).filter((node) => node.type === 'Input'),
    input(id) { return find((node) => node.type === 'Input' && node.props.id === id) },
    fill(id, value) { this.input(id).props.onInput({ detail: { value } }) },
    back(header = false) {
      if (header) find((node) => node.type === 'PageHeader').props.onBack()
      else find((node) => node.type === 'Button' && node.props.className === 'mini-secondary mini-block').props.onClick()
    },
    text: () => text(tree),
    unmount() { alive = false; slots.forEach((state) => state.cleanup?.()) },
  }
}

test('explicit production entry refreshes an expired token before role and staff checks', async () => {
  const app = mount()
  await app.settle()
  await app.enter().props.onClick()
  await app.settle()
  assert.deepEqual(app.calls.map(([name]) => name), ['wechat', '/auth/wechat-login', 'save-token', '/auth/me', '/events/staff'])
  assert.deepEqual(app.calls[1][1], { method: 'POST', data: { code: 'fresh-code' } })
  assert.equal(app.token, session.token)
  assert.deepEqual(app.entered, ['Worker'])
  assert.equal(app.enter().props.disabled, undefined)
})

for (const exit of ['back', 'header', 'unmount']) {
  test(`${exit} during login prevents credential writes and workbench entry`, async () => {
    const app = mount()
    const pending = deferred()
    app.token = ''
    const request = app.api.requestApi
    app.api.requestApi = (url, options) => url === '/auth/wechat-login' ? pending.promise : request(url, options)
    await app.settle()
    const job = app.enter().props.onClick()
    await app.settle()
    if (exit === 'unmount') app.unmount()
    else app.back(exit === 'header')
    pending.resolve(session)
    await job
    await app.settle()
    assert.equal(app.token, '')
    assert.deepEqual(app.entered, [])
    assert.equal(app.calls.some(([url]) => url === '/auth/me'), false)
    assert.equal(app.lateWrites, 0)
  })
}

test('Back while WeChat permission is pending prevents the login HTTP request', async () => {
  const app = mount()
  const pending = deferred()
  app.token = ''
  app.taro.login = () => pending.promise
  await app.settle()
  const job = app.enter().props.onClick()
  app.back()
  pending.resolve({ code: 'late-code' })
  await job
  assert.deepEqual(app.calls, [])
  assert.deepEqual(app.entered, [])
})

test('token changes during login cannot be overwritten by the old attempt', async () => {
  const app = mount()
  const pending = deferred()
  app.token = ''
  const request = app.api.requestApi
  app.api.requestApi = (url, options) => url === '/auth/wechat-login' ? pending.promise : request(url, options)
  await app.settle()
  const job = app.enter().props.onClick()
  await app.settle()
  app.token = 'another-account'
  pending.resolve(session)
  await job
  await app.settle()
  assert.equal(app.token, 'another-account')
  assert.deepEqual(app.entered, [])
  assert.match(app.text(), /会话|身份.*变更/)
  assert.equal(app.enter().props.disabled, undefined)
})

for (const endpoint of ['/auth/me', '/events/staff']) {
  test(`token changes during ${endpoint} invalidate verification`, async () => {
    const app = mount()
    const pending = deferred()
    const request = app.api.requestApi
    app.api.requestApi = (url, options) => url === endpoint ? pending.promise : request(url, options)
    await app.settle()
    const job = app.enter().props.onClick()
    await app.settle()
    app.token = 'another-account'
    pending.resolve(endpoint === '/auth/me' ? { user } : directory)
    await job
    await app.settle()
    assert.equal(app.token, 'another-account')
    assert.deepEqual(app.entered, [])
    assert.match(app.text(), /会话|身份.*变更/)
    assert.equal(app.enter().props.disabled, undefined)
    if (endpoint === '/auth/me') assert.equal(app.calls.some(([url]) => url === '/events/staff'), false)
  })
}

test('Back during staff lookup cannot enter after returning to citizens', async () => {
  const app = mount()
  const pending = deferred()
  const request = app.api.requestApi
  app.api.requestApi = (url, options) => url === '/events/staff' ? pending.promise : request(url, options)
  await app.settle()
  const job = app.enter().props.onClick()
  await app.settle()
  app.back()
  pending.resolve(directory)
  await job
  assert.equal(app.backs, 1)
  assert.deepEqual(app.entered, [])
})

test('same-tick entry clicks share one login attempt', async () => {
  const app = mount()
  const pending = deferred()
  let logins = 0
  app.token = ''
  app.taro.login = () => { logins++; return pending.promise }
  await app.settle()
  const action = app.enter().props.onClick
  const first = action(), second = action()
  assert.equal(logins, 1)
  pending.resolve({ code: 'code' })
  await Promise.all([first, second])
  assert.deepEqual(app.entered, ['Worker'])
})

test('failed authentication remains retryable without matching an HTTP error string', async () => {
  const app = mount()
  let logins = 0
  app.taro.login = async () => {
    logins++
    if (logins === 1) throw new Error('WeChat temporarily unavailable')
    return { code: 'retry-code' }
  }
  await app.settle()
  await app.enter().props.onClick()
  await app.settle()
  assert.match(app.text(), /WeChat temporarily unavailable/)
  assert.deepEqual(app.entered, [])
  assert.equal(app.enter().props.disabled, undefined)
  await app.enter().props.onClick()
  await app.settle()
  assert.equal(logins, 2)
  assert.deepEqual(app.entered, ['Worker'])
})

test('newly authenticated users still need both permission and a matching staff identity', async () => {
  for (const authorized of [false, true]) {
    const app = mount()
    const request = app.api.requestApi
    app.api.requestApi = (url, options) => {
      if (url === '/auth/me') return Promise.resolve({ user: authorized ? user : { ...user, permissions: [] } })
      if (url === '/events/staff') return Promise.resolve({ items: [] })
      return request(url, options)
    }
    await app.settle()
    await app.enter().props.onClick()
    await app.settle()
    assert.deepEqual(app.entered, [])
    assert.match(app.text(), authorized ? /未绑定/ : /未开通/)
  }
})

test('development account has masked password and does not depend on the staff directory', async () => {
  const app = mount({ development: true })
  await app.settle()
  assert.equal(app.inputs().length, 2)
  assert.equal(app.input('staff-password').props.password, true)
  assert.equal(app.enter().props.disabled, true)
  assert.match(app.text(), /开发测试账号/)
  assert.deepEqual(app.calls, [])
})

test('xx and 123 enter the explicitly bound backend worker without issuing a fake auth session', async () => {
  const app = mount({ development: true })
  await app.settle()
  app.fill('staff-account', ' xx ')
  app.fill('staff-password', '123')
  await app.settle()
  assert.equal(app.enter().props.disabled, undefined)
  const action = app.enter().props.onClick
  await Promise.all([action(), action()])
  await app.settle()
  assert.deepEqual(app.entered, ['王队'])
  assert.deepEqual(app.calls.map(([url]) => url), ['/events/staff'])
  assert.equal(app.token, 'expired-token')
  assert.equal(app.input('staff-password').props.value, '')
})

test('invalid development credentials cannot enter and remain retryable', async () => {
  const app = mount({ development: true })
  await app.settle()
  for (const [account, password] of [['', ''], ['xx', 'bad'], ['another', '123'], ['xx', '123 ']]) {
    app.fill('staff-account', account)
    app.fill('staff-password', password)
    await app.settle()
    await app.enter().props.onClick()
    await app.settle()
    assert.deepEqual(app.entered, [])
    assert.match(app.text(), /请输入账号和密码|账号或密码错误/)
  }
  app.fill('staff-account', 'xx')
  app.fill('staff-password', '123')
  await app.settle()
  await app.input('staff-password').props.onConfirm()
  assert.deepEqual(app.entered, ['王队'])
})

test('missing staff binding never falls back to another worker and is retryable', async () => {
  const app = mount({ development: true })
  const request = app.api.requestApi
  app.api.requestApi = async () => ({ items: [{ id: 'other', name: 'Other worker' }] })
  await app.settle()
  app.fill('staff-account', 'xx')
  app.fill('staff-password', '123')
  await app.settle()
  await app.enter().props.onClick()
  await app.settle()
  assert.deepEqual(app.entered, [])
  assert.match(app.text(), /未找到.*绑定.*工作人员/)
  assert.equal(app.enter().props.disabled, undefined)
  app.api.requestApi = request
  await app.enter().props.onClick()
  assert.deepEqual(app.entered, ['王队'])
})

for (const exit of ['back', 'unmount', 'session']) {
  test(`development directory lookup ignores late completion after ${exit}`, async () => {
    const app = mount({ development: true })
    const pending = deferred()
    app.api.requestApi = () => pending.promise
    await app.settle()
    app.fill('staff-account', 'xx')
    app.fill('staff-password', '123')
    await app.settle()
    const job = app.enter().props.onClick()
    await app.settle()
    assert.equal(app.enter().props.disabled, true)
    assert.equal(app.input('staff-account').props.disabled, true)
    if (exit === 'unmount') app.unmount()
    else if (exit === 'back') app.back()
    else app.token = 'another-session'
    pending.resolve(devDirectory)
    await job
    await app.settle()
    assert.deepEqual(app.entered, [])
    assert.equal(app.lateWrites, 0)
    if (exit === 'session') assert.match(app.text(), /会话.*变更/)
  })
}

test('staff directory failures preserve input for retry', async () => {
  const app = mount({ development: true })
  app.api.requestApi = async () => { throw new Error('Directory unavailable') }
  await app.settle()
  app.fill('staff-account', 'xx')
  app.fill('staff-password', '123')
  await app.settle()
  await app.enter().props.onClick()
  await app.settle()
  assert.deepEqual(app.entered, [])
  assert.match(app.text(), /Directory unavailable/)
  assert.equal(app.input('staff-password').props.value, '123')
  assert.equal(app.enter().props.disabled, undefined)
})

test('returning from development login prevents a stale confirm from entering', async () => {
  const app = mount({ development: true })
  await app.settle()
  app.fill('staff-account', 'xx')
  app.fill('staff-password', '123')
  await app.settle()
  const confirm = app.input('staff-password').props.onConfirm
  app.back()
  await confirm()
  assert.deepEqual(app.entered, [])
})

test('production never exposes development credentials even if the flag is forced on', async () => {
  const app = mount({ development: true, environment: 'production' })
  await app.settle()
  assert.deepEqual(app.inputs(), [])
  assert.doesNotMatch(app.text(), /开发测试账号/)
  await app.enter().props.onClick()
  assert.deepEqual(app.entered, ['Worker'])
  assert.equal(app.calls[0][0], 'wechat')
  assert.doesNotMatch(bundles.get('true:production'), /staff-account|staff-password|function DevStaffAccess/)
})
