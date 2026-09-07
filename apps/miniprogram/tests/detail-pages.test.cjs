const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pageDirectory = path.resolve(__dirname, '../src/pages/detail')
const pageSource = () => fs.readdirSync(pageDirectory)
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => fs.readFileSync(path.join(pageDirectory, file), 'utf8'))
  .join('\n')

test('detail actions do not claim phone connection, dispatch, or command delivery', () => {
  const source = pageSource()
  assert.doesNotMatch(source, /已联系报警人|已请求支援|已发给指挥端/)
  assert.match(source, /Taro\.makePhoneCall/)
  assert.match(source, /supplementSafetyEvent/)
  assert.match(source, /Taro\.showModal/)
})

test('detail has real loading, retry, evidence media and URL resolution', () => {
  const source = pageSource()
  assert.match(source, /fetchSafetyEvent/)
  assert.match(source, /onRetry=/)
  assert.match(source, /resolveEvidenceUrl/)
  assert.match(source, /<Image[\s>]/)
  assert.match(source, /<Video[\s>]/)
  assert.match(source, /Taro\.previewImage/)
  assert.match(source, /getNavigablePoint/)
  assert.doesNotMatch(source, /etaLabel|etaMinutes|预计.*分钟/)
})

test('lost and personal history use main flow without direct unindexed registration', () => {
  const source = pageSource()
  assert.match(source, /tab=home&panel=lost/)
  assert.match(source, /tab=progress/)
  assert.doesNotMatch(source, /createLostClaimEvent|fetchEvents\(/)
  assert.match(source, /requestApi/)
  assert.match(source, /\/events\/night-markets/)
})

test('detail uses shared UI, blue native navigation and compact scoped styling', () => {
  const source = pageSource()
  const style = fs.readFileSync(path.join(pageDirectory, 'detail.scss'), 'utf8')
  const config = fs.readFileSync(path.join(pageDirectory, 'detail.config.ts'), 'utf8')
  assert.match(source, /@\/components\/ui/)
  assert.match(source, /mini-app/)
  assert.match(config, /#cbe5ff/)
  assert.doesNotMatch(config, /navigationStyle:\s*['"]custom/)
  assert.doesNotMatch(source, /wechat-capsule|status-bar|detail-topbar/)
  assert.doesNotMatch(style, /#07c160|#087c59|#07a85a|linear-gradient|font-size:\s*(?:[5-9]\d|\d{3,})px/i)
  assert.doesNotMatch(style, /(?:^|\n)page\s*\{/)
})

test('detail omits false disabled attributes for Taro H5 controls', () => {
  const attributes = [...pageSource().matchAll(/disabled=\{([^}]+)\}/g)]
  assert.ok(attributes.length > 0)
  for (const [, expression] of attributes) {
    assert.match(expression.trim(), /\|\|\s*undefined$/, `Disabled must evaluate to true or undefined: ${expression}`)
  }
})
