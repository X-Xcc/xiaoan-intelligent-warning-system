# 烟火哨兵

烟火哨兵是一套面向夜市商圈、文旅街区和商业综合体周边夜间消费场景的安全治理原型。项目提供群众端小程序、巡防人员移动端、Web 指挥后台和 FastAPI 后端，连成从风险发现、隐患上报、紧急协同、工单处置到后台展示的一条线。

当前版本重点不是做一个单纯展示页，而是让小程序、后台和后端真正连起来：群众或商户在小程序发起求助或上报，后端生成事件与工单，巡防人员端更新处置状态，Web 后台读取同一组事件数据展示现场情况。

## 功能概览

### 群众端小程序

- 微信一键登录：用户点击后通过 `wx.login` 获取 code，交给后端换取 openid 和系统 token。
- 烟火哨兵首页：展示网格情况、客流、视频提示、地图点位、附近联动点和夜市提醒。
- 隐患上报：支持选择街霸滋扰、打架斗殴、扒窃线索、摊位纠纷等类型，补充描述、照片数量、联系方式和匿名提交。
- 紧急求助：强调 110 / 120 优先，小程序用于同步位置和现场信息给夜市巡防组。
- 我的进度：按求助、上报、线索登记筛选，查看事件流转状态。
- 我的页面：查看个人事件记录、语言偏好、隐私说明和关于信息。
- 多语言入口：登录页和“我的”页提供语言选择。

### 巡防人员端

巡防人员端目前内置在小程序主功能页中，通过巡防人员登录入口进入。

- 今日任务：展示待接收、处理中、已完成数量。
- 任务卡片：展示风险等级、来源、网格、距离、负责人和当前状态。
- 状态流转：支持接收任务、到达现场、开始处理、完成处置。
- 地图视图：展示夜市网格、巡防点、装备点和事件点。
- 台账视图：查看事件、状态和负责人。
- 巡防人员“我的”：展示人员信息、今日任务和工作设置。

### Web 指挥后台

- 运行总览：读取后端事件概览数据，展示今日事件、待处置任务、在线巡防、处理进度等指标。
- 事件工单：展示事件列表和当前状态。
- 跨夜市联防：统一接入市场、区域、设备、风险记录和无人机任务，按事件主链联动处置。
- 管理入口：面向指挥展示服务健康、接口链路、事件库和审计状态。
- 后端联动：后台和小程序共用 `/api/events` 数据链路。

### 后端服务

- FastAPI 服务，默认运行在 `http://127.0.0.1:8010`。
- SQLAlchemy 数据库层，本机和服务器统一使用 PostgreSQL。
- 事件接口覆盖求助、报警推送、指挥派单、状态更新和补充信息。
- WebSocket 实时通道用于报警进入指挥中心、指挥派单同步工作人员端。
- 微信登录接口支持真实 `code2Session`；开发测试会话需要显式设置 `APP_ENV=development`。

## 技术栈

| 模块 | 技术 |
|---|---|
| 小程序 | Taro 4 + React 18 + TypeScript + SCSS |
| 微信端构建 | `taro build --type weapp` |
| 支付宝端构建 | `taro build --type alipay` |
| Web 后台 | React 19 + Vite + TypeScript |
| 图表与视觉 | ECharts、Three.js、React Three Fiber、Lucide Icons |
| 后端 | FastAPI + Uvicorn |
| 数据库 | SQLAlchemy + PostgreSQL |
| 工作区管理 | npm workspaces |

## 目录结构

```text
D:\CICSIC
├─ apps
│  ├─ dashboard              Web 指挥后台
│  │  ├─ src
│  │  └─ package.json
│  └─ miniprogram            Taro 小程序
│     ├─ src
│     │  ├─ assets           Logo、地图 marker 等资源
│     │  ├─ components       通用组件、语言组件、底部导航
│     │  ├─ data             基础选项配置
│     │  ├─ hooks            事件数据 hook
│     │  ├─ i18n             多语言配置
│     │  ├─ pages            index / main / detail 页面
│     │  ├─ types            事件类型定义
│     │  └─ utils            API、导航、时间工具
│     ├─ dist                微信小程序构建产物
│     └─ dist-alipay         支付宝小程序构建产物
├─ server
│  ├─ app
│  │  ├─ api/routes          FastAPI 路由
│  │  ├─ services            数据库、事件与登录存储
│  │  └─ main.py             应用入口
│  ├─ data                   本地开发数据库，已忽略
│  └─ README.md              后端说明
├─ docs                      实现说明与改版文档
├─ package.json              根工作区脚本
└─ project.config.json       微信开发者工具项目配置
```

