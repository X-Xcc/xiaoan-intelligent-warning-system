# 备勤训练演示模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/duty-plan` 交付由 `Shift + Space` 隐形推进的 A1 勤务态势、A2 靶向训练、A3 AI 动捕考核全屏演示链路，并衔接既有训练复核闭环。

**Architecture:** 在 `TrainingOperationsPage` 增加前端专用 showcase 状态机和渲染分支，不改变 `/api/training`。A2 复用任务数据和开始/完成接口，A3 复用评分结果并只进入既有教官复核步骤。

**Tech Stack:** React 19, TypeScript, Vite, lucide-react, CSS animations, Node test runner.

---

### Task 1: 固定前端演示契约

**Files:**
- Modify: `scripts/verify_readiness_training_frontend.mjs`
- Test: `scripts/verify_readiness_training_frontend.mjs`

- [ ] **Step 1: 写失败的源码契约测试**

```js
test('演示模式提供三屏与无提示快捷键推进', () => {
  for (const text of [
    "type TrainingShowcaseStage = 'a1' | 'a2' | 'a3' | 'handoff'",
    "event.shiftKey && event.code === 'Space'",
    'showcase-stage-a1', 'showcase-stage-a2', 'showcase-stage-a3',
    '今日靶向训练科目已推送', '全体科目达标', 'showcase-handoff',
  ]) assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
  assert.doesNotMatch(page, /快捷键提示|键帽提示/);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test scripts/verify_readiness_training_frontend.mjs`

Expected: 新断言因演示状态机不存在而失败。

- [ ] **Step 3: 提交测试基线**

```bash
git add scripts/verify_readiness_training_frontend.mjs
git commit -m "test: cover training showcase contract"
```

### Task 2: 建立 A1 状态机和态势大屏

**Files:**
- Modify: `apps/dashboard/src/pages/PoliceDomainPages.tsx`
- Modify: `apps/dashboard/src/styles.css`
- Test: `scripts/verify_readiness_training_frontend.mjs`

- [ ] **Step 1: 定义演示状态和科目映射**

```ts
type TrainingShowcaseStage = 'a1' | 'a2' | 'a3' | 'handoff';

const SHOWCASE_SUBJECTS = [
  { subject: '单警装备训练', taskSubject: '单警装备快速取用', standard: '单警装备 30 秒取用完毕' },
  { subject: '弱光执法战术训练', taskSubject: '弱光环境下执法战术', standard: '弱光队形转换不超过 10 秒' },
  { subject: '防爆先期处置', taskSubject: '防爆警戒圈设置', standard: '30 米警戒圈 60 秒内设定' },
] as const;
```

在 `TrainingOperationsPage` 增加 `showcaseStage`、`showcaseStarted`、`showcaseCompletedSubjects` 和 `showcaseScoresRevealed`。使用 `useEffect` 监听键盘：只在 `event.shiftKey && event.code === 'Space'` 且目标不是 input、textarea、select、video 或 contenteditable 时推进；A1 首次触发 500ms 后展示图表。

- [ ] **Step 2: 渲染 A1**

新增 `renderTrainingShowcase()` 的 `showcase-stage-a1` 分支：左 25% 环图、中心 50% 夜市平面热力/人流箭头、右 25% 20:00–23:00 柱图、底部训练横幅。横幅只在生成后滚动，点击进入 A2；不渲染任何快捷键提示。

- [ ] **Step 3: 写入大屏样式**

以 `.training-showcase` 作为样式根，使用深色指挥中心底色、警示红、数据绿。使用稳定栅格、`min-height: min(760px, calc(100vh - 110px))` 和移动断点；环图扇形、热力波纹、横幅动效仅在 `.is-generated` 后运行。

- [ ] **Step 4: 通过测试后提交**

Run: `node --test scripts/verify_readiness_training_frontend.mjs && npm --prefix apps/dashboard run build`

Expected: 测试与构建通过。

```bash
git add apps/dashboard/src/pages/PoliceDomainPages.tsx apps/dashboard/src/styles.css scripts/verify_readiness_training_frontend.mjs
git commit -m "feat: add training readiness showcase"
```

