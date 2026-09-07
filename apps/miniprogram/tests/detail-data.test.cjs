const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { stripTypeScriptTypes } = require('node:module')

const filename = path.resolve(__dirname, '../src/data/detail.ts')
const source = fs.readFileSync(filename, 'utf8')
let detail
test.before(async () => {
  const compiled = stripTypeScriptTypes(source)
  detail = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
})

const event = (overrides = {}) => ({
  id: 'receipt-1',
  kind: 'help',
  title: '现场求助',
  status: '已提交',
  bay: '东门',
  level: '中风险',
  source: '群众求助',
  owner: '待分配',
  description: '需要帮助',
  updatedAt: '19:41',
  time: '19:40',
  distance: '',
  ...overrides,
})

test('detail route preserves supported aliases and rejects prototype properties', () => {
  for (const type of ['serviceOrder', 'staffOrder', 'lost', 'rescue', 'bay']) {
    assert.equal(detail.normalizeDetailType(type), type)
  }
  for (const type of [undefined, '', 'missing', 'constructor', 'toString', '__proto__']) {
    assert.equal(detail.normalizeDetailType(type), 'guide')
  }
})

test('submitted receipt does not imply dispatch, acceptance, or arrival', () => {
  assert.equal(typeof detail.getReceiptSteps, 'function')
  const steps = detail.getReceiptSteps(event())
  assert.deepEqual(steps.filter((step) => step.state === 'current').map((step) => step.status), ['已提交'])
  assert.equal(steps.find((step) => step.status === '已接收').state, 'pending')
  assert.equal(steps.find((step) => step.status === '已到达').time, '')
})

test('receipt timeline uses recorded times, without inventing missing milestones', () => {
  assert.equal(typeof detail.getReceiptSteps, 'function')
  const steps = detail.getReceiptSteps(event({
    status: '已到达',
    createdAt: '2026-09-06T19:40:00',
    timeline: [
      { action: '创建求助', status: '已提交', createdAt: '2026-09-06T19:40:00' },
      { action: '更新状态', status: '已接收', createdAt: '2026-09-06T19:42:00' },
      { action: '补充说明', status: '已接收', createdAt: '2026-09-06T19:43:00' },
    ],
  }))
  assert.equal(steps.find((step) => step.status === '已派单').state, 'unrecorded')
  assert.equal(steps.find((step) => step.status === '已接收').time, '2026-09-06T19:42:00')
  assert.equal(steps.find((step) => step.status === '已到达').time, '')
  assert.equal(steps.find((step) => step.status === '已到达').state, 'current')
  assert.equal(steps.find((step) => step.status === '已完成').state, 'pending')
})

test('unknown status never fabricates receipt progress', () => {
  assert.equal(typeof detail.getReceiptSteps, 'function')
  const steps = detail.getReceiptSteps(event({ status: '待核验', timeline: [null, {}, { status: 3 }] }))
  assert.equal(steps.find((step) => step.status === '已接收').state, 'pending')
  assert.equal(steps.some((step) => step.state === 'current'), false)
})

test('supplement and review timestamps are not reported as acceptance timestamps', () => {
  const steps = detail.getReceiptSteps(event({
    status: '已到达',
    timeline: [
      { action: '补充说明', status: '已接收', createdAt: '2026-09-06T19:43:00' },
      { action: '画面复核', status: '已接收', createdAt: '2026-09-06T19:44:00' },
    ],
  }))
  assert.equal(steps.find((step) => step.status === '已接收').time, '')
  assert.equal(steps.find((step) => step.status === '已接收').state, 'unrecorded')
})

