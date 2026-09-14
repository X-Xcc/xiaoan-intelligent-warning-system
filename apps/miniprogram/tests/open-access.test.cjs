const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const read = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')

test('entry and citizen UI contain no project login flow', () => {
  const entry = read('pages/index/index.tsx')
  assert.doesNotMatch(entry, /loginWithWechat|Taro\.login|工作人员登录|用户登录|暂不登录/)
  assert.match(entry, /mode=visitor/)
  assert.match(entry, /mode=staff/)
  assert.doesNotMatch(read('features/citizen/CitizenWorkspace.tsx'), /返回登录页|已登录用户/)
})

test('staff drafts persist without credentials and remain worker-specific', () => {
  const staff = read('features/staff/StaffWorkspace.tsx')
  assert.doesNotMatch(staff, /getAuthToken|重新登录|开发账号/)
  assert.match(staff, /command-staff-drafts:staff:\$\{encodeURIComponent\(staffName\)\}/)
  assert.match(staff, /useEffect\(\(\) => \{ Taro\.setStorageSync\(draftKey, drafts\)/)
})