### Task 3: 实现 A2 训练卡与状态同步

**Files:**
- Modify: `apps/dashboard/src/pages/PoliceDomainPages.tsx`
- Modify: `apps/dashboard/src/styles.css`
- Test: `scripts/verify_readiness_training_frontend.mjs`

- [ ] **Step 1: 实现完成动作**

实现 `completeShowcaseSubject()`：定位首个未完成 `SHOWCASE_SUBJECTS` 项，匹配 `trainingTasks`。任务为 `待训练` 时走现有启动流程，为 `训练中` 时走完成/评分流程；请求失败或无任务时只更新演示状态，不伪造归档状态。第三项完成后延迟切换 A3。

- [ ] **Step 2: 渲染 A2**

输出 `showcase-stage-a2`，纵向三张训练卡，每张包含科目、依据、装备、醒目的达标标准和右上角勾选。完成卡使用 `.is-complete` 绿边；连接轨道、计数同步变化。点击当前未完成卡亦可推进。

- [ ] **Step 3: 扩展测试并提交**

断言 `SHOWCASE_SUBJECTS`、三项名称、`completeShowcaseSubject`、`showcase-stage-a2`、`is-complete` 存在，且源码没有可见快捷键说明。

Run: `node --test scripts/verify_readiness_training_frontend.mjs && npm --prefix apps/dashboard run build`

Expected: 测试与构建通过。

```bash
git add apps/dashboard/src/pages/PoliceDomainPages.tsx apps/dashboard/src/styles.css scripts/verify_readiness_training_frontend.mjs
git commit -m "feat: add targeted training showcase cards"
```

### Task 4: 实现 A3 动捕视觉与复核交接

**Files:**
- Modify: `apps/dashboard/src/pages/PoliceDomainPages.tsx`
- Modify: `apps/dashboard/src/styles.css`
- Test: `scripts/verify_readiness_training_frontend.mjs`

- [ ] **Step 1: 渲染动捕和评分**

输出 `showcase-stage-a3`：左侧训练预览、CSS 骨架节点/连线、扫描线；右侧由 `showcaseScoresRevealed` 逐项显示动作规范度、完成用时、协同一致性。优先使用 `assessment?.score`，没有 API 评分时才明确采用脱敏演示分数。

- [ ] **Step 2: 结论章与交接**

第三次触发后显示 `.showcase-result-stamp`，结论为“全体科目达标”或“存在补训项”。进入 `handoff` 后提供“进入教官复核”命令按钮，执行 `setFlowStep(3)` 并显示已有训练执行台；快捷键分支不得调用 review 或 archive 接口。

- [ ] **Step 3: 添加响应式样式、测试、提交**

小屏改为上下布局，确保红章不遮挡结论。契约测试断言 `showcaseScoresRevealed`、`showcase-result-stamp`、两个结论文案、`setFlowStep(3)` 存在，并确认快捷键推进不会自动复核。

Run: `node --test scripts/verify_readiness_training_frontend.mjs scripts/verify_police_workbench.mjs && npm --prefix apps/dashboard run build`

Expected: 所有测试和构建通过。

```bash
git add apps/dashboard/src/pages/PoliceDomainPages.tsx apps/dashboard/src/styles.css scripts/verify_readiness_training_frontend.mjs
git commit -m "feat: add AI motion assessment showcase"
```

### Task 5: 视觉验收

**Files:**
- Test: `scripts/verify_readiness_training_frontend.mjs`

- [ ] **Step 1: 启动并检查两个视口**

Run: `npm --workspace apps/dashboard run dev -- --port 5174`

Expected: `/duty-plan` 首屏是静止 A1；在桌面 1440px 和窄视口逐次触发 A1、A2、A3 与交接，没有可见快捷键提示、文字重叠或横向滚动。

- [ ] **Step 2: 提交视觉修正**

```bash
git add apps/dashboard/src/pages/PoliceDomainPages.tsx apps/dashboard/src/styles.css scripts/verify_readiness_training_frontend.mjs
git commit -m "test: verify training showcase flow"
```
