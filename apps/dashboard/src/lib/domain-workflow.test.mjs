import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../pages/PoliceDomainPages.tsx', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), end ? source.indexOf(end, source.indexOf(start)) : undefined);
const casePage = section('export function CaseHandlingPage', 'export function CommunityPolicingPage');
const communityPage = section('export function CommunityPolicingPage', 'function LegacyTrainingOperationsPage');
const chain = section('function DomainEventChain', 'function ObjectWorkbench');
const aiPage = section('export function AICenterPage');
const commandPage = section('export function CommandOperationsPage', 'export function CaseHandlingPage');

test('intake keeps its current view and exposes the separate business workbench', () => {
  assert.match(commandPage, /业务办理/);
  assert.match(commandPage, /navigate\('command-workbench'\)/);
  assert.match(commandPage, /<CommandIntakeSheet events=\{events\}/);
});

// Exercise the actual pre-JSX handlers with stateful hooks, using only Node.
async function handlers(page, marker, exports, globals = {}) {
  let cursor = 0;
  const state = [];
  const pendingEffects = [];
  const context = vm.createContext({
    caseModules: ['legal', 'evidence', 'rule-check', 'similar', 'document', 'linkage', 'transfer'].map((id) => ({ id })),
    communityModules: ['profile', 'visit', 'closure', 'analysis'].map((id) => ({ id })),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef: (initial) => {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useCallback: (callback, deps) => {
      const index = cursor++;
      if (!state[index] || deps.some((dep, i) => dep !== state[index].deps[i])) state[index] = { callback, deps };
      return state[index].callback;
    },
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (!state[index] || deps.some((dep, i) => dep !== state[index].deps[i])) {
        state[index]?.cleanup?.();
        state[index] = { deps };
        pendingEffects.push(() => { state[index].cleanup = effect(); });
      }
    },
    AbortController,
    AiCenterApiError: class extends Error {},
    ...globals,
  });
  const prefix = page.slice(0, page.indexOf(marker)).replace(/^function /, 'export function ');
  const name = prefix.match(/export function (\w+)/)[1];
  const module = new vm.SourceTextModule(stripTypeScriptTypes(`${prefix}return { ${exports.join(', ')} }; }`), { context });
  await module.link(() => { throw new Error('No imports in handler slice'); });
  await module.evaluate();
  const render = (props = { overview: {}, apiOnline: false, navigate: () => {} }) => {
    cursor = 0;
    return module.namespace[name](props);
  };
  render.effects = () => { while (pendingEffects.length) pendingEffects.shift()(); };
  render.cleanup = () => { state.forEach((value) => value?.cleanup?.()); };
  return render;
}

test('local event-chain decisions never claim persisted audit or real queue operations', async () => {
  assert.doesNotMatch(chain, /已记录到审计链|已进入人工确认队列/);
  assert.match(chain, /本页演示/);
  assert.match(chain, /未写入审计/);
  const render = await handlers(chain, '  return (', ['review', 'feedback', 'reviewStatus']);
  render().review('confirmed');
  assert.equal(render().reviewStatus, 'confirmed');
  assert.match(render().feedback, /本页/);
  assert.match(render().feedback, /未写入/);
});

test('community assistant selection and risk entry keep process and tool aligned', async () => {
  assert.match(communityPage, /onSelect=\{selectTool\}/);
  assert.doesNotMatch(communityPage, /setSelectedRisk\(index\); setActiveProcess\(1\)/);
  const render = await handlers(communityPage, '  const renderCommunityProcess', ['selectTool', 'selectProcess', 'activeTool', 'activeProcess']);
  for (const [tool, index] of [['visit', 2], ['closure', 3], ['analysis', 1], ['profile', 0]]) {
    render().selectTool(tool);
    assert.equal(render().activeTool, tool);
    assert.equal(render().activeProcess, index);
    render().selectProcess(index);
    assert.equal(render().activeTool, tool);
  }
});

test('community plan and report are local, validated, repeat-safe and editable', async () => {
  assert.doesNotMatch(communityPage, /已派发|任务已创建|审计编号|完整留痕/);
  assert.match(communityPage, /本页演示/);
  const render = await handlers(communityPage, '  const renderCommunityProcess', ['createPlan', 'saveVisit', 'setVisitNote', 'updateVisitNote', 'planCreated', 'visitNote', 'visitReturned']);
  render().saveVisit();
  assert.equal(render().visitReturned, false);
  render().setVisitNote('Sample visit');
  render().saveVisit();
  assert.equal(render().visitReturned, false, 'a report requires a local plan');
  render().createPlan();
  render().saveVisit();
  assert.equal(render().visitReturned, true);
  render().createPlan();
  assert.equal(render().visitNote, 'Sample visit');
  render().updateVisitNote('Revised');
  assert.equal(render().visitReturned, false);
  assert.equal(render().visitNote, 'Revised');
});

