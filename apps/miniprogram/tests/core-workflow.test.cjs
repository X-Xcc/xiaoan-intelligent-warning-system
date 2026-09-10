const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { buildSync } = require('esbuild')
let activeHooks
const React = Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useEffect'].map(
  (name) => [name, (...args) => activeHooks[name](...args)],
))
async function act(callback) {
  await callback()
  await new Promise((resolve) => setImmediate(resolve))
}

const BASE = 'https://backend.example/api'
const TOKEN_KEY = 'yanhuo-shaobing-auth-token'
const src = path.resolve(__dirname, '../src')
const bundles = new Map()

function bundle(entry, taro, intervals = new Map(), environment = {}) {
  const key = JSON.stringify([entry, environment.base || BASE, environment.platform || 'weapp'])
  if (!bundles.has(key)) {
    bundles.set(key, buildSync({
      entryPoints: [path.join(src, entry)],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      external: ['react', '@tarojs/taro'],
      define: {
        'process.env.TARO_APP_API_BASE_URL': JSON.stringify(environment.base || BASE),
        'process.env.TARO_ENV': JSON.stringify(environment.platform || 'weapp'),
      },
      logLevel: 'silent',
    }).outputFiles[0].text)
  }
  const output = { exports: {} }
  let nextTimer = 0
  new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', 'window', bundles.get(key))(
    (name) => name === '@tarojs/taro' ? taro : name === 'react' ? React : require(name),
    output,
    output.exports,
    (callback) => { intervals.set(++nextTimer, callback); return nextTimer },
    (id) => intervals.delete(id),
    environment.window,
  )
  return output.exports
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function within(promise) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Operation did not return promptly')), 100) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function event(id = 'HELP-1', patch = {}) {
  return {
    id, kind: 'help', title: 'Help', bay: 'North entrance', level: '高风险',
    source: '夜市平安码', status: '已提交', owner: '待派单', distance: '待派单',
    time: '12:00', updatedAt: '12:00', description: 'Assistance requested',
    ...patch,
  }
}

function mocks(storage = new Map([[TOKEN_KEY, 'session-a']])) {
  const calls = []
  const lifecycle = {}
  const taro = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
    request: async (options) => {
      calls.push({ type: 'request', ...options })
      return { statusCode: 200, data: { event: event(), items: [event('OTHER-PERSON')] } }
    },
    uploadFile: async (options) => {
      calls.push({ type: 'upload', ...options })
      return { statusCode: 200, data: JSON.stringify({ evidence: { kind: 'image', url: '/api/events/evidence/a.jpg' } }) }
    },
    getLocation: async () => {
      calls.push({ type: 'gps' })
      return { latitude: 28, longitude: 115 }
    },
    showToast: () => {},
    useDidShow: (callback) => React.useEffect(() => { lifecycle.show = callback }),
    useDidHide: (callback) => React.useEffect(() => { lifecycle.hide = callback }),
  }
  return { taro, storage, calls, lifecycle }
}

async function mount(m = mocks()) {
  const intervals = new Map()
  const { useSafetyEvents } = bundle('hooks/useSafetyEvents.ts', m.taro, intervals)
  const slots = []
  let cursor = 0
  let alive = true
  let queued = false
  let effects = []
  let current
  const changed = (previous, next) => !previous || !next || next.some((value, i) => !Object.is(value, previous[i]))
  const schedule = () => {
    if (!alive || queued) return
    queued = true
    queueMicrotask(() => { queued = false; if (alive) render() })
  }
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, (update) => {
        const next = typeof update === 'function' ? update(slots[index].value) : update
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; schedule() }
      }]
    },
    useRef(initial) {
      const index = cursor++
      return (slots[index] ||= { current: initial })
    },
    useMemo(factory, deps) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: factory(), deps }
      return slots[index].value
    },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps) },
    useEffect(callback, deps) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].deps, deps)) {
        const oldCleanup = slots[index]?.cleanup
        slots[index] = { deps }
        effects.push(() => { oldCleanup?.(); slots[index].cleanup = callback() })
      }
    },
  }
  function render() {
    cursor = 0
    effects = []
    activeHooks = hooks
    current = useSafetyEvents()
    for (const effect of effects) effect()
  }
  await act(async () => render())
  return {
    ...m, intervals,
    get value() { return current },
    rerender: () => act(async () => render()),
    close: async () => { alive = false; for (const slot of slots) slot?.cleanup?.() },
  }
}

