import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('identity search does not render a duplicate gait analysis panel in the workspace', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.equal(page.includes('GaitAnalysisPanel'), false, 'The workspace must not import or render the gait panel');
});

test('shared record details retain analysis and route actions without a recognition summary', () => {
  const modal = read('../components/ContactRecordModal.tsx');

  for (const removed of ['步态识别结果', '匹配置信度', 'cr-gait-result', 'cr-gait-feature-list', 'getContactGaitRecognition']) {
    assert.equal(modal.includes(removed), false, `Record details still include ${removed}`);
  }
  assert.match(modal, /<button\b[^>]*onClick=\{\(\) => setView\('gait'\)\}[^>]*>[\s\S]*?打开步态分析<\/button>/);
  assert.match(modal, /<button\b[^>]*onClick=\{\(\) => setView\('route'\)\}[^>]*>[\s\S]*?查看关联点位<\/button>/);
});

test('record gait analysis retains next-step navigation and closes the modal', () => {
  const page = read('../pages/ContactReviewPage.tsx');
  const app = read('../pages/DashboardApp.tsx');
  const modal = read('../components/ContactRecordModal.tsx');
  const gait = read('../components/GaitAnalysisPanel.tsx');

  assert.match(page, /function handleNext\(\) \{[\s\S]*setExpanded\(false\);[\s\S]*onNext\?\.\(\);[\s\S]*\}/);
  assert.match(app, /<ContactReviewPage onBack=\{\(\) => navigate\('platform'\)\} onNext=\{\(\) => navigate\('identity-search'\)\} \/>/);
  assert.match(app, /<ContactReviewPage onBack=\{\(\) => navigate\('platform'\)\} onNext=\{\(\) => navigate\('identity-search'\)\} showGait \/>/);
  assert.match(gait, /onNext\?: \(\) => void/);
  assert.match(gait, /下一步/);
  assert.match(modal, /<GaitAnalysisPanel recordId=\{CONTACT_REDACTED_VALUE\} onNext=\{onIdentityNext\} \/>/);
  assert.match(page, /<ContactRecordModal[\s\S]*onIdentityNext=\{handleNext\}/);
});

test('身份检索使用 CAM-11 结果集进行扫描和展示', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.ok(page.includes('selectIdentitySearchRecords'));
  assert.match(page, /const filtered = useMemo\(\(\) => selectResults/);
  assert.match(page, /selectIdentitySearchRecords\(source/);
  assert.match(page, /const nextFiltered = selectResults/);
});

test('身份检索隐藏视频筛查专用控件', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.ok(page.includes('{!showGait && <button className="ui-button"'));
  assert.ok(page.includes('{!showGait && <div className="cr-source-caption"'));
  assert.ok(page.includes('{!showGait && <div className="cr-field cr-behavior-field"'));
  assert.ok(page.includes('{!showGait && <button type="button" role="tab" id="cr-map-tab"'));
  assert.ok(page.includes('{!showGait && <div className="cr-status-tabs"'));
});