## 环境准备

建议环境：

- Windows 10/11
- Node.js 22.x 或兼容版本
- npm 10.x 或兼容版本
- Python 3.11
- 微信开发者工具

依赖安装：

```powershell
cd D:\CICSIC
npm install
```

后端 Python 依赖已按 `server/requirements.txt` 管理。如果需要重建虚拟环境：

```powershell
cd D:\CICSIC
python -m venv server\.venv
.\server\.venv\Scripts\python.exe -m pip install -r server\requirements.txt
```

## 快速启动

### 1. 启动后端

```powershell
cd D:\CICSIC
npm run server:dev
```

默认地址：

```text
http://127.0.0.1:8010
```

健康检查：

```text
http://127.0.0.1:8010/api/health
```

接口文档：

```text
http://127.0.0.1:8010/docs
```

### 2. 启动 Web 后台

```powershell
cd D:\CICSIC
npm run dashboard:dev
```

Vite 会在终端输出本地访问地址，通常是：

```text
http://127.0.0.1:5173
```

### 3. 构建微信小程序

```powershell
cd D:\CICSIC
npm run miniprogram:build:weapp
```

构建输出目录：

```text
apps/miniprogram/dist
```

用微信开发者工具打开项目根目录 `D:\CICSIC`，项目配置里的 `miniprogramRoot` 指向 `apps/miniprogram/dist`。

### 4. 构建支付宝小程序

```powershell
cd D:\CICSIC
npm run miniprogram:build:alipay
```

构建输出目录：

```text
apps/miniprogram/dist-alipay
```

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run server:dev` | 启动 FastAPI 后端，监听 `127.0.0.1:8010` |
| `npm run dashboard:dev` | 启动 Web 后台开发服务 |
| `npm run dashboard:build` | 构建 Web 后台 |
| `npm run miniprogram:dev:weapp` | 微信小程序 watch 构建 |
| `npm run miniprogram:build:weapp` | 微信小程序生产构建 |
| `npm run miniprogram:dev:alipay` | 支付宝小程序 watch 构建 |
| `npm run miniprogram:build:alipay` | 支付宝小程序生产构建 |

## 微信开发者工具配置

本地调试时，小程序会请求：

```text
http://127.0.0.1:8010/api
```

因此需要在微信开发者工具中设置：

1. 打开项目 `D:\CICSIC`。
2. 进入 `详情 -> 本地设置`。
3. 勾选 `不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书`。
4. 如需命令行/自动化调试，在 `设置 -> 安全设置` 打开 `服务端口`。

生产环境不能使用 `127.0.0.1`，需要把 `TARO_APP_API_BASE_URL` 改为已经备案、配置到微信公众平台 request 合法域名中的 HTTPS 接口地址。

## 微信登录说明

小程序登录采用标准微信小程序登录链路：

```text
用户点击“微信一键登录”
  -> 小程序调用 wx.login / Taro.login 获取 code
  -> 前端请求 POST /api/auth/wechat-login
  -> 后端携带 AppID、AppSecret、code 请求微信 code2Session
  -> 后端获得 openid / session_key
  -> 后端生成系统 token 并写入数据库
  -> 小程序保存 token 和 user 后进入群众端服务
```

后端读取以下环境变量：

```powershell
$env:WECHAT_APPID="你的微信小程序 AppID"
$env:WECHAT_APP_SECRET="你的微信小程序 AppSecret"
```

开发测试如需临时会话，必须同时设置 `APP_ENV=development`。上线前必须配置真实 AppSecret，且 AppSecret 只能放在后端，不能写进小程序前端代码。

## API 概览

默认前缀：

```text
/api
```

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/health` | 健康检查 |
| `POST` | `/auth/wechat-login` | 微信小程序登录 |
| `GET` | `/events` | 获取事件列表 |
| `GET` | `/events/overview` | 获取运行概览 |
| `GET` | `/events/alarm-pushes` | 获取报警推送队列 |
| `POST` | `/events/help` | 创建群众/商户求助事件 |
| `POST` | `/events/reports` | 创建隐患上报事件 |
| `POST` | `/events/lost-claims` | 创建失物/扒窃线索登记事件 |
| `PATCH` | `/events/{event_id}/status` | 更新事件状态 |
| `PATCH` | `/events/{event_id}/assign` | 指挥中心派单 |
| `PATCH` | `/events/{event_id}/supplement` | 补充事件描述 |
| `PATCH` | `/events/alarm-pushes/{push_id}/acknowledge` | 确认报警推送 |