test('public requests preserve backend validation detail and bound hanging requests', async () => {
  const m = mocks()
  const api = bundle('utils/api.ts', m.taro)
  assert.equal(typeof api.requestApi, 'function')
  m.taro.request = async () => ({
    statusCode: 422,
    data: { detail: [{ loc: ['body', 'bay'], msg: 'A place is required' }] },
  })
  await assert.rejects(api.requestApi('/events/help'), /bay.*A place is required/)
  let aborted = false
  m.taro.request = (options) => {
    assert.equal(options.timeout, 10)
    return Object.assign(new Promise(() => {}), { abort: () => { aborted = true } })
  }
  await assert.rejects(api.requestApi('/events/help', { timeout: 10 }), /超时|timeout/i)
  assert.equal(aborted, true)
})

test('upload rejects missing or unsafe URLs and resolves backend-relative URLs', async () => {
  const m = mocks()
  const api = bundle('utils/api.ts', m.taro)
  const evidence = await api.uploadEventEvidence('/tmp/a.jpg', 'image')
  assert.equal(evidence.url, `${BASE}/events/evidence/a.jpg`)
  assert.ok(m.calls[0].timeout > 0 && m.calls[0].timeout <= 30000)
  for (const payload of [{}, { evidence: { url: '' } }, { evidence: { url: 'javascript:bad' } }, { evidence: { url: 'http://[' } }]) {
    m.taro.uploadFile = async () => ({ statusCode: 200, data: JSON.stringify(payload) })
    await assert.rejects(api.uploadEventEvidence('/tmp/a.jpg', 'image'), /地址|URL|url/)
  }
  m.taro.uploadFile = async () => ({ statusCode: 413, data: '{"detail":"Evidence too large"}' })
  await assert.rejects(api.uploadEventEvidence('/tmp/a.jpg', 'image'), /Evidence too large/)
})

test('event detail resolves evidence in both metadata locations', async () => {
  const m = mocks()
  m.taro.request = async () => ({ statusCode: 200, data: { event: event('H', {
    meta: { evidence: [{ kind: 'image', url: '/api/events/evidence/a.jpg' }],
      context: { evidence: [{ kind: 'video', url: 'events/evidence/v.mp4' }] } },
  }) } })
  const api = bundle('utils/api.ts', m.taro)
  const result = await api.fetchSafetyEvent('H')
  assert.equal(result.meta.evidence[0].url, `${BASE}/events/evidence/a.jpg`)
  assert.equal(result.meta.context.evidence[0].url, `${BASE}/events/evidence/v.mp4`)
})

test('auth helpers expose the current user and clear the local session', async () => {
  const m = mocks()
  const user = { openid: 'alice', role: '群众', permissions: ['help'], lastLoginAt: '' }
  m.taro.request = async () => ({ statusCode: 200, data: { user } })
  const api = bundle('utils/api.ts', m.taro)
  assert.equal(typeof api.getAuthToken, 'function')
  assert.equal(api.getAuthToken(), 'session-a')
  assert.deepEqual(await api.getCurrentUser(), user)
  api.clearAuthSession()
  assert.equal(api.getAuthToken(), '')
})

test('empty citizen receipts never fetch the global collection', async (t) => {
  const h = await mount()
  t.after(() => h.close())
  assert.equal(h.calls.filter((call) => call.type === 'request').length, 0)
  assert.deepEqual(h.value.events, [])
  assert.equal(h.value.loading, false)
})

