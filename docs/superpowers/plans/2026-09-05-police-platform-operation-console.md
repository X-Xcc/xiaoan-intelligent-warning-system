# 公安大数据与 AI 平台运行工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Web 端交付为以运行态、业务闭环和治理责任链为核心的公安大数据与 AI 平台。

**Architecture:** 应用固定为“平台运行态驾驶舱 → 五个独立业务工作台 → AI 能力中心 → 平台治理中心”的信息架构。统一事件链、公安主数据、国产模型推理、Agent、Skill、MCP、组织权限和审计在平台层呈现；每个业务域进入各自的操作界面，而不是展示同一套通用内容。

**Tech Stack:** React + TypeScript + Vite + Ant Design + lucide-react；FastAPI 平台运行态和治理接口；CSS Grid/Flex 响应式布局。

**Spec:** `docs/公安大数据平台冻结交付方案.md`

## Global Constraints

- 产品名称固定为“公安大数据与 AI 平台”。
- Web 标题固定为“公安大数据与 AI 平台｜统一警务工作台”。
- 五个业务域固定为：接处警、执法办案、社区警务、勤务训练、移动勤务。
- AI 输出固定包含结果、置信度、依据或数据时间、人工确认、回退入口和审计编号。
- 涉及警情研判、执法办案、身份核验和处置建议的高风险结果进入人工确认队列。
- 平台可见内容使用公安主数据、警情、案件、社区、训练和移动勤务的对象模型。

### Task 1: 建立可验证的运行态驾驶舱契约

**Files:**
- Modify: `scripts/verify_platform_shell.mjs`
- Test: `scripts/verify_platform_shell.mjs`

**Interfaces:**
- Consumes: `apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx`
- Produces: 对平台首页运行态结构的静态回归保护。

- [ ] **Step 1: 写入失败测试**

```js
test('公安平台首页呈现运行态驾驶舱与五域运行矩阵', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  for (const label of ['平台运行态驾驶舱', '业务域运行矩阵', '人工确认队列', '主数据健康度']) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /platform-runtime-hero/);
  assert.match(page, /platform-domain-matrix/);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test scripts/verify_platform_shell.mjs`

Expected: 新增断言因驾驶舱结构尚未实现而失败。

- [ ] **Step 3: 实现最小页面结构**

```tsx
<header className="platform-runtime-hero">
  <span>PLATFORM LIVE OPERATIONS</span>
  <h1>平台运行态驾驶舱</h1>
</header>
<section className="platform-domain-matrix" aria-label="五大业务域运行状态" />
```

- [ ] **Step 4: 运行通过测试**

Run: `node --test scripts/verify_platform_shell.mjs`

Expected: 新增驾驶舱测试通过。

### Task 2: 重构平台首页为运行工作台

**Files:**
- Modify: `apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx`
- Modify: `apps/dashboard/src/styles.css`

**Interfaces:**
- Consumes: `/api/platform/overview` 中的 `stats`、`events`、`businessSystems`、`dataCatalog`、`ai_copilot`。
- Produces: 平台运行态、实时警情、业务域状态、AI 运行态、主数据健康度和人工确认入口。

- [ ] **Step 1: 将首页头部固定为运行态上下文**

```tsx
<header className="platform-runtime-hero">
  <div>
    <span className="platform-kicker">PLATFORM LIVE OPERATIONS</span>
    <h1>平台运行态驾驶舱</h1>
    <p>统一查看警情处置、业务域协同、AI 运行和治理责任链。</p>
  </div>
  <button type="button" onClick={refresh}>刷新运行态</button>
</header>
```

- [ ] **Step 2: 创建五大业务域状态矩阵**

```tsx
<section className="platform-domain-matrix" aria-label="五大业务域运行状态">
  {platformSystems.map((system) => (
    <button key={system.name} type="button" onClick={() => openSystem(system)}>
      <strong>{system.name}</strong>
      <span>{system.features[0]}</span>
      <b>进入工作台</b>
    </button>
  ))}
</section>
```

- [ ] **Step 3: 将运行区拆为四个可读面板**

