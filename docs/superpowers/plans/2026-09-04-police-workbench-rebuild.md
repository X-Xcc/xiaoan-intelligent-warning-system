# 公安业务工作台 Web 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` or subagent-driven development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Web 端交付为一套可操作、可追溯的公安业务工作台，使值班、接处警、办案、社区、训练和移动处置各自呈现完整业务流程。

**Architecture:** 保留统一组织、权限、数据同步和 AI 运行态壳层；平台首页固定为“值班总控台”，以优先处置、人工确认、统一事件链和业务域运行清单组织信息。五个业务路由各自使用流程面板、任务队列、业务记录和 AI 辅助结果，所有高风险智能建议由人工确认动作进入下一业务节点。

**Tech Stack:** React 19、TypeScript、Vite、Ant Design、lucide-react、CSS Grid/Flex；FastAPI `/api/platform/overview` 提供运行态数据。

**Spec:** `docs/公安大数据平台冻结交付方案.md`

## Global Constraints

- 产品名称固定为“公安大数据与 AI 平台”。
- 平台首页固定为“值班总控台”，包含优先处置、人工确认、处置流程和业务域运行清单。
- 五个业务工作台固定为：接处警、执法办案、社区警务、勤务训练、移动勤务。
- 每条 AI 结果固定包含结果、置信度、依据或数据时间、人工确认、回退操作和审计编号。
- 高风险建议必须由民警确认后才改变业务状态。
- 交互控件使用原生按钮、输入框、标签和可见键盘焦点；状态变化通过 `aria-live` 告知辅助技术。
- 不提交 Git commit：当前工作区存在用户的并行改动，验收以任务内测试和构建记录为准。

---

### Task 1: 建立流程型工作台的回归测试

**Files:**
- Create: `scripts/verify_police_workbench.mjs`
- Test: `scripts/verify_police_workbench.mjs`

**Interfaces:**
- Consumes: `apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx`、`apps/dashboard/src/pages/PoliceDomainPages.tsx`、`apps/dashboard/src/styles.css`。
- Produces: 对首页值班总控台、五个流程工作台和可访问焦点样式的静态回归保护。

- [ ] **Step 1: 写入失败测试**

```js
test('首页使用值班总控台组织优先处置与人工确认', () => {
  const page = read('apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx');
  for (const text of ['值班总控台', '优先处置', '处置流程', '业务域运行清单', '待人工确认']) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /police-shift-board/);
  assert.match(page, /police-priority-queue/);
});

test('五个业务工作台拥有独立流程语义', () => {
  const page = read('apps/dashboard/src/pages/PoliceDomainPages.tsx');
  for (const text of ['接警输入', '案件受理', '辖区建档', '课程编排', '任务签收']) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /domain-operation-flow/);
});
```

- [ ] **Step 2: 运行测试并确认其因尚未实现的流程标识而失败**

Run: `node --test scripts/verify_police_workbench.mjs`

Expected: FAIL，缺少 `值班总控台`、`police-shift-board` 或独立业务流程语义。

- [ ] **Step 3: 保留测试文件作为验收入口**

```js
const source = fs.readFileSync(new URL(path, root), 'utf8');
```

- [ ] **Step 4: 在每次页面改动后重跑测试**

Run: `node --test scripts/verify_police_workbench.mjs`

Expected: PASS。

### Task 2: 将平台首页重构为值班总控台

**Files:**
- Modify: `apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx`
- Modify: `apps/dashboard/src/styles.css`
- Test: `scripts/verify_police_workbench.mjs`

**Interfaces:**
- Consumes: `overview.stats`、`overview.events`、`overview.businessSystems`、`overview.eventChain`、`overview.dataCatalog`、`overview.ai_copilot`。
- Produces: 值班上下文、优先处置队列、人工确认队列、处置流程、业务域运行清单和运行支撑区。

- [ ] **Step 1: 写入首页流程结构的实现契约**

```tsx
<section className="police-shift-board" aria-labelledby="shift-board-title">
  <span className="section-kicker">CURRENT DUTY / UNIFIED OPERATIONS</span>
  <h1 id="shift-board-title">值班总控台</h1>
  <p>围绕当前值守任务快速完成确认、分派、跟进和回传。</p>
</section>
<section className="police-priority-queue" aria-label="优先处置" />
```

- [ ] **Step 2: 用事件状态生成可操作的优先处置队列**

```tsx
const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
const confirmEvent = (eventId: string) => {
  setConfirmedIds((ids) => ids.includes(eventId) ? ids : [...ids, eventId]);
};
```

- [ ] **Step 3: 使用真实业务节点绘制处置流程**

```tsx
const steps = ['接警登记', '人工确认', '分级派警', '现场处置', '结果回传', '复盘沉淀'];
<ol className="police-event-flow" aria-label="处置流程">
  {steps.map((step, index) => <li key={step}><b>{String(index + 1).padStart(2, '0')}</b><span>{step}</span></li>)}
</ol>
```

- [ ] **Step 4: 将业务入口改为运行清单而不是介绍卡片**

```tsx
<section className="police-domain-register" aria-label="业务域运行清单">
  {systems.map((system) => <button type="button" onClick={() => navigate(system.route)}>{system.name}</button>)}
</section>
```