test('help creates and registers a receipt before evidence; failures remain retryable', async (t) => {
  const m = mocks()
  const upload = deferred()
  m.taro.uploadFile = (options) => { m.calls.push({ type: 'upload', ...options }); return upload.promise }
  const h = await mount(m)
  t.after(() => h.close())
  t.after(() => upload.resolve({ statusCode: 500, data: '{}' }))
  let created
  await act(async () => {
    created = await within(h.value.createHelp({
      bay: 'North entrance', evidence: [{ kind: 'image', filePath: '/tmp/help.jpg' }],
    }))
  })
  assert.equal(created.id, 'HELP-1')
  assert.equal(h.value.latestHelp.id, created.id)
  assert.equal(h.value.pendingEvidenceCount, 1)
  assert.equal(h.calls.some((call) => call.type === 'gps'), false)
  const request = h.calls.find((call) => call.url === `${BASE}/events/help`)
  assert.equal(request.data.bay, 'North entrance')
  assert.equal(request.data.latitude, undefined)
  assert.equal(request.data.longitude, undefined)
  assert.equal(request.data.zoneId, undefined)
  assert.deepEqual(request.data.evidence || [], [])
  assert.ok(JSON.stringify([...h.storage.values()]).includes(created.id))
  await act(async () => upload.reject(new Error('Upload offline')))
  assert.match(h.value.attachmentError, /Upload offline/)
  assert.equal(h.value.pendingEvidenceCount, 1)
  h.taro.uploadFile = async () => ({ statusCode: 200, data: '{"evidence":{"kind":"image","url":"/api/events/evidence/a.jpg"}}' })
  await act(async () => h.value.retryHelpEvidence())
  assert.equal(h.value.pendingEvidenceCount, 0)
  assert.equal(h.value.attachmentError, '')
  const supplement = h.calls.find((call) => call.url.endsWith('/supplement'))
  assert.equal(supplement.method, 'PATCH')
  assert.equal(supplement.data.evidence[0].url, `${BASE}/events/evidence/a.jpg`)
  assert.equal(h.calls.filter((call) => call.url === `${BASE}/events/help`).length, 1)
})

test('help accepts explicit coordinates, rejects blank or partial location without GPS', async (t) => {
  const h = await mount()
  t.after(() => h.close())
  await act(async () => {
    await assert.rejects(h.value.createHelp({}), /地点|地址|bay/i)
    await assert.rejects(h.value.createHelp({ bay: '   ' }), /地点|地址|bay/i)
    await assert.rejects(h.value.createHelp({ bay: 'North', latitude: 28 }), /坐标|latitude|longitude/i)
    await assert.rejects(h.value.createHelp({ bay: 'North', latitude: 95, longitude: 115 }), /坐标|latitude/i)
    await h.value.createHelp({ bay: 'North', latitude: 0, longitude: 0 })
  })
  const call = h.calls.find((item) => item.url === `${BASE}/events/help`)
  assert.equal(call.data.latitude, 0)
  assert.equal(call.data.longitude, 0)
  assert.equal(h.calls.some((item) => item.type === 'gps'), false)
})

test('same-tick help submissions are locked before React rerenders', async (t) => {
  const m = mocks()
  const response = deferred()
  m.taro.request = (options) => { m.calls.push(options); return response.promise }
  const h = await mount(m)
  t.after(() => h.close())
  t.after(() => response.resolve({ statusCode: 200, data: { event: event() } }))
  await act(async () => {
    const first = h.value.createHelp({ bay: 'North' })
    await assert.rejects(within(h.value.createHelp({ bay: 'North' })), /提交|处理中|进行中|busy/i)
    response.resolve({ statusCode: 200, data: { event: event() } })
    await first
  })
  assert.equal(h.calls.filter((call) => call.url === `${BASE}/events/help`).length, 1)
})

test('receipts reload only their IDs, preserve stale data, dedupe, and partition sessions', async (t) => {
  const m = mocks()
  let h = await mount(m)
  t.after(() => h.close())
  await act(async () => h.value.createHelp({ bay: 'North' }))
  await h.close()
  h = await mount(m)
  assert.equal(h.value.latestHelp.id, 'HELP-1')
  assert.equal(h.calls.some((call) => call.url === `${BASE}/events`), false)
  m.taro.request = async () => { throw { errMsg: 'Network offline' } }
  await act(async () => h.value.reloadEvents())
  assert.equal(h.value.events.length, 1)
  assert.match(h.value.error, /Network offline/)
  m.taro.request = async () => ({ statusCode: 200, data: { event: event() } })
  await act(async () => h.value.reloadEvents())
  await act(async () => h.value.reloadEvents())
  assert.equal(h.value.events.length, 1)
  m.storage.set(TOKEN_KEY, 'session-b')
  await h.rerender()
  assert.deepEqual(h.value.events, [])
  assert.equal(h.value.latestHelp, undefined)
  m.storage.set(TOKEN_KEY, 'session-a')
  await h.rerender()
  assert.equal(h.value.latestHelp.id, 'HELP-1')
})

test('polling pauses on hide and cleans up on unmount', async () => {
  const h = await mount()
  assert.equal(h.intervals.size, 1)
  assert.equal(typeof h.lifecycle.hide, 'function')
  await act(async () => h.lifecycle.hide())
  assert.equal(h.intervals.size, 0)
  await act(async () => h.lifecycle.show())
  assert.equal(h.intervals.size, 1)
  await h.close()
  assert.equal(h.intervals.size, 0)
})