实时通道：

```text
ws://127.0.0.1:8010/api/events/realtime
```

示例：创建求助事件

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://127.0.0.1:8010/api/events/help" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"bay":"主街烧烤区","description":"商户同步当前位置，请附近巡防组协助。"}'
```

示例：微信登录开发态请求

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://127.0.0.1:8010/api/auth/wechat-login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"code":"dev-test-code"}'
```

## 数据库说明

后端通过 `DATABASE_URL` 连接 PostgreSQL。本机开发和服务器部署使用同一类数据库，服务启动时会自动初始化业务表。

```powershell
$env:DATABASE_URL="postgresql://yanhuo:你的密码@数据库地址:5432/yanhuo_shaobing"
npm run server:dev
```

当前核心表：

- `safety_events`：求助、反馈、失物登记和工单流转事件。
- `alarm_pushes`：一键报警推送到指挥中心的确认记录。
- `event_audit_logs`：事件创建、派单、接收、到达、处理、结果记录。
- `security_detections`：YOLO/视频检测结果、动作、相机和证据索引。
- `wechat_users`：微信 openid、session_key、系统 token 和登录时间。

后续可以继续补充巡防人员账号、设备、物资、预案、权限和消息通知等表。

## 视频检测与画面复核接入

项目采用“本地实时检测 + 数据库入库 + 画面复核”的接入路径。YOLO 负责快速发现人员聚集、打架、跌倒、离岗等线索；CICSIC 先保存检测记录，再生成事件工单；复核服务通过可配置 API 对关键帧或短片段再看一遍，输出风险等级和处置建议。复核结果会回写事件等级与派单优先级，相同 `eventKey` 保持一次事件归并。

默认本地检测文件为：

```text
server/models/yolov8n-pose.pt
```

默认检测数据目录为：

```text
server/security-data
```

检测程序生成的 `detection_*.json` 包含 `actions`、`person_count`、`camera_name`、`camera_id` 等字段时，后端会先导入 `security_detections`，再把支持的动作生成 `视频提示` 事件，并进入指挥中心报警推送队列。大屏 `/monitor` 显示实时视频、检测状态和复核状态，`/command` 继续承接派单、路线和处理结果。

核心接口：

```text
GET  /api/security-video/status
GET  /api/security-video/cameras
GET  /api/security-video/feed?cam=cam-001
GET  /api/security-ai/status
POST /api/security-ai/judgements
POST /api/security-ai/yolo-reviews
POST /api/events/{event_id}/vision-review
POST /api/events/security-detections/sync
```

可选环境变量：

```powershell
$env:SECURITY_DETECTION_DATA_DIRS="D:\CICSIC\server\security-data"
$env:SECURITY_MODEL_PATH="D:\CICSIC\server\models\yolov8n-pose.pt"
$env:SECURITY_VIDEO_BASE_URL="http://127.0.0.1:5000"
$env:VITE_SECURITY_MONITOR_URL="http://127.0.0.1:5000/monitor"
$env:SECURITY_VLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:SECURITY_VLM_API_KEY="<your key>"
$env:SECURITY_VLM_MODEL="qwen-vl-plus"
```

也可以在 `server/.env.local` 写入同名配置，服务启动时会自动读取。该文件已被忽略，不会提交到仓库。

复核接口按兼容的 chat completions 形态调用，适配通义千问 Qwen-VL / Qwen3-VL 一类云端或私有化网关。`POST /api/security-ai/yolo-reviews` 会读取数据库里的最新检测记录和证据索引，再做一次画面复核并写回事件；CICSIC 不把浏览器摄像头帧转发给 YOLO。未配置密钥时，后端仍会返回本地检测上下文占位，方便大屏和事件链路继续对接。

接口也支持 YOLO 端主动推送聚集结果和一张证据帧；这条路径不会把浏览器摄像头帧转发给 YOLO。外部检测端可通过 `CICSIC_REVIEW_MAX_ATTEMPTS`、`CICSIC_REVIEW_RETRY_DELAY` 和 `CICSIC_REVIEW_OUTBOX_DIR` 配置异步重试与本地复核待办留存。每次有新检测上报时，上报器会先恢复最多 5 条本地待办；也可在检测循环中调用 `CicsicReviewNotifier.retry_retained()` 批量恢复，并通过 `outbox_status()` 读取待办数量和最近留存时间。派单同时记录在线状态、责任范围、实时距离、在办任务量以及操作位置、状态变化和证据索引。

