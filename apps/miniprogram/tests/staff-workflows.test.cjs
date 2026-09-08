const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const incident = (status = '已派单') => ({
  id: 'EVENT-1', kind: 'help', title: '现场任务', bay: '北入口', level: '高风险',
  owner: '李警官', status, source: '群众求助', description: '现场描述', time: '10:00', updatedAt: '10:00',
});
const trainingTask = (status = '训练中') => ({
  taskId: 'TRAIN-1', traineeId: '李警官', status, subject: '现场训练', teamName: '巡防组',
  equipment: ['防护装备'], standard: { label: '现场标准', thresholdSeconds: 30 }, basis: ['真实训练依据'],
  startedAt: new Date(Date.now() - 12000).toISOString(),
});
const score = {
  assessmentId: 'SCORE-1', taskId: 'TRAIN-1', inputMode: 'pre_recorded_desensitized_sample',
  score: { total: 90, standardization: 90, completionTime: 90, coordination: 90 },
  confidence: 0.86, evidence: [], evidenceTime: '2026-09-06T10:00:00Z', ruleVersion: 'v1',
  humanReviewRequired: true, reviewStatus: 'pending', auditId: 'AUDIT-1',
};

// A small hook host exercises asynchronous component handlers without native Taro or a browser.
function mount(entry, exportName, props, api = {}, environment = 'production') {
  const instances = new Map();
  let current, cursor, dirty = true, tree, effects = [];
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const slot = (make) => {
    const index = cursor++;
    if (!current[index]) current[index] = make();
    return current[index];
  };
  const react = {
    useState(initial) {
      const state = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
      return [state.value, (value) => {
        const next = typeof value === 'function' ? value(state.value) : value;
        if (!Object.is(next, state.value)) { state.value = next; dirty = true; }
      }];
    },
    useRef: (initial) => slot(() => ({ current: initial })),
    useCallback(callback, deps) {
      const state = slot(() => ({}));
      if (!equalDeps(state.deps, deps)) { state.deps = deps; state.callback = callback; }
      return state.callback;
    },
    useEffect(effect, deps) {
      const state = slot(() => ({}));
      if (!equalDeps(state.deps, deps)) {
        state.deps = deps;
        effects.push(() => { state.cleanup?.(); state.cleanup = effect(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const components = new Proxy({}, { get: (_, key) => key });
  const taro = { useDidShow() {}, useDidHide() {}, openLocation: async () => {}, ...api.taro };
  const { outputFiles } = buildSync({
    entryPoints: [path.resolve(__dirname, `../src/features/staff/${entry}.tsx`)],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    external: ['@/components/ui', '@/utils/api'], loader: { '.scss': 'empty' },
    define: { 'process.env.NODE_ENV': JSON.stringify(environment), 'process.env.TARO_APP_ENABLE_DEV_LOGIN': '"true"' },
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', 'setInterval', 'clearInterval', outputFiles[0].text)(
    module, module.exports, (id) => {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === '@tarojs/components' || id === '@/components/ui') return components;
      if (id === '@tarojs/taro') return taro;
      if (id === '@/utils/api') return {
        fetchStaffTasks: async () => [], connectRealtimeEvents: () => () => {},
        fetchSecurityOpsOverview: async () => ({}), ...api,
      };
      throw new Error(`Unexpected import: ${id}`);
    }, () => 1, () => {},
  );
  function expand(node, location = 'root') {
    if (node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item, index) => expand(item, `${location}/${index}`));
    if (typeof node.type === 'function') {
      const id = `${location}/${node.type.name}/${node.key || ''}`;
      if (!instances.has(id)) instances.set(id, []);
      current = instances.get(id); cursor = 0;
      return expand(node.type(node.props), id);
    }
    return { ...node, props: { ...node.props, children: expand(node.props.children, `${location}/${node.type}`) } };
  }
  function render() {
    dirty = false;
    tree = expand(jsx(module.exports[exportName], props));
    const pending = effects; effects = [];
    pending.forEach((effect) => effect());
  }
  function all(node, includeHidden = false) {
    if (node == null || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap((item) => all(item, includeHidden));
    if (!includeHidden && (node.props.hidden || node.props.style?.display === 'none')) return [];
    return [node, ...all(node.props.children, includeHidden)];
  }
  const text = (node) => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(text).join('');
    if (node.props.hidden || node.props.style?.display === 'none') return '';
    return text(node.props.children);
  };
  return {
    async settle() {
      for (let i = 0; i < 15; i++) { if (dirty) render(); await new Promise(setImmediate); }
    },
    nodes: (type, includeHidden = false) => all(tree, includeHidden).filter((node) => node.type === type),
    button(label) {
      const node = all(tree).find((item) => item.type === 'Button' && text(item) === label);
      assert.ok(node, `Button exists: ${label}`);
      return node;
    },
    text: () => text(tree),
    unmount() { for (const slots of instances.values()) slots.forEach((state) => state.cleanup?.()); },
  };
}

test('an unregistered development account explains missing staff binding without inventing tasks', async () => {
  const app = mount('StaffWorkspace', 'StaffWorkspace', { staffName: 'xx', onExit() {} }, {
    fetchStaffTasks: async (name) => { assert.equal(name, 'xx'); throw new Error('Unsupported staff: xx'); },
  }, 'development');
  await app.settle();
  const empty = app.nodes('EmptyState')[0];
  assert.match(empty.props.description, /账号尚未登记.*工作人员目录/);
  assert.match(empty.props.description, /xx/);
  assert.deepEqual(app.nodes('EventCard'), []);
  assert.equal(app.text().includes('--'), true);
  app.unmount();
});

test('task mutation locks double taps and displays success only after the server receipt', async () => {
  const pending = deferred();
  let task = incident(), mutations = 0, disconnects = 0, locationCalls = 0;
  const app = mount('StaffWorkspace', 'StaffWorkspace', { staffName: '李警官', onExit() {} }, {
    fetchStaffTasks: async () => [task],
    updateSafetyEventStatus: () => { mutations++; return pending.promise; },
    connectRealtimeEvents: () => () => { disconnects++; },
    taro: { getLocation: () => { locationCalls++; }, openLocation: () => { locationCalls++; } },
  });
  await app.settle();
  const action = app.button('接收任务');
  action.props.onClick(); action.props.onClick();
  await app.settle();
  assert.equal(mutations, 1);
  assert.doesNotMatch(app.text(), /平台已确认/);
  task = incident('已接收');
  pending.resolve(task);
  await app.settle();
  assert.match(app.text(), /平台已确认：已接收/);
  assert.equal(app.button('确认到场').props.disabled, undefined);
  assert.equal(locationCalls, 0);
  app.unmount();
  assert.equal(disconnects, 1);
});

test('failed completion retains the user result and error when reopening the sheet', async () => {
  const app = mount('StaffWorkspace', 'StaffWorkspace', { staffName: '李警官', onExit() {} }, {
    fetchStaffTasks: async () => [incident('处理中')],
    updateSafetyEventStatus: async () => { throw new Error('提交失败'); },
  });
  await app.settle();
  app.button('回传处置结果').props.onClick();
  await app.settle();
  assert.equal(app.button('提交并完成任务').props.disabled, true);
  app.nodes('Textarea')[0].props.onInput({ detail: { value: '现场已清理，人员已疏散' } });
  await app.settle();
  app.button('提交并完成任务').props.onClick();
  await app.settle();
  assert.match(app.text(), /提交失败/);
  assert.doesNotMatch(app.text(), /平台已确认：已完成/);
  app.nodes('BottomSheet')[0].props.onClose();
  await app.settle();
  app.button('回传处置结果').props.onClick();
  await app.settle();
  assert.equal(app.nodes('Textarea')[0].props.value, '现场已清理，人员已疏散');
  assert.match(app.text(), /提交失败/);
  app.unmount();
});

test('production exposes no foreign training selector or task actions', async () => {
  const app = mount('StaffTraining', 'StaffTraining', { staffName: '李警官', active: true, onBusyChange() {} }, {
    requestApi: async (url) => url.endsWith('readiness')
      ? { dataMode: 'desensitized_sample', notice: '真实服务声明', ruleVersion: 'v1', updatedAt: 'now' }
      : { dataMode: 'desensitized_sample', items: url.endsWith('tasks') ? [{ ...trainingTask(), traineeId: 'OFFICER-017' }] : [] },
  });
  await app.settle();
  assert.equal(app.nodes('Picker').length, 0);
  assert.equal(app.nodes('EmptyState').some((node) => node.props.title.includes('尚未绑定')), true);
  assert.match(app.text(), /真实服务声明/);
  assert.doesNotMatch(app.text(), /开始训练|创建复训任务|结束并提交考核/);
  app.unmount();
});

test('assessment failure retains confirmed completion and retries only the assessment request', async () => {
  let task = trainingTask(), assessment, completions = 0, assessments = 0;
  const busyStates = [];
  const app = mount('StaffTraining', 'StaffTraining', { staffName: '李警官', active: true, onBusyChange: (busy) => busyStates.push(busy) }, {
    requestApi: async (url, options) => {
      if (url.endsWith('/complete')) { completions++; task = { ...task, status: '待复核', elapsedSeconds: options.data.elapsedSeconds }; return { task }; }
      if (url.endsWith('/assessment')) {
        assessments++;
        if (assessments === 1) throw new Error('评分服务离线');
        assessment = score; return { assessment };
      }
      if (url.endsWith('/readiness')) return { dataMode: 'desensitized_sample', notice: '脱敏样例声明', ruleVersion: 'v1', updatedAt: 'now' };
      return { dataMode: 'desensitized_sample', items: url.endsWith('/tasks') ? [task] : url.endsWith('/assessments') && assessment ? [assessment] : [] };
    },
  });
  await app.settle();
  const finish = app.button('结束并提交考核');
  assert.equal(finish.props.disabled, undefined);
  finish.props.onClick(); finish.props.onClick();
  await app.settle();
  assert.equal(completions, 1);
  assert.match(app.text(), /平台已确认训练记录提交/);
  assert.match(app.text(), /评分服务离线/);
  app.button('请求考核结果').props.onClick();
  await app.settle();
  assert.equal(completions, 1);
  assert.equal(assessments, 2);
  assert.match(app.text(), /90/);
  assert.deepEqual(busyStates, [true, false, true, false]);
  app.unmount();
});

test('leaving the workspace stops the next assessment mutation after completion returns', async () => {
  const pending = deferred();
  let assessments = 0;
  const task = trainingTask();
  const app = mount('StaffTraining', 'StaffTraining', { staffName: '李警官', active: true, onBusyChange() {} }, {
    requestApi: async (url) => {
      if (url.endsWith('/complete')) return pending.promise;
      if (url.endsWith('/assessment')) { assessments++; return { assessment: score }; }
      if (url.endsWith('/readiness')) return { dataMode: 'sample', notice: '服务声明', ruleVersion: 'v1', updatedAt: 'now' };
      return { dataMode: 'sample', items: url.endsWith('/tasks') ? [task] : [] };
    },
  });
  await app.settle();
  app.button('结束并提交考核').props.onClick();
  app.unmount();
  pending.resolve({ task: { ...task, status: '待复核', elapsedSeconds: 12 } });
  await app.settle();
  assert.equal(assessments, 0);
});

test('development training selection is explicit and start requires all safety checks', async () => {
  let task = { ...trainingTask('待训练'), traineeId: 'OFFICER-017' }, starts = 0;
  const app = mount('StaffTraining', 'StaffTraining', { staffName: '李警官', active: true, onBusyChange() {} }, {
    requestApi: async (url) => {
      if (url.endsWith('/start')) { starts++; task = { ...task, status: '训练中' }; return { task }; }
      if (url.endsWith('/readiness')) return { dataMode: 'sample', notice: '服务声明', ruleVersion: 'v1', updatedAt: 'now' };
      return { dataMode: 'sample', items: url.endsWith('/tasks') ? [task] : [] };
    },
  }, 'development');
  await app.settle();
  assert.equal(app.nodes('CheckboxGroup').length, 0);
  const picker = app.nodes('Picker')[0];
  assert.deepEqual(picker.props.range, ['请选择训练对象', 'OFFICER-017']);
  assert.equal(picker.props.value, 0);
  picker.props.onChange({ detail: { value: '1' } });
  await app.settle();
  assert.equal(app.button('开始训练').props.disabled, true);
  app.nodes('CheckboxGroup')[0].props.onChange({ detail: { value: ['防护装备', '训练场地与个人防护已确认'] } });
  await app.settle();
  const start = app.button('开始训练');
  assert.equal(start.props.disabled, undefined);
  start.props.onClick(); start.props.onClick();
  await app.settle();
  assert.equal(starts, 1);
  assert.match(app.text(), /平台已确认训练开始/);
  app.unmount();
});

test('duty is loaded only on request and a failure never fabricates a schedule', async () => {
  let calls = 0, offline = true;
  const app = mount('StaffWorkspace', 'StaffWorkspace', { staffName: '李警官', onExit() {} }, {
    fetchSecurityOpsOverview: async () => {
      calls++;
      if (offline) throw new Error('值班服务离线');
      return { duty: { items: [{ planKey: 'real-plan', planDate: '2026-09-06', timeSlot: '18:00', area: '北区', summary: '真实安排', staff: ['李警官'] }] } };
    },
  });
  await app.settle();
  assert.equal(calls, 0);
  app.button('值班安排').props.onClick();
  await app.settle();
  assert.equal(app.nodes('EmptyState').some((node) => node.props.description === '值班服务离线'), true);
  assert.doesNotMatch(app.text(), /真实安排|在岗|已生成/);
  offline = false;
  app.button('刷新安排').props.onClick();
  await app.settle();
  assert.match(app.text(), /真实安排/);
  assert.equal(calls, 2);
  app.unmount();
});

test('training stays mounted with explicit display none outside its tab and preserves its draft', async () => {
  let requests = 0;
  const app = mount('StaffWorkspace', 'StaffWorkspace', { staffName: '李警官', onExit() {} }, {
    requestApi: async (url) => {
      requests++;
      if (url.endsWith('/readiness')) return { dataMode: 'sample', notice: '训练服务声明', ruleVersion: 'v1', updatedAt: 'now' };
      return { dataMode: 'sample', items: url.endsWith('/tasks') ? [trainingTask()] : [] };
    },
  });
  const wrapper = () => {
    const node = app.nodes('View', true).find((item) => item.props.children?.props?.className === 'staff-training');
    assert.ok(node, 'Training remains mounted inside its wrapper.');
    assert.equal(node.props.hidden, undefined, 'Visibility must not depend on the native hidden attribute.');
    return node;
  };
  const visibleTraining = () => app.nodes('View').filter((node) => node.props.className === 'staff-training');
  await app.settle();
  assert.equal(wrapper().props.style?.display, 'none');
  assert.equal(visibleTraining().length, 0);
  assert.equal(requests, 0);

  app.button('训练').props.onClick();
  await app.settle();
  assert.equal(wrapper().props.style?.display, 'block');
  assert.equal(visibleTraining().length, 1);
  app.nodes('Switch')[0].props.onChange({ detail: { value: true } });
  await app.settle();
  app.nodes('Input').find((node) => node.props.placeholder === '1 至 3600').props.onInput({ detail: { value: '27' } });
  await app.settle();
  const loadedRequests = requests;

  for (const tab of ['工作台', '任务', '我的']) {
    app.button(tab).props.onClick();
    await app.settle();
    assert.equal(wrapper().props.style?.display, 'none');
    assert.equal(visibleTraining().length, 0);
    assert.doesNotMatch(app.text(), /训练服务声明/);
    assert.equal(requests, loadedRequests);
  }
  app.button('训练').props.onClick();
  await app.settle();
  assert.equal(wrapper().props.style?.display, 'block');
  assert.equal(app.nodes('Input').find((node) => node.props.placeholder === '1 至 3600').props.value, '27');
  app.unmount();
});