test('case action buttons have handlers and never imply unperformed filing or verified citations', () => {
  for (const button of casePage.matchAll(/<button\b([^>]*)>/g)) assert.match(button[1], /onClick=|type="submit"/);
  assert.doesNotMatch(casePage, /已入卷|已关联到当前案件卷宗|最高人民法院相关指导案例|审批与签发留痕/);
  assert.match(casePage, /本页演示/);
  assert.match(casePage, /onSelect=\{selectTool\}/);
});

test('case search is explicit and local, and checklist changes invalidate its local confirmation', async () => {
  const render = await handlers(casePage, '  const renderCaseTool', ['setQuery', 'searchCase', 'searchedQuery', 'confirmEvidence', 'toggleCheck', 'checksConfirmed', 'checks', 'selectTool', 'activeProcess', 'activeTool']);
  render().setQuery('New sample');
  assert.notEqual(render().searchedQuery, 'New sample');
  render().searchCase();
  assert.equal(render().searchedQuery, 'New sample');
  render().confirmEvidence();
  assert.equal(render().checksConfirmed, false);
  render().checks.forEach((checked, index) => { if (!checked) render().toggleCheck(index); });
  render().confirmEvidence();
  assert.equal(render().checksConfirmed, true);
  render().toggleCheck(0);
  assert.equal(render().checksConfirmed, false);
  for (const [tool, index] of [['transfer', 3], ['linkage', 2], ['rule-check', 1]]) {
    render().selectTool(tool);
    assert.equal(render().activeProcess, index);
    assert.equal(render().activeTool, tool);
  }
});

