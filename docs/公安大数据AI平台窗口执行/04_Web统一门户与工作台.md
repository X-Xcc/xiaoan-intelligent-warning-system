# 窗口 04｜Web 统一门户与工作台

## 目标

把 Web 端呈现为一个可导航、可进入、可回溯的公安平台门户。首屏讲清平台分层，侧边导航进入五大业务系统、AI 中心和治理中心；页面不以单一业务运营看板承担平台总览职责。

## 必用技能与工具

- `frontend-design`：完成信息层级、深色内网界面和桌面/小屏布局。
- `ui-ux-designer`：检查工作流、导航和状态反馈。
- `accessibility`：执行 WCAG 2.2 AA 基础检查，重点是焦点、对比度、语义和键盘路径。
- `test-driven-development`：先写静态契约测试，再改页面。
- `verification-before-completion`：构建后用浏览器或本地 HTTP 检查核心路由。
- 需要浏览器交互时使用 agent-browser 或浏览器 MCP；只做本地页面验证，不上传公安数据。

## 只读输入

- `docs/公安大数据AI平台窗口执行/00_窗口执行总控.md`
- `docs/公安大数据AI平台窗口执行/01_平台底座与数据资源中心.md`
- `docs/公安大数据AI平台窗口执行/02_AI智能中枢与智能体编排.md`
- `docs/公安大数据AI平台窗口执行/03_五大业务系统与统一事件链.md`
- `apps/dashboard/src/pages/DashboardApp.tsx`
- `apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx`
- `apps/dashboard/src/pages/PoliceDomainPages.tsx`
- `apps/dashboard/src/styles.css`
- `apps/dashboard/index.html`

## 允许修改的文件

- `apps/dashboard/src/pages/DashboardApp.tsx`
- `apps/dashboard/src/pages/PublicSecurityPlatformPage.tsx`
- `apps/dashboard/src/styles.css`
- `apps/dashboard/index.html`
- `scripts/verify_public_security_data_platform.mjs`
- `scripts/verify_platform_shell.mjs`

不得修改后端业务逻辑、数据库和小程序。

## 固定路由和导航

| 路由 | 视图 | 导航名称 |
|---|---|---|
| `/platform` | 平台总览 | 平台总览 |
| `/command` | 接处警工作台 | 接处警系统 |
| `/case` | 执法办案工作台 | 执法办案系统 |
| `/community` | 社区警务工作台 | 社区警务系统 |
| `/duty-plan` | 勤务训练工作台 | 勤务训练系统 |
| `/mobile` | 移动勤务工作台 | 移动勤务系统 |
| `/ai-center` | AI 运行中心 | AI 能力中心 |
| `/admin` | 治理中心 | 平台治理中心 |

`/` 必须重定向或显示 `/platform`，刷新任一路由后页面仍能正确识别当前视图。

## 平台首页结构

`PublicSecurityPlatformPage` 固定包含以下区域和语义：

1. `data-platform-hero`：平台名称、统一智能底座说明、平台分层图和主动作。
2. `data-platform-kpi-grid`：跨系统运行指标，只使用平台字段。
3. `data-platform-foundation-grid`：数据资源中心、统一数据对象、目录和治理入口。
4. `data-platform-ai-grid`：国产大模型、Agent、Skill、MCP 和 AI 结果责任链。
5. `data-platform-business-grid`：五个独立业务系统入口，每张卡片都能导航。
6. `data-platform-flow`：统一事件链，从接警到训练复盘。
7. `data-platform-governance`：身份、权限、审计、人工确认和内网部署。

所有区域必须有可访问名称，例如：

```tsx
<section className="data-platform-section" aria-label="数据资源中心">
<div className="data-platform-object-panel" aria-label="统一数据对象">
<section className="data-platform-section" aria-label="AI 智能中枢">
<section className="data-platform-section" aria-label="五大业务系统">
<section className="data-platform-governance" aria-label="平台治理与安全">
```

## 数据合并规则

`DashboardApp` 的 `mergeOverview()` 负责平台接口与演示数据合并：

- 接口有数据时优先使用接口数据。
- 接口数组为空时使用结构完整的演示数据，避免页面空白。
- 后端业务系统 `alarm` 映射到前端路由 `command`，`training` 映射到 `duty-plan`。
- 合并运行态字段时只覆盖 `name`、`description`、`status`、`metric`、`capabilities`；保留前端路由键和图标。
- API 失败时显示“样板运行态”或“等待业务数据接入”，不能显示接口成功。

## 视觉和交互标准

- 深色公安内网风格：高对比文字、蓝/青为主色，红色只表达高风险或待人工确认。
- 平台首页使用“架构图 + 数据域 + AI 中枢 + 业务系统矩阵”叙事，KPI 只作为支撑信息。
- 业务系统卡片使用原生 `button`，点击后进入对应路由并滚动到页面顶部。
- 刷新、确认、回退按钮必须有禁用态、加载态和状态反馈。
- 所有按钮 `:focus-visible` 显示至少 2px 可见轮廓；窄屏下侧边栏可打开、关闭，内容不横向溢出。
- 不用颜色作为唯一状态表达；状态同时显示文字或图标。

## 执行步骤

1. 在 `verify_public_security_data_platform.mjs` 和 `verify_platform_shell.mjs` 先断言标题、区域、路由、产品名和 AI 模块入口。
2. 修正 `DashboardApp.tsx` 的 `PlatformView` 类型、路由解析和 `mergeOverview()` 别名合并。
3. 完成 `PublicSecurityPlatformPage.tsx` 的平台分层首页和五个业务入口。
4. 使用 `styles.css` 完成 Grid/Flex、状态、焦点和 1180/820/560 像素断点。
5. 用浏览器或 HTTP 逐个打开 8 条路由，检查无运行时错误和导航死链。

## 完成标准

- 浏览器标题和平台壳名称统一为“公安大数据与 AI 平台”。
- 平台首页可见数据底座、AI 中枢、五大系统、统一事件链、治理安全。
- 五张业务卡片可分别进入 `/command`、`/case`、`/community`、`/duty-plan`、`/mobile`。
- API 在线和 API 失败两种状态均可正常显示。
- 桌面和窄屏均无横向溢出，键盘可完成导航。

## 窗口专属验收命令

```powershell
node --test scripts/verify_public_security_data_platform.mjs
node --test scripts/verify_platform_shell.mjs
npm --workspace apps/dashboard run build
```

## 复制到新窗口的开工提示

```text
你负责窗口 04：Web 统一门户与工作台。先阅读总控和窗口01—03，只允许修改 DashboardApp.tsx、PublicSecurityPlatformPage.tsx、styles.css、index.html 及对应前端契约测试。把首页做成平台分层门户，固定展示数据资源中心、AI智能中枢、五大业务系统、统一事件链和治理安全；修正 alarm→command、training→duty-plan 的前后端映射。先写失败测试，再实现，最后逐路由构建验收。完成后按总控文档格式回传。
```