test('navigation requires a finite valid pair and rejects fallback/manual locations', () => {
  assert.equal(typeof detail.getNavigablePoint, 'function')
  const valid = { latitude: 28.66, longitude: 115.89, source: 'gps' }
  assert.deepEqual(detail.getNavigablePoint(valid), valid)
  assert.ok(detail.getNavigablePoint({ latitude: 0, longitude: 0 }))
  for (const point of [
    undefined,
    null,
    { latitude: 28 },
    { latitude: '28.66', longitude: 115 },
    { latitude: NaN, longitude: 115 },
    { latitude: 28, longitude: Infinity },
    { latitude: 91, longitude: 115 },
    { latitude: 28, longitude: -181 },
    { ...valid, source: 'bay_fallback' },
    { ...valid, source: 'manual_address' },
    { ...valid, source: ' MANUAL_ADDRESS ' },
  ]) {
    assert.equal(detail.getNavigablePoint(point), undefined)
  }
})

test('manual event location is not replaced by a route fallback', () => {
  assert.equal(typeof detail.getEventLocation, 'function')
  const manual = { latitude: 28.66, longitude: 115.89, source: 'manual_address', name: '用户填写的东门' }
  const point = detail.getEventLocation(event({
    meta: { alarmLocation: manual, route: { destination: { latitude: 28.7, longitude: 115.9 } } },
  }))
  assert.deepEqual(point, manual)
  assert.equal(detail.getNavigablePoint(point), undefined)
})

test('core manual-location metadata takes precedence over stale route coordinates', () => {
  const point = detail.getEventLocation(event({
    meta: {
      locationSource: 'manual',
      manualLocation: '东门水果摊旁',
      route: { destination: { latitude: 28.7, longitude: 115.9 } },
    },
  }))
  assert.equal(point.name, '东门水果摊旁')
  assert.equal(detail.getNavigablePoint(point), undefined)
})

test('partial context locations retain address information without navigation', () => {
  const point = detail.getEventLocation(event({
    meta: { context: { location: { name: '西门', source: 'manual' } } },
  }))
  assert.equal(point.name, '西门')
  assert.equal(detail.getNavigablePoint(point), undefined)
  assert.equal(detail.getNavigablePoint({ latitude: 28.66, longitude: 115.89, source: 'manual' }), undefined)
})

test('evidence merges real attachments, removes duplicates, and ignores malformed items', () => {
  assert.equal(typeof detail.getEventEvidence, 'function')
  const image = { kind: 'image', url: '/api/events/evidence/photo.jpg', name: '现场照片' }
  const video = { kind: 'video', url: 'https://example.test/video.mp4' }
  assert.deepEqual(detail.getEventEvidence(event({
    meta: {
      evidence: [image, null, { kind: 'image', url: ' ' }, { url: 'missing-kind' }],
      context: { evidence: [image, video] },
    },
  })), [image, video])
  assert.deepEqual(detail.getEventEvidence(event({ meta: { evidence: 'not-an-array' } })), [])
})

test('staff contact is only the actual callable event contact, never owner or assignment', () => {
  assert.equal(typeof detail.getContactNumber, 'function')
  assert.equal(detail.getContactNumber(event({ meta: { contact: ' +86 138-0000-0000 ' } })), '+8613800000000')
  for (const contact of [undefined, null, '', '待补充', '138****0000', 'tel:13800000000', '姓名']) {
    assert.equal(detail.getContactNumber(event({ owner: '13800000000', meta: { contact } })), '')
  }
})

test('site parser reads actual configured points without interpreting static danger tones', () => {
  assert.equal(typeof detail.parseNightMarketSites, 'function')
  const sites = detail.parseNightMarketSites({
    items: [
      { id: 'market-1', name: '东街夜市', latitude: 28.66, longitude: 115.89, address: '东街', district: '一区', tone: 'danger', source: '后端管理台' },
      { id: 'market-2', name: '西街夜市', latitude: null, longitude: null },
      null,
      { id: 'invalid' },
    ],
  })
  assert.equal(sites.length, 2)
  assert.equal(sites[0].name, '东街夜市')
  assert.equal(sites[0].tone, undefined)
  assert.ok(detail.getNavigablePoint(sites[0].point))
  assert.equal(detail.getNavigablePoint(sites[1].point), undefined)
  assert.deepEqual(detail.parseNightMarketSites({ items: [] }), [])
  assert.throws(() => detail.parseNightMarketSites({ message: 'invalid response' }))
})