两套服务本地对接顺序：

```powershell
cd D:\CICSIC
npm run server:dev
npm run dashboard:dev

cd D:\CICSIC
npm run server:dev
```

外部检测端如果要接入本仓库，默认把结果推送到 `http://127.0.0.1:8010/api/security-ai/yolo-reviews`。需要关闭时设置 `$env:CICSIC_REVIEW_ENABLED="false"`；需要改地址时设置 `$env:CICSIC_REVIEW_URL="http://你的后端/api/security-ai/yolo-reviews"`。

验证命令：

```powershell
npm run server:verify:security-video-ai
npm run server:verify:security-detection
python scripts/verify_patent_closure.py
npm run dashboard:build
```

## 小程序页面说明

### 登录页

文件：

```text
apps/miniprogram/src/pages/index/index.tsx
apps/miniprogram/src/pages/index/index.scss
```

登录页采用微信授权页风格：白底卡片、微信绿色主按钮、服务记录说明、巡防人员登录次入口、语言选择和隐私说明。

### 主功能页

文件：

```text
apps/miniprogram/src/pages/main/main.tsx
apps/miniprogram/src/pages/main/main.scss
```

主功能页包含群众端和巡防人员端。群众端底部导航为：首页、上报、求助、进度、我的。巡防人员端通过登录入口进入任务、地图、台账、我的。

支持通过参数直达指定 tab，例如：

```text
pages/main/main?mode=visitor&tab=help
pages/main/main?mode=visitor&tab=report
pages/main/main?mode=visitor&tab=progress
```

这可以用于二维码、分享卡片或特定场景入口。

### 详情页

文件：

```text
apps/miniprogram/src/pages/detail/detail.tsx
apps/miniprogram/src/pages/detail/detail.scss
```

详情页承载联动点、智防网格、夜市提醒、隐私说明、关于信息、群众事件详情和巡防人员工单详情。

## 开发注意事项

- 小程序端不要保存微信 AppSecret。
- 本地登录失败时，优先检查后端是否启动，以及微信开发者工具是否关闭合法域名校验。
- 求助功能不能替代 110 / 120，页面文案应始终保持“报警和急救优先”。
- 首页定位为烟火哨兵轻量入口，不应把紧急求助放成首页唯一主入口。
- `server/data/*.db` 是本地运行数据，不提交。
- `apps/miniprogram/dist-alipay` 是支付宝端构建产物，当前仓库已包含，用于交付预览。
- 若修改 Taro 源码，建议同时跑微信端和支付宝端构建。

## 验证清单

提交前建议运行：

```powershell
npm run miniprogram:build:weapp
npm run miniprogram:build:alipay
npm run dashboard:build
```

后端可用以下方式验证：

```powershell
npm run server:dev
```

然后访问：

```text
http://127.0.0.1:8010/api/health
http://127.0.0.1:8010/docs
```

## 部署提示

### 小程序

1. 配置真实 AppID。
2. 配置生产 `TARO_APP_API_BASE_URL`。
3. 后端必须使用 HTTPS。
4. 在微信公众平台配置 request 合法域名。
5. 使用微信开发者工具上传审核。

### 后端

1. 配置 `WECHAT_APPID` 和 `WECHAT_APP_SECRET`。
2. 配置 PostgreSQL `DATABASE_URL`。
3. 配置 CORS 白名单。
4. 接入日志、异常监控和备份。
5. 将开发测试登录限制在非生产环境。

### Web 后台

1. 配置生产 API 地址。
2. 执行 `npm run dashboard:build`。
3. 将 `apps/dashboard/dist` 部署到静态站点或 Web 服务。

## 相关文档

- `server/README.md`：后端接口和微信登录配置。
- `docs/烟火哨兵交付说明.md`：交付范围、现场验收、部署准备和一键验收命令。
- `docs/烟火哨兵项目实现文档.md`：早期夜市版本实现说明，作为历史参考。
- `docs/小程序Figma改版实施说明.md`：小程序视觉改版说明。

## 当前状态

当前仓库已经包含可运行的烟火哨兵原型链路：微信登录入口、群众端求助与上报、巡防人员任务处置、Web 指挥后台展示、FastAPI 事件接口和可切换的真实数据库连接层。后续重点可以放在真实地图数据、真实人员账号、消息通知、WebSocket 实时推送和权限体系。