```tsx
<section aria-label="实时警情队列" />
<section aria-label="AI运行态" />
<section aria-label="主数据健康度" />
<section aria-label="人工确认队列" />
```

- [ ] **Step 4: 为所有交互元素添加键盘焦点和可访问名称**

```css
.platform-page button:focus-visible {
  outline: 3px solid #0b7bd3;
  outline-offset: 3px;
}
```

- [ ] **Step 5: 验证**

Run: `npm run dashboard:build`

Expected: TypeScript 和 Vite 构建成功。

### Task 3: 固定壳层为平台工作台导航

**Files:**
- Modify: `apps/dashboard/src/pages/DashboardApp.tsx`
- Modify: `apps/dashboard/src/styles.css`

**Interfaces:**
- Consumes: `View` 路由、`systemNavItems`、`loadOverview`。
- Produces: 默认进入 `/platform` 的平台工作台、单一侧边业务导航、紧凑运行状态栏。

- [ ] **Step 1: 写入默认路由测试**

```js
assert.match(app, /: 'platform';/);
assert.match(app, /pathView\(\)/);
```

- [ ] **Step 2: 将根路径解析为平台运行态**

```ts
const pathView = (): View => (
  window.location.pathname.startsWith('/command') ? 'command' : 'platform'
);
```

- [ ] **Step 3: 移除第二套重复导航，只保留侧边业务导航与顶栏运行状态**

```tsx
<header className="platform-command-bar" aria-label="平台状态栏">
  <span>南昌市公安局 · 指挥中心</span>
  <span aria-live="polite">{apiOnline ? '内网服务已连接' : '等待平台接口'}</span>
</header>
```

- [ ] **Step 4: 验证路由和构建**

Run: `node --test scripts/verify_platform_shell.mjs; npm run dashboard:build`

Expected: 所有平台壳层测试通过，构建成功。

### Task 4: 形成平台治理中心的独立视觉与管理面

**Files:**
- Modify: `apps/dashboard/src/pages/AdminConsolePage.tsx`
- Modify: `apps/dashboard/src/styles.css`

**Interfaces:**
- Consumes: `/api/admin/overview`、`/api/admin/runtime-status`、`/api/admin/platform-settings`、`/api/platform/overview`。
- Produces: 主数据、AI 运行时、组织权限、审计确认和安全策略五个治理视图。

- [ ] **Step 1: 确认治理中心关键标签**

```js
for (const label of ['主数据健康度', 'Agent 注册表', 'Skill 策略', 'MCP 连接器', '人工确认队列']) {
  assert.match(admin, new RegExp(label));
}
```

- [ ] **Step 2: 以治理数据卡、表格和确认队列组织界面**

```tsx
<div className="governance-tabs" role="tablist" />
<Table columns={agentColumns} dataSource={agents} />
<div className="governance-confirmation-list" />
```

- [ ] **Step 3: 补齐治理页响应式样式**

```css
@media (max-width: 820px) {
  .governance-two-column { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: 验证**

Run: `npm run dashboard:build`

Expected: 治理中心组件和样式通过 TypeScript 构建。

### Task 5: 浏览器级验收与服务验证

**Files:**
- Test: `scripts/verify_platform_shell.mjs`
- Test: `scripts/verify_platform_governance_http_api.py`

**Interfaces:**
- Consumes: Dashboard 开发服务与 FastAPI 服务。
- Produces: 七个界面路径、平台接口和 Python 服务的验收证据。

- [ ] **Step 1: 启动 Dashboard 开发服务**

Run: `npm --workspace apps/dashboard run dev -- --host 127.0.0.1`

- [ ] **Step 2: 访问并检查路径**

```text
/platform
/command
/case
/community
/duty-plan
/mobile
/ai-center
/admin
```

- [ ] **Step 3: 运行自动化验证**

Run: `node --test scripts/verify_platform_shell.mjs; python -m compileall -q server/app; python scripts/verify_platform_governance_http_api.py`

Expected: 全部命令退出码为 0。

- [ ] **Step 4: 记录验收结论**

记录当前构建结果、页面路由检查结果、接口检查结果和仍需外部数据接入的字段范围。