- [ ] **Step 5: 运行页面回归测试和构建**

Run: `node --test scripts/verify_police_workbench.mjs; npm --workspace apps/dashboard run build`

Expected: 所有测试通过，TypeScript 与 Vite 构建成功。

### Task 3: 固定五个业务工作台的流程面

**Files:**
- Modify: `apps/dashboard/src/pages/PoliceDomainPages.tsx`
- Modify: `apps/dashboard/src/styles.css`
- Test: `scripts/verify_police_workbench.mjs`

**Interfaces:**
- Consumes: `DomainPageProps`、`overview`、`navigate`、业务模块清单与当前本地交互状态。
- Produces: 每个系统独立的操作阶段、任务清单、AI 辅助结果和人工确认入口。

- [ ] **Step 1: 定义流程阶段的公共显示组件**

```tsx
type FlowStep = { title: string; detail: string; state: 'done' | 'active' | 'pending' };

function DomainOperationFlow({ label, steps }: { label: string; steps: FlowStep[] }) {
  return <ol className="domain-operation-flow" aria-label={label}>
    {steps.map((step, index) => <li className={step.state} key={step.title}><b>{String(index + 1).padStart(2, '0')}</b><strong>{step.title}</strong><small>{step.detail}</small></li>)}
  </ol>;
}
```

- [ ] **Step 2: 为接处警工作台配置四段处置路径**

```tsx
const commandFlow = [
  { title: '接警输入', detail: '语音转写与问询', state: 'done' },
  { title: '分级派警', detail: '人工确认建议', state: 'active' },
  { title: '现场处置', detail: '移动端签收', state: 'pending' },
  { title: '回传归档', detail: '复盘与联动', state: 'pending' },
] satisfies FlowStep[];
```

- [ ] **Step 3: 为办案、社区、训练、移动配置各自流程路径**

```tsx
const caseFlow = ['案件受理', '证据校验', '卷宗审核', '移送归档'];
const communityFlow = ['辖区建档', '任务派发', '走访回传', '闭环复核'];
const trainingFlow = ['课程编排', '模拟训练', '报告确认', '档案沉淀'];
const mobileFlow = ['任务签收', '现场核验', '伴随指引', '结果回传'];
```

- [ ] **Step 4: 在每个工作台顶部嵌入流程面，并将确认动作连接到本地状态**

```tsx
<DomainOperationFlow label="接处警处置流程" steps={commandFlow} />
<button type="button" onClick={markAction} aria-live="polite">人工确认并派警</button>
```

- [ ] **Step 5: 验证业务语义和可构建性**

Run: `node --test scripts/verify_police_workbench.mjs; npm --workspace apps/dashboard run build`

Expected: 五个工作台语义测试通过，构建成功。

### Task 4: 完成界面密度、响应式与可访问性验收

**Files:**
- Modify: `apps/dashboard/src/styles.css`
- Test: `scripts/verify_police_workbench.mjs`

**Interfaces:**
- Consumes: `.police-*` 与 `.domain-operation-flow` 元素。
- Produces: 适用于桌面值守与小屏查看的工作台布局、可见焦点、清晰状态和非颜色单独表达。

- [ ] **Step 1: 建立工作台布局和紧凑任务状态样式**

```css
.police-shift-board { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; }
.police-priority-queue { display: grid; gap: 8px; }
.domain-operation-flow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
```

- [ ] **Step 2: 添加键盘焦点与窄屏重排**

```css
.platform-control-shell button:focus-visible { outline: 3px solid #7dd3fc; outline-offset: 3px; }
@media (max-width: 860px) {
  .police-shift-board,
  .domain-operation-flow { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: 运行构建与静态样式回归测试**

Run: `node --test scripts/verify_police_workbench.mjs; npm --workspace apps/dashboard run build`

Expected: 所有测试通过，生成可部署的 Dashboard 静态产物。

### Task 5: 浏览器级交付验收

**Files:**
- Test: `scripts/verify_police_workbench.mjs`
- Test: `scripts/verify_platform_shell.mjs`

**Interfaces:**
- Consumes: Dashboard 开发服务 `http://127.0.0.1:5175/` 与八条应用路由。
- Produces: 页面可加载、路由可切换、确认交互可见、桌面与窄屏布局可用的验收记录。

- [ ] **Step 1: 启动或复用本地 Dashboard 服务**

Run: `npm --workspace apps/dashboard run dev -- --host 127.0.0.1 --port 5175`

Expected: Vite 监听 `http://127.0.0.1:5175/`。

- [ ] **Step 2: 检查核心路径与主动作**

```text
/platform  → 确认优先处置和人工确认按钮
/command   → 确认接警输入和分级派警流程
/case      → 确认案件受理和证据校验流程
/community → 确认辖区建档和走访回传流程
/duty-plan → 确认课程编排和报告确认流程
/mobile    → 确认任务签收和现场核验流程
/ai-center → 确认 Agent、Skill、MCP 运行态
/admin     → 确认主数据、权限和审计治理
```

- [ ] **Step 3: 运行最终自动化验证**

Run: `node --test scripts/verify_police_workbench.mjs; node --test scripts/verify_platform_shell.mjs; npm --workspace apps/dashboard run build; python -m compileall -q server/app`

Expected: 每个命令的退出码为 0。