test('report uploads supplied files and never invents attachments from a numeric count', async (t) => {
  const h = await mount()
  t.after(() => h.close())
  const form = { category: 'Noise', bay: 'North', description: 'Noise', contact: '', anonymous: true }
  await act(async () => h.value.createReport(form, [{ kind: 'image', filePath: '/tmp/report.jpg' }]))
  await act(async () => h.value.createReport(form, 3))
  const reports = h.calls.filter((call) => call.url === `${BASE}/events/reports`)
  assert.equal(reports[0].data.evidence.length, 1)
  assert.equal(reports[0].data.photoCount, 1)
  assert.equal(reports[1].data.photoCount, 0)
  assert.deepEqual(reports[1].data.evidence, [])
  assert.equal(h.calls.filter((call) => call.type === 'upload').length, 1)
})

test('cancel is an explicit request supplement, never a fabricated completion', async (t) => {
  const h = await mount()
  t.after(() => h.close())
  await act(async () => h.value.createHelp({ bay: 'North' }))
  await act(async () => h.value.cancelLatestHelp())
  assert.equal(h.calls.some((call) => call.url?.endsWith('/status')), false)
  assert.match(h.calls.find((call) => call.url?.endsWith('/supplement')).data.text, /申请|请求/)
  assert.equal(h.value.latestHelp.status, '已提交')
})

test('presentation uses status, not a suggested assignment, to report progress', () => {
  const { getEventHeadline, getEventProgress } = bundle('utils/event-state.ts', mocks().taro)
  const submitted = event('H', { meta: { assignment: { staffName: 'Suggested worker' }, route: { etaMinutes: 2 } } })
  assert.doesNotMatch(getEventHeadline(submitted), /已接收|已出发|已到达|已完成/)
  assert.equal(getEventProgress(event('H', { status: '已完成' })), 100)
  const progress = ['已提交', '已派单', '已接收', '已到达', '处理中', '已完成'].map((status) => getEventProgress(event('H', { status })))
  assert.ok(progress.every((value, index) => index === 0 || value > progress[index - 1]))
})

test('new evidence appends to latest help and retains uploaded files when supplement fails', async (t) => {
  const h = await mount()
  t.after(() => h.close())
  assert.equal(typeof h.value.addHelpEvidence, 'function')
  await act(async () => h.value.createHelp({ bay: 'North' }))
  const normalRequest = h.taro.request
  h.taro.request = async (options) => {
    if (options.url.endsWith('/supplement')) throw new Error('Supplement offline')
    return normalRequest(options)
  }
  await act(async () => h.value.addHelpEvidence([{ kind: 'image', filePath: '/tmp/later.jpg' }]))
  assert.equal(h.value.pendingEvidenceCount, 1)
  assert.match(h.value.attachmentError, /Supplement offline/)
  const uploadCount = h.calls.filter((call) => call.type === 'upload').length
  h.taro.request = normalRequest
  await act(async () => h.value.retryHelpEvidence())
  assert.equal(h.value.pendingEvidenceCount, 0)
  assert.equal(h.calls.filter((call) => call.type === 'upload').length, uploadCount)
  assert.equal(h.calls.filter((call) => call.url === `${BASE}/events/help`).length, 1)
})

test('a report cannot switch authenticated sessions between upload and creation', async () => {
  const m = mocks()
  const upload = deferred()
  m.taro.uploadFile = () => upload.promise
  const api = bundle('utils/api.ts', m.taro)
  const report = api.createReportEvent(
    { category: 'Noise', bay: 'North', description: '', contact: '', anonymous: false },
    [{ kind: 'image', filePath: '/tmp/report.jpg' }],
  )
  m.storage.set(TOKEN_KEY, 'session-b')
  upload.resolve({ statusCode: 200, data: '{"evidence":{"kind":"image","url":"/api/events/evidence/a.jpg"}}' })
  await assert.rejects(report, /会话|登录|session/i)
  assert.equal(m.calls.some((call) => call.url === `${BASE}/events/reports`), false)
})

test('invalid optional evidence must not prevent a successful help receipt', async (t) => {
  const h = await mount()
  t.after(() => h.close())
  let created
  await act(async () => {
    created = await h.value.createHelp({ bay: 'North', evidence: [{ kind: 'image', filePath: '' }] })
  })
  assert.equal(created.id, 'HELP-1')
  assert.equal(h.value.latestHelp.id, created.id)
  assert.match(h.value.attachmentError, /证据|文件/)
})

