# 公安大数据与 AI 平台交付实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个以公安主数据和统一 AI 智算引擎为底座、由五大业务工作台组成的可运行 Web 平台框架。

**Architecture:** 平台采用“统一壳层 → 平台总览 → 业务域工作台 → AI 能力中心”的固定信息架构。主数据目录、统一事件链、权限审计和 AI 输出契约由平台层统一提供；接处警、执法办案、社区警务、勤务训练、移动勤务分别承载各自业务流程和用户操作，不再把旧的单一业务页面作为平台首页。

**Tech Stack:** React 18 + TypeScript + Vite + Ant Design + lucide-react；FastAPI 只读平台运行态接口；CSS Grid/Flex 响应式布局。

**Spec:** 用户提供的《勤务训练系统、接处警系统、执法办案系统、移动勤务系统 AI 模块清单》及其统一国产大模型底座要求。

## Global Constraints

- 产品名称统一使用“公安大数据与 AI 平台”。
- 平台必须明确展示五大业务域：接处警、执法办案、社区警务、勤务训练、移动勤务。
- AI 结果必须展示依据、置信度、人工确认、回退入口和审计编号等责任链信息。
- 所有高风险建议只进入人工确认队列，不直接替代民警决定。
- 保留现有用户代码和接口兼容性，不删除无关历史功能。

### Task 1: 固定平台壳与路由

**Files:**
- Modify: `apps/dashboard/src/pages/DashboardApp.tsx`
- Modify: `apps/dashboard/src/styles.css`

- [ ] 将非入口路由统一包裹在平台侧边导航、组织/角色上下文和运行态栏中。
- [ ] 将 `/command` 和 `/duty-plan` 指向新的公安业务工作台组件。
- [ ] 保持 `/platform`、`/case`、`/community`、`/mobile`、`/ai-center` 的独立路由。

### Task 2: 重做平台总览

**Files:**
- Modify: `apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx`
- Modify: `apps/dashboard/src/styles.css`

- [ ] 首屏展示跨域 KPI、业务域矩阵、统一 AI 任务队列和主数据健康度。
- [ ] 业务域卡片必须进入独立工作台，不再回到平台首页。
- [ ] 展示统一事件链、权限审计和 AI 输出契约。

### Task 3: 建设接处警与勤务训练工作台

**Files:**
- Modify: `apps/dashboard/src/pages/PoliceDomainPages.tsx`

- [ ] 接处警工作台完整展示七项 AI 模块：语音转写、警情摘要、分类分级派警、问询指引、警情画像、态势分析、重复报警与风险识别。
- [ ] 勤务训练工作台完整展示七项 AI 模块：课程编辑器、实战模拟训练、智能评估与报告、体能训练与动作识别、反诈劝阻实训、个性化训练推送、训练档案。
- [ ] 增加可操作的选中、确认、生成、回退等交互状态。

### Task 4: 完善其余业务工作台与 AI 中心

**Files:**
- Modify: `apps/dashboard/src/pages/PoliceDomainPages.tsx`
- Modify: `server/app/api/routes/platform.py`

- [ ] 校验执法办案、社区警务、移动勤务的模块清单与用户规格一致。
- [ ] 统一展示 Agent、Skill、MCP、知识库和模型运行状态。
- [ ] 平台接口返回业务域指标、主数据目录、事件链和 AI 运行态。

### Task 5: 验收

**Files:**
- Test: `scripts/verify_platform_shell.mjs`

- [ ] 运行 `npm run dashboard:build`。
- [ ] 运行 `node --test scripts/verify_platform_shell.mjs`。
- [ ] 运行 `python -m compileall -q server/app`。
- [ ] 检查六条核心路径：`/platform`、`/command`、`/case`、`/community`、`/mobile`、`/duty-plan`、`/ai-center`。
