# 夜市智防

夜市智防是一套面向夜市商圈、文旅街区和商业综合体周边夜间消费场景的数智安全治理系统原型。项目提供群众端小程序、巡防人员移动端、Web 指挥后台和 FastAPI 后端，形成从风险感知、隐患上报、紧急协同、工单处置到后台态势展示的闭环。

当前版本重点不是做一个单纯展示页，而是让小程序、后台和后端真实连起来：群众或商户在小程序发起求助或上报，后端生成事件与工单，巡防人员端更新处置状态，Web 后台读取同一组事件数据展示夜市态势。

## 功能概览

### 群众端小程序

- 微信一键登录：用户点击后通过 `wx.login` 获取 code，交给后端换取 openid 和系统 token。
- 夜市智防首页：展示网格态势、客流、AI 预警、地图点位、附近联动点和夜市提醒。
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

- 态势总览：读取后端事件概览数据，展示今日事件、待处置任务、在线巡防、平均响应等指标。
- 事件工单：展示事件列表和当前状态。
- 管理入口：面向指挥展示夜市人员、智能装备、处突物资、联动预案等模块。
- 后端联动：后台和小程序共用 `/api/events` 数据链路。

### 后端服务

- FastAPI 服务，默认运行在 `http://127.0.0.1:8010`。
- SQLAlchemy 数据库层，默认使用本地 SQLite，生产建议配置 PostgreSQL。
- 事件接口覆盖求助、上报、线索登记、状态更新和补充信息。
- 微信登录接口支持真实 `code2Session`，本地未配置 AppSecret 时提供开发态会话。

## 技术栈

| 模块 | 技术 |
|---|---|
| 小程序 | Taro 4 + React 18 + TypeScript + SCSS |
| 微信端构建 | `taro build --type weapp` |
| 支付宝端构建 | `taro build --type alipay` |
| Web 后台 | React 19 + Vite + TypeScript |
| 图表与视觉 | ECharts、Three.js、React Three Fiber、Lucide Icons |
| 后端 | FastAPI + Uvicorn |
| 数据库 | SQLAlchemy + PostgreSQL / MySQL / SQLite |
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
│     │  ├─ data             静态业务配置与详情内容
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

开发期没有配置 `WECHAT_APP_SECRET` 时，后端会返回本地开发会话，便于页面和接口联调。上线前必须配置真实 AppSecret，且 AppSecret 只能放在后端，不能写进小程序前端代码。

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
| `GET` | `/events/overview` | 获取态势概览 |
| `POST` | `/events/help` | 创建群众/商户求助事件 |
| `POST` | `/events/reports` | 创建隐患上报事件 |
| `POST` | `/events/lost-claims` | 创建失物/扒窃线索登记事件 |
| `PATCH` | `/events/{event_id}/status` | 更新事件状态 |
| `PATCH` | `/events/{event_id}/supplement` | 补充事件描述 |
| `GET` | `/demo` | 后端浏览器演示页 |

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

后端通过 `DATABASE_URL` 连接数据库。开发期不配置时会自动使用本地 SQLite：

```text
server/data/jiangtan.db
```

该文件是本地运行数据，已在 `.gitignore` 中忽略，不应提交到仓库。首次启动后端会自动初始化数据表和示例事件。

生产或多人联调建议使用 PostgreSQL：

```powershell
$env:DATABASE_URL="postgresql://jiangtan:你的密码@数据库地址:5432/jiangtan_zhifang"
npm run server:dev
```

也支持 MySQL：

```powershell
$env:DATABASE_URL="mysql+pymysql://jiangtan:你的密码@数据库地址:3306/jiangtan_zhifang?charset=utf8mb4"
npm run server:dev
```

当前核心表：

- `safety_events`：求助、反馈、失物登记和工单流转事件。
- `event_audit_logs`：事件创建、派单、接收、到达、处理、闭环审计记录。
- `wechat_users`：微信 openid、session_key、系统 token 和登录时间。

后续可以继续补充巡防人员账号、设备、物资、预案、权限和消息通知等表。

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
- 首页定位为夜市智防轻量入口，不应把紧急求助放成首页唯一主入口。
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
2. 配置生产 `DATABASE_URL`，建议使用 PostgreSQL。
3. 配置 CORS 白名单。
4. 接入日志、异常监控和备份。
5. 将本地开发态登录兜底限制在非生产环境。

### Web 后台

1. 配置生产 API 地址。
2. 执行 `npm run dashboard:build`。
3. 将 `apps/dashboard/dist` 部署到静态站点或 Web 服务。

## 相关文档

- `server/README.md`：后端接口和微信登录配置。
- `docs/江滩智防项目实现文档.md`：早期江滩版本实现说明，作为历史参考。
- `docs/小程序Figma改版实施说明.md`：小程序视觉改版说明。

## 当前状态

当前仓库已经包含可运行的夜市智防原型链路：微信登录入口、群众端求助与上报、巡防人员任务处置、Web 指挥后台态势展示、FastAPI 事件接口和可切换的真实数据库连接层。后续重点可以放在真实地图数据、真实人员账号、消息通知、WebSocket 实时推送和权限体系。