test('AI provides in-memory business-token login, logout and its own refresh without parent refresh', () => {
  assert.doesNotMatch(aiPage, /localStorage|sessionStorage/);
  assert.match(aiPage, /authenticateAiReviewer\(/);
  assert.match(aiPage, /type="password"/);
  assert.match(aiPage, /onSubmit=/);
  assert.match(aiPage, /onClick=\{logout\}/);
  assert.match(aiPage, /onClick=\{\(\) => void refreshRuntime\(\)\}/);
  assert.doesNotMatch(aiPage, /refresh\?\.\(/);
  assert.match(aiPage, /permissions\.includes\('review'\)/);
  assert.match(aiPage, /reviewPending/);
  assert.match(aiPage, /runtimeController\.current\?\.abort\(\)/);
  assert.match(aiPage, /loginController\.current\?\.abort\(\)/);
  assert.match(aiPage, /reviewController\.current\?\.abort\(\)/);
});

const aiExports = ['refreshRuntime', 'runtime', 'runtimeError', 'runtimeLoading', 'login', 'logout', 'tokenInput', 'setTokenInput', 'reviewer', 'canReview', 'submitReview', 'reviewPending', 'reviewState', 'reviewReason', 'setReviewReason', 'updateReviewReason', 'tokenRef'];
const sample = { model: { name: 'Sample' }, sampleResult: { auditId: 'sample-1', reviewStatus: 'pending' } };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
};

test('AI refresh cancels stale responses, retains the last snapshot and preserves review drafts on error/retry', async () => {
  assert.match(aiPage, /const refreshRuntime/);
  const requests = [];
  const render = await handlers(aiPage, '  const fallbackAgents', aiExports, {
    getAiRuntime: (signal) => { const request = { ...deferred(), signal }; requests.push(request); return request.promise; },
  });
  render().setReviewReason('Draft review');
  const first = render().refreshRuntime();
  const second = render().refreshRuntime();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(sample);
  await second;
  requests[0].resolve({ ...sample, sampleResult: { auditId: 'stale' } });
  await first;
  assert.equal(render().runtime.sampleResult.auditId, 'sample-1');
  const failed = render().refreshRuntime();
  requests[2].reject(new Error('offline'));
  await failed;
  assert.equal(render().runtime.sampleResult.auditId, 'sample-1');
  assert.ok(render().runtimeError);
  assert.equal(render().runtimeLoading, false);
  assert.equal(render().reviewReason, 'Draft review');
  const retry = render().refreshRuntime();
  requests[3].resolve(sample);
  await retry;
  assert.equal(render().runtimeError, null);
  assert.equal(render().reviewReason, 'Draft review');
});

test('AI login validates server permissions; logout prevents late credentials or reviews from restoring state', async () => {
  assert.match(aiPage, /const login/);
  const authentication = deferred();
  let signal;
  const render = await handlers(aiPage, '  const fallbackAgents', aiExports, {
    authenticateAiReviewer: (_token, nextSignal) => { signal = nextSignal; return authentication.promise; },
  });
  render().setTokenInput('secret');
  const login = render().login();
  assert.equal(render().tokenInput, '');
  assert.equal(render().tokenRef.current, '');
  render().logout();
  assert.equal(signal.aborted, true);
  authentication.resolve({ openid: 'late-user', permissions: ['review'] });
  await login;
  assert.equal(render().reviewer, null);
  assert.equal(render().tokenRef.current, '');
});

test('AI review is permission-gated, repeat-safe and keeps the reason after server acknowledgment', async () => {
  assert.match(aiPage, /const login/);
  let permissions = [];
  const review = deferred();
  const calls = [];
  const render = await handlers(aiPage, '  const fallbackAgents', aiExports, {
    getAiRuntime: async () => sample,
    authenticateAiReviewer: async () => ({ openid: 'user', permissions }),
    submitAiReview: (...args) => { calls.push(args); return review.promise; },
  });
  await render().refreshRuntime();
  render().setTokenInput('token');
  await render().login();
  render().updateReviewReason('Checked manually');
  await render().submitReview('confirmed');
  assert.equal(calls.length, 0);
  assert.equal(render().canReview, false);
  permissions = ['review'];
  render().setTokenInput('token');
  await render().login();
  assert.equal(render().canReview, true);
  const first = render().submitReview('confirmed');
  await render().submitReview('rejected');
  assert.equal(calls.length, 1);
  assert.equal(render().reviewPending, true);
  assert.deepEqual(calls[0].slice(0, 4), ['token', 'sample-1', 'confirmed', 'Checked manually']);
  review.resolve({ ...sample.sampleResult, reviewStatus: 'confirmed' });
  await first;
  assert.equal(render().runtime.sampleResult.reviewStatus, 'confirmed');
  assert.equal(render().reviewPending, false);
  assert.equal(render().reviewReason, 'Checked manually');
});

test('demo process navigation does not mark skipped work as completed', () => {
  assert.match(casePage, /<ProcessSteps\b[^>]*navigationOnly/);
  assert.match(communityPage, /<ProcessSteps\b[^>]*navigationOnly/);
  const steps = section('function ProcessSteps', 'function AiAssistMenu');
  assert.match(steps, /!navigationOnly/);
});

test('a refreshed result cannot silently inherit a review draft for a different audit ID', async () => {
  assert.match(aiPage, /const updateReviewReason/);
  let current = sample;
  const calls = [];
  const render = await handlers(aiPage, '  const fallbackAgents', [...aiExports, 'updateReviewReason', 'reviewDraftAuditId'], {
    getAiRuntime: async () => current,
    authenticateAiReviewer: async () => ({ openid: 'user', permissions: ['review'] }),
    submitAiReview: async (...args) => { calls.push(args); return { ...current.sampleResult, reviewStatus: 'confirmed' }; },
  });
  await render().refreshRuntime();
  render().setTokenInput('token');
  await render().login();
  render().updateReviewReason('Reason for sample-1');
  current = { ...sample, sampleResult: { auditId: 'sample-2', reviewStatus: 'pending' } };
  await render().refreshRuntime();
  await render().submitReview('confirmed');
  assert.equal(calls.length, 0);
  assert.equal(render().reviewReason, 'Reason for sample-1');
  assert.equal(render().reviewDraftAuditId, 'sample-1');
  render().updateReviewReason('Reviewed sample-2');
  await render().submitReview('confirmed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'sample-2');
});

test('expired and denied reviews clear authorization and preserve uncertain-result drafts until refresh', async () => {
  class ApiFailure extends Error {
    constructor(status) { super(`Failure ${status}`); this.status = status; }
  }
  for (const status of [401, 403, 408, 503]) {
    let count = 0;
    const render = await handlers(aiPage, '  const fallbackAgents', aiExports, {
      AiCenterApiError: ApiFailure,
      getAiRuntime: async () => sample,
      authenticateAiReviewer: async () => ({ openid: 'user', permissions: ['review'] }),
      submitAiReview: async () => { count += 1; throw new ApiFailure(status); },
    });
    await render().refreshRuntime();
    render().setTokenInput('token');
    await render().login();
    render().updateReviewReason('Keep this reason');
    await render().submitReview('confirmed');
    assert.equal(count, 1);
    assert.equal(render().reviewReason, 'Keep this reason');
    assert.equal(render().reviewPending, false);
    assert.ok(render().runtimeError);
    assert.match(render().reviewState, /未收到审核成功回执/);
    assert.doesNotMatch(render().reviewState, /未写入/);
    if (status === 401) {
      assert.equal(render().tokenRef.current, '');
      assert.equal(render().reviewer, null);
    }
    if (status === 403) assert.equal(render().canReview, false);
    await render().submitReview('confirmed');
    assert.equal(count, 1, 'uncertain acknowledgment requires refresh before another submission');
  }
});

test('unmount cancels runtime and login requests and ignores their late responses', async () => {
  const runtime = deferred();
  const auth = deferred();
  const signals = [];
  const render = await handlers(aiPage, '  const fallbackAgents', aiExports, {
    getAiRuntime: (signal) => { signals.push(signal); return runtime.promise; },
    authenticateAiReviewer: (_token, signal) => { signals.push(signal); return auth.promise; },
  });
  render();
  render.effects();
  render().setTokenInput('token');
  const login = render().login();
  render.cleanup();
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
  runtime.resolve(sample);
  auth.resolve({ openid: 'late', permissions: ['review'] });
  await login;
  await new Promise(setImmediate);
  assert.equal(render().runtime, null);
  assert.equal(render().reviewer, null);
  assert.equal(render().tokenRef.current, '');
});
