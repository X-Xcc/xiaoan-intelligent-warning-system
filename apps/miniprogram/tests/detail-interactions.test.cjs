const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const babel = require('@babel/core')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const sourceRoot = path.resolve(__dirname, '../src')

function loadDetailModule(relativePath, taro = {}) {
  const cache = new Map()
  const element = (tag) => ({ children, className }) => React.createElement(tag, { className }, children)
  const components = {
    View: element('div'),
    Text: element('span'),
    Button: ({ children, className, disabled }) => React.createElement('button', { className, disabled }, children),
    Image: ({ src, className }) => React.createElement('img', { src, className }),
    Video: ({ src, className, controls, autoplay }) => React.createElement('video', { src, className, controls, autoPlay: autoplay }),
  }
  const ui = {
    Icon: ({ name }) => React.createElement('i', { 'data-icon': name }),
    Section: ({ title, children }) => React.createElement('section', null, React.createElement('h2', null, title), children),
  }
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename)
    const exports = {}
    cache.set(filename, exports)
    const code = babel.transformFileSync(filename, {
      configFile: false,
      babelrc: false,
      plugins: [
        ['@babel/plugin-transform-typescript', { isTSX: filename.endsWith('.tsx') }],
        ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
        '@babel/plugin-transform-modules-commonjs',
      ],
    }).code
    const localRequire = (id) => {
      if (id === '@tarojs/taro') return taro
      if (id === '@tarojs/components') return components
      if (id === '@/components/ui') return ui
      if (id === '@/utils/api') return { resolveEvidenceUrl: (url) => new URL(url, 'https://backend.test').href }
      if (id === '@/data/detail') return load(path.join(sourceRoot, 'data/detail.ts'))
      if (id.startsWith('@/assets/')) return 'brand.png'
      if (id.startsWith('./')) return load(path.resolve(path.dirname(filename), `${id}.ts`))
      return require(id)
    }
    new Function('exports', 'require', code)(exports, localRequire)
    return exports
  }
  return load(path.resolve(sourceRoot, relativePath))
}

test('cancelled phone confirmation does not call the number', async () => {
  const calls = []
  const actions = loadDetailModule('pages/detail/native-actions.ts', {
    showModal: async () => ({ confirm: false }),
    makePhoneCall: async (options) => calls.push(options),
  })
  await actions.confirmPhoneCall('13800000000', '联系提交人')
  assert.deepEqual(calls, [])
})

test('confirmed phone action dials the actual number without claiming connection', async () => {
  const calls = []
  const toasts = []
  const actions = loadDetailModule('pages/detail/native-actions.ts', {
    showModal: async () => ({ confirm: true }),
    makePhoneCall: async (options) => calls.push(options),
    showToast: async (options) => toasts.push(options),
  })
  await actions.confirmPhoneCall('+8613800000000', '联系提交人')
  assert.deepEqual(calls, [{ phoneNumber: '+8613800000000' }])
  assert.deepEqual(toasts, [])
})

test('failed phone launch reports failure, never success', async () => {
  const toasts = []
  const actions = loadDetailModule('pages/detail/native-actions.ts', {
    showModal: async () => ({ confirm: true }),
    makePhoneCall: async () => { throw new Error('unavailable') },
    showToast: async (options) => toasts.push(options),
  })
  await actions.confirmPhoneCall('13800000000', '联系提交人')
  assert.equal(toasts.length, 1)
  assert.match(toasts[0].title, /未能/)
  assert.equal(toasts[0].icon, 'none')
})

test('fallback and non-finite locations never reach the native map API', async () => {
  const calls = []
  const actions = loadDetailModule('pages/detail/native-actions.ts', {
    openLocation: async (options) => calls.push(options),
    showToast: async () => undefined,
  })
  for (const point of [
    undefined,
    { latitude: 28.66, longitude: 115.89, source: 'bay_fallback' },
    { latitude: 28.66, longitude: 115.89, source: 'manual_address' },
    { latitude: 28.66, longitude: NaN },
  ]) {
    await actions.openPoint(point, '东门')
  }
  assert.deepEqual(calls, [])
  await actions.openPoint({ latitude: 28.66, longitude: 115.89, name: '实际点位', source: 'gps' }, '东门', '东街')
  assert.deepEqual(calls, [{ latitude: 28.66, longitude: 115.89, name: '实际点位', address: '东街', scale: 16 }])
})

test('lost entry redirects to the indexed main-page workflow', async () => {
  const destinations = []
  const actions = loadDetailModule('pages/detail/native-actions.ts', {
    redirectTo: async (options) => destinations.push(options.url),
  })
  await actions.goToMain('tab=home&panel=lost')
  assert.deepEqual(destinations, ['/pages/main/main?tab=home&panel=lost'])
})

test('evidence renders actual images and playable video with backend-resolved URLs', () => {
  const { EventEvidence } = loadDetailModule('pages/detail/event-evidence.tsx')
  const html = renderToStaticMarkup(React.createElement(EventEvidence, {
    items: [
      { kind: 'image', url: '/api/events/evidence/photo.jpg', name: '现场照片' },
      { kind: 'video', url: '/api/events/evidence/video.mp4', name: '现场视频' },
    ],
  }))
  assert.match(html, /<img[^>]+src="https:\/\/backend\.test\/api\/events\/evidence\/photo\.jpg"/)
  assert.match(html, /<video[^>]+src="https:\/\/backend\.test\/api\/events\/evidence\/video\.mp4"[^>]+controls/ )
  assert.doesNotMatch(html, /autoplay/i)
})

test('unsafe evidence addresses are not rendered as media', () => {
  const { EventEvidence } = loadDetailModule('pages/detail/event-evidence.tsx')
  const html = renderToStaticMarkup(React.createElement(EventEvidence, {
    items: [{ kind: 'image', url: 'javascript:alert(1)' }],
  }))
  assert.doesNotMatch(html, /<img|javascript:/)
  assert.match(html, /附件地址不可用/)
})

test('malformed evidence URLs show an unavailable attachment instead of crashing the page', () => {
  const { EventEvidence } = loadDetailModule('pages/detail/event-evidence.tsx')
  const html = renderToStaticMarkup(React.createElement(EventEvidence, {
    items: [{ kind: 'image', url: 'http://[' }],
  }))
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /附件地址不可用/)
})

test('lost informational page has no fake registration or success record', () => {
  const { ServicePages } = loadDetailModule('pages/detail/service-pages.tsx')
  const html = renderToStaticMarkup(React.createElement(ServicePages, { type: 'lost' }))
  assert.match(html, /登记失物线索/)
  assert.match(html, /查看我的线索回执/)
  assert.doesNotMatch(html, /登记成功|已登记|DEMO-/)
})
