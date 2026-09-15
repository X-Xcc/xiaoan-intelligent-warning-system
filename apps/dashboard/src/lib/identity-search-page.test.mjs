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

test('record gait analysis labels navigation as search and closes the modal', () => {
  const page = read('../pages/ContactReviewPage.tsx');
  const app = read('../pages/DashboardApp.tsx');
  const modal = read('../components/ContactRecordModal.tsx');
  const gait = read('../components/GaitAnalysisPanel.tsx');

  assert.match(page, /function handleNext\(\) \{[\s\S]*setExpanded\(false\);[\s\S]*onNext\?\.\(\);[\s\S]*\}/);
  assert.match(app, /<ContactReviewPage\b[^\n]*onBack=\{\(\) => navigate\('platform'\)\} onNext=\{\(\) => navigate\('identity-search'\)\} \/>/);
  assert.match(app, /<ContactReviewPage\b[^\n]*onBack=\{\(\) => navigate\('platform'\)\} onNext=\{\(\) => navigate\('identity-search'\)\} showGait \/>/);
  assert.match(gait, /onNext\?: \(\) => void/);
  assert.match(gait, /onClick=\{onNext\}><span>检索<\/span>/);
  assert.equal(gait.includes('下一步'), false);
  assert.match(modal, /<GaitAnalysisPanel recordId=\{CONTACT_REDACTED_VALUE\} onNext=\{onIdentityNext\} \/>/);
  assert.match(page, /<ContactRecordModal[\s\S]*onIdentityNext=\{handleNext\}/);
});

test('identity search opens its own gallery without inheriting video screening state', () => {
  const app = read('../pages/DashboardApp.tsx');
  const page = read('../pages/ContactReviewPage.tsx');

  assert.match(app, /<ContactReviewPage key="contact-review"/);
  assert.match(app, /<ContactReviewPage key="identity-search"/);
  assert.match(page, /const \[searchPhase, setSearchPhase\] = useState<[^>]+>\(showGait \? 'complete' : 'idle'\)/);
  assert.match(page, /searchPhase === 'complete' && workspace === 'records' \? <div/);
});

test('identity search uses the visible gallery total', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.match(page, /共 \{showGait \? visibleResultCount : filtered\.length\} 条/);
});

test('identity screening completes the existing scan in the current gallery without a popup', () => {
  const page = read('../pages/ContactReviewPage.tsx');
  const submitHandler = page.match(/<form\b[\s\S]*?onSubmit=\{\(event\) => \{([\s\S]*?)\}\}/)?.[1] ?? '';

  assert.ok(submitHandler.includes('applyFilters()'), 'Screening must run the search flow');
  assert.ok(!page.includes('setScreeningDemoOpen'), 'Screening must not open a popup at any stage');
  assert.ok(!page.includes('<Modal title="筛查演示"'));
  assert.match(page, /if \(stage\.phase === 'complete'\) \{?\s*setSearchPhase\('complete'\)/);
  assert.match(page, /const stageDelay = showGait \? 360 : 90/);
  assert.match(page, /stageDelay \* \(index \+ 1\)/);
  assert.match(page, /disabled=\{searchPhase === 'scanning'\}/);
});

test('completed identity screening shows only the supplied image and counts one result', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.match(page, /const showSingleResult = showGait && hasScreened && searchPhase === 'complete'/);
  assert.match(page, /createContactSearchStages\(showGait \? 1 : nextFiltered\.length,/);
  assert.match(page, /const visibleResultCount = showSingleResult \? 1/);
  assert.match(page, /const visiblePlaceCount = showSingleResult \? 1/);
  assert.match(page, /showSingleResult \? <article role="listitem" className="cr-record-card cr-screening-result">[\s\S]*?path="\/contact-review-assets\/identity-screening-demo\.jpg"[\s\S]*?<\/article> : filtered\.map/);
  assert.match(page, /!showSingleResult && !filtered\.length/);
  assert.match(page, /!showSingleResult && selected && <ContactRecordModal/);
  assert.match(page, /function reset\(\)[\s\S]*?setHasScreened\(false\)/);
});

test('reset and unmount invalidate pending screening results', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.match(page, /if \(searchRun\.current !== run\) return;/);
  assert.match(page, /function reset\(\) \{\s*\+\+searchRun\.current;/);
  assert.match(page, /useEffect\(\(\) => \(\) => \{ searchRun\.current \+= 1; \}, \[\]\)/);
});

test('reset restores the identity gallery while leaving video screening idle', () => {
  const page = read('../pages/ContactReviewPage.tsx');
  assert.match(page, /function reset\(\)[\s\S]*?setSearchPhase\(showGait \? 'complete' : 'idle'\)/);
});

test('身份检索使用完整 AI 人物素材集进行扫描和展示', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.ok(page.includes('selectIdentitySearchRecords'));
  assert.match(page, /const filtered = useMemo\(\(\) => selectResults/);
  assert.match(page, /selectIdentitySearchRecords\(source/);
  assert.match(page, /const nextFiltered = selectResults/);
  assert.match(page, /showGait \? identitySearchRecords : contactReviewRecords/);
  assert.match(page, /thumbnailPath=\{record\.thumbnailPath\}/);
  assert.match(page, /thumbnailPath \?\? path\.replace/);
});

test('身份检索隐藏视频筛查专用控件', () => {
  const page = read('../pages/ContactReviewPage.tsx');

  assert.ok(page.includes('{!showGait && <button className="ui-button"'));
  assert.ok(page.includes('{!showGait && <div className="cr-source-caption"'));
  assert.ok(page.includes('{!showGait && <div className="cr-field cr-behavior-field"'));
  assert.ok(page.includes('{!showGait && <button type="button" role="tab" id="cr-map-tab"'));
  assert.ok(page.includes('{!showGait && <div className="cr-status-tabs"'));
});
