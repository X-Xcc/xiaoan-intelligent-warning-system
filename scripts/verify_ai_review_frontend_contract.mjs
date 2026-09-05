import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('apps/dashboard/src/pages/PoliceDomainPages.tsx', 'utf8');

test('AI 审核请求使用当前登录令牌且不发送 operatorId', () => {
  assert.match(source, /const authToken = window\.localStorage\.getItem\('public-security-ai-auth-token'\)\?\.trim\(\);/);
  assert.match(source, /Authorization: `Bearer \$\{authToken\}`/);
  assert.doesNotMatch(source, /operatorId\s*:/);
});