test('an older receipt fetch cannot overwrite a successful local status update', async (t) => {
  const h = await mount()
  t.after(() => h.close())
  await act(async () => h.value.createHelp({ bay: 'North' }))
  const stale = deferred()
  h.taro.request = async (options) => options.url.endsWith('/status')
    ? { statusCode: 200, data: { event: event('HELP-1', { status: '已接收' }) } }
    : stale.promise
  const reload = h.value.reloadEvents()
  await act(async () => h.value.updateEventStatus('HELP-1', '已接收'))
  await act(async () => {
    stale.resolve({ statusCode: 200, data: { event: event() } })
    await reload
  })
  assert.equal(h.value.latestHelp.status, '已接收')
})

test('an old-session response and evidence job cannot populate a new session', async (t) => {
  const m = mocks()
  const response = deferred()
  m.taro.request = () => response.promise
  const h = await mount(m)
  t.after(() => h.close())
  const creation = h.value.createHelp({ bay: 'North', evidence: [{ kind: 'image', filePath: '/tmp/help.jpg' }] })
  m.storage.set(TOKEN_KEY, 'session-b')
  await h.rerender()
  await act(async () => {
    response.resolve({ statusCode: 200, data: { event: event() } })
    await creation
  })
  assert.deepEqual(h.value.events, [])
  assert.equal(h.value.pendingEvidenceCount, 0)
  assert.equal(h.calls.some((call) => call.type === 'upload'), false)
})

test('H5 relative API base resolves requests, evidence and realtime against browser origin', async () => {
  for (const origin of ['https://preview.example', 'http://127.0.0.1:54232']) {
    const m = mocks()
    m.taro.connectSocket = async (options) => {
      m.calls.push({ type: 'socket', ...options })
      return { onMessage() {}, onError() {}, close() {} }
    }
    const api = bundle('utils/api.ts', m.taro, new Map(), {
      base: '/api/', platform: 'h5', window: { location: { origin } },
    })
    assert.equal(api.resolveEvidenceUrl('/api/events/evidence/a.jpg'), `${origin}/api/events/evidence/a.jpg`)
    assert.equal(api.resolveEvidenceUrl('events/evidence/a.jpg'), `${origin}/api/events/evidence/a.jpg`)
    await api.fetchSafetyEvent('HELP-1')
    assert.equal(m.calls[0].url, `${origin}/api/events/HELP-1`)
    const disconnect = api.connectRealtimeEvents(() => {})
    await Promise.resolve()
    const socketUrl = new URL(m.calls.find((call) => call.type === 'socket').url)
    assert.equal(`${socketUrl.origin}${socketUrl.pathname}`, `${origin.replace(/^http/, 'ws')}/api/events/realtime`)
    assert.equal(socketUrl.searchParams.get('token'), 'session-a')
    disconnect()
  }
})

test('native absolute backend works without any browser globals', async () => {
  const m = mocks()
  const api = bundle('utils/api.ts', m.taro, new Map(), { platform: 'weapp' })
  assert.equal(api.resolveEvidenceUrl('/api/events/evidence/a.jpg'), `${BASE}/events/evidence/a.jpg`)
  await api.fetchSafetyEvent('HELP-1')
  assert.equal(m.calls[0].url, `${BASE}/events/HELP-1`)
})

test('savedHelpId survives remount and failed detail fetch without leaking across sessions', async (t) => {
  const m = mocks()
  let h = await mount(m)
  t.after(() => h.close())
  await act(async () => h.value.createHelp({ bay: 'North' }))
  await h.close()
  m.taro.request = async () => { throw new Error('Receipt offline') }
  h = await mount(m)
  assert.equal(h.value.savedHelpId, 'HELP-1')
  assert.equal(h.value.latestHelp, undefined)
  assert.equal(h.value.loading, false)
  assert.match(h.value.error, /Receipt offline/)
  await act(async () => h.value.reloadEvents())
  assert.equal(h.value.savedHelpId, 'HELP-1')
  m.storage.set(TOKEN_KEY, 'session-b')
  await h.rerender()
  assert.equal(h.value.savedHelpId, '')
  m.storage.set(TOKEN_KEY, 'session-a')
  await h.rerender()
  assert.equal(h.value.savedHelpId, 'HELP-1')
  assert.equal(h.value.latestHelp, undefined)
})
