# 备勤训练试点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有公安大数据与 AI 平台中交付一个可追溯、可复核的备勤训练 A1-A3 + 训练档案试点闭环。

**Architecture:** FastAPI 提供独立 training 路由和训练试点服务，使用现有 SQLAlchemy 数据库持久化任务、评分和档案；React `/duty-plan` 消费同一接口并保留 API 不可用时的本地工作台回退。所有首期结果明确标注为脱敏样例和确定性规则。

**Tech Stack:** FastAPI, SQLAlchemy, SQLite verification database, React 19, TypeScript, Vite, lucide-react, Node test runner.

---

### Task 1: 固定接口行为

**Files:**
- Create: `scripts/verify_readiness_training_pilot.py`
- Create: `scripts/verify_readiness_training_frontend.mjs`

- [x] 写后端冒烟测试并先运行，确认 `/api/training/readiness` 以 404 失败。
- [x] 写前端源代码契约测试并先运行，确认接口字符串尚未出现。

### Task 2: 实现持久化训练服务

**Files:**
- Create: `server/app/services/training_pilot.py`
- Modify: `server/app/services/models.py`
- Create: `server/app/api/routes/training.py`
- Modify: `server/app/main.py`

- [x] 增加训练任务、评分、档案模型与样例数据。
- [x] 增加 readiness、tasks、start、complete、assessment、review、archives 接口。
- [x] 运行 `scripts/verify_readiness_training_pilot.py`，确认真实 FastAPI 进程闭环通过。

### Task 3: 接通工作台

**Files:**
- Modify: `apps/dashboard/src/pages/PoliceDomainPages.tsx`
- Modify: `apps/dashboard/src/styles.css`

- [x] A1 展示风险组成、依据、规则版本和样例边界。
- [x] A2 展示三张任务卡并支持开训、完训和评分。
- [x] A3 展示分项分数、总分、置信度、证据时间、审计号和复核入口。
- [x] T1 展示档案与补训建议，并保留旧有工作台文案兼容性。

### Task 4: 回归与交付

- [x] 运行 `node --test scripts/verify_readiness_training_frontend.mjs`。
- [x] 运行 `npm --prefix apps/dashboard run build`。
- [x] 运行 `node --test scripts/verify_police_workbench.mjs`。
- [x] 运行 `scripts/verify_readiness_training_pilot.py`。
- [x] 用本地 HTTP 路由检查确认 `/` 与 `/duty-plan` 均返回工作台入口；浏览器自动化受本机策略限制，视觉联排保留为现场验收项。
