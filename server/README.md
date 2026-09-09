# 小安智能预警系统后端

本目录为小安智能预警系统 FastAPI 后端服务。

启动方式：

```powershell
npm run server:dev
```

默认监听：`http://127.0.0.1:8010`

首次完整安装请按照仓库根目录的 `README.md` 使用 Windows 原生部署。
下文用于原生 Python 开发或已有服务器维护，地址与密码必须由部署者自行配置，
不应连接原开发电脑或历史临时隧道。

## 数据库配置

后端通过 SQLAlchemy 连接 PostgreSQL。本机开发和服务器部署都需要配置 `DATABASE_URL`：

```powershell
$env:DATABASE_URL="postgresql://yanhuo:你的密码@数据库地址:5432/yanhuo_shaobing"
npm run server:dev
```

服务启动时会自动创建这些业务表：

- `safety_events`：求助、上报、线索登记等事件工单
- `alarm_pushes`：一键报警推送到指挥中心的确认记录
- `event_audit_logs`：派单、接收、到达、处理、完成等流转记录
- `security_detections`：YOLO/视频检测结果与证据索引
- `markets` / `zones`：多夜市和巡查区域配置
- `devices`：摄像头、机器狗、热成像和无人机设备源
- `risk_records`：按风险类型、时间窗口和夜市关联生成的联防风险
- `drone_tasks`：无人机任务下发、视频索引和执行回执
- `wechat_users`：小程序微信登录态、openid、token
- `platform_settings`：后台可调的平台治理开关、公众写入限流和证据上传阈值
- `service_access_keys`：外部设备与检测源调用后端的服务密钥摘要、权限和状态
- `system_audit_logs`：后台配置、密钥、Agent、Skill、资源变更的系统审计记录

## 真实事件接口

小程序、巡防人员端和 Web 后台共用同一组事件接口。只要它们指向同一个后端地址，就会读写同一个数据库：

```text
POST   /api/auth/wechat-login
GET    /api/events
GET    /api/events/overview
GET    /api/events/alarm-pushes
GET    /api/security-video/status
GET    /api/security-video/cameras
GET    /api/security-video/feed?cam=cam-001
GET    /api/security-ai/status
POST   /api/security-ai/judgements
POST   /api/security-ai/yolo-reviews
POST   /api/events/help
POST   /api/events/reports
POST   /api/events/lost-claims
POST   /api/events/evidence
GET    /api/events/evidence/{filename}
GET    /api/security-linkage/overview
POST   /api/security-linkage/observations
POST   /api/security-linkage/drone-tasks
PATCH  /api/security-linkage/drone-tasks/{task_id}/receipt
POST   /api/events/{event_id}/vision-review
PATCH  /api/events/{event_id}/status
PATCH  /api/events/{event_id}/assign
PATCH  /api/events/{event_id}/supplement
PATCH  /api/events/alarm-pushes/{push_id}/acknowledge
```

## 平台治理接口

后台管理页会读取和保存平台治理配置，相关接口如下：

```text
GET    /api/health/ready
GET    /api/admin/runtime-status
GET    /api/admin/platform-settings
PUT    /api/admin/platform-settings
GET    /api/admin/access-keys
POST   /api/admin/access-keys
PATCH  /api/admin/access-keys/{key_id}
GET    /api/admin/system-audit-logs
```

### 管理员 Token 初始化

生产环境和未声明 `APP_ENV` 的环境默认强制开启后台鉴权，不能通过治理接口关闭。首次部署时，在仅管理员可读的部署环境文件（例如 systemd 单元引用的 `/etc/cicsic-api.env`）中初始化至少 16 位的高熵 Token：

```text
APP_ENV=production
CICSIC_ADMIN_TOKEN=<由密码管理器生成的高熵随机值>
```

如部署负责人明确要求保留 4 至 15 位短令牌，需在同一私有环境文件中显式设置 `CICSIC_ALLOW_SHORT_ADMIN_TOKEN=true`，并重启 API。该兼容开关不关闭鉴权；未设置时仍要求至少 16 位。短令牌容易被猜中，不建议用于公网环境。

环境文件权限应限制为服务账户可读，修改后重启 API 服务。管理请求通过 `X-Admin-Token` 请求头携带 Token；服务不会把 Token 写入响应、审计记录或启动日志。若生产环境尚未配置有效 Token，服务仍可提供非管理接口，但所有受保护的后台接口保持 `401` 锁定；补充环境变量并重启即可完成初始化。

本机开发或自动化测试如需匿名管理接口，必须同时显式声明非生产环境和关闭开关，并只监听回环地址：

```powershell
$env:APP_ENV="development"
$env:CICSIC_ADMIN_AUTH_ENABLED="false"
.\server\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir server --host 127.0.0.1 --port 8010
```

共享开发机、联调环境和任何对外监听环境仍应配置 `CICSIC_ADMIN_TOKEN`，不得使用匿名模式。

只读数据库管理页 `/api/db-admin` 还需要额外配置独立的 Basic 凭据；它同时校验 `X-Admin-Token`，没有默认账号或默认口令：

```text
DB_ADMIN_USER=<受控管理员账号>
DB_ADMIN_PASSWORD=<至少 16 位的高熵随机值>
```

`platform-settings` 中的 `sourceAuthEnabled` 打开后，外部设备观测和 YOLO 复核上报需要在请求头携带：

```text
X-Service-Key: cicsic_xxx
```

该密钥由后台管理页创建，只在创建成功时返回一次完整值，数据库内只保存哈希摘要。公众求助、上报、失物线索和证据上传会读取 `publicWriteRateLimitPerMinute` 与 `evidenceUploadLimitMb` 作为运行阈值。每次后台配置、密钥、资源、Agent 和 Skill 变更都会写入 `system_audit_logs`。

实时通道：

```text
ws://127.0.0.1:8010/api/events/realtime
```

## 视频检测与画面复核

后端会把本地视频检测结果先入库到 `security_detections`，再把“人员聚集、打架、跌倒、离岗”等结果转成小安智能预警系统事件工单，并生成指挥中心报警推送。视频服务负责初筛和关键帧来源；复核服务再对关键帧看一遍。

项目内默认检测文件：

```text
server/models/yolov8n-pose.pt
```

默认读取目录：

```text
server/security-data
```

同步接口：

```text
POST /api/events/security-detections/sync
```

视频与复核接口：

```text
GET  /api/security-video/status
GET  /api/security-video/cameras
GET  /api/security-video/feed?cam=cam-001
GET  /api/security-ai/status
POST /api/security-ai/judgements
POST /api/security-ai/yolo-reviews
POST /api/events/{event_id}/vision-review
```

配置项：

```powershell
$env:SECURITY_DETECTION_DATA_DIRS="D:\CICSIC\server\security-data"
$env:SECURITY_MODEL_PATH="D:\CICSIC\server\models\yolov8n-pose.pt"
$env:SECURITY_VIDEO_BASE_URL="http://127.0.0.1:5000"
$env:SECURITY_VLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:SECURITY_VLM_API_KEY="<your key>"
$env:SECURITY_VLM_MODEL="qwen-vl-plus"
```

也可以在 `server/.env.local` 写入同名配置，服务启动时会自动读取。该文件已被忽略，不会提交到仓库。

`POST /api/security-ai/judgements` 返回结构化复核结果。`POST /api/security-ai/yolo-reviews` 读取数据库里的最新检测和截图，调用复核服务，并通过 `POST /api/events/{event_id}/vision-review` 的同一写回逻辑把结果写入事件 `meta.visionReview`、风险等级和派单优先级。相同 `eventKey` 的检测会归并到同一事件。

视频检测侧配置变量：

```powershell
$env:CICSIC_REVIEW_ENABLED="true"
$env:CICSIC_REVIEW_URL="http://127.0.0.1:8010/api/security-ai/yolo-reviews"
$env:CICSIC_REVIEW_MAX_ATTEMPTS="3"
$env:CICSIC_REVIEW_RETRY_DELAY="0.5"
$env:CICSIC_REVIEW_OUTBOX_DIR="D:\CICSIC\server\security-data\review-outbox"
```

视频检测服务仍独立读取摄像头并运行初筛，只通过上述接口把结果和证据帧送进 CICSIC 数据库；CICSIC 接收后调用复核服务。上报器使用有限次数的异步重试，并在新检测上报前自动恢复最多 5 条本地复核待办；检测端也可调用 `CicsicReviewNotifier.retry_retained()` 批量恢复，或通过 `outbox_status()` 读取待办数量和最近留存时间。派单会综合在线状态、责任范围、实时距离和在办任务量；每次创建、复核、派单和状态更新都保留结构化审计信息与证据索引。

本仓库还内置了 `server/app/services/yolo_bridge.py`，它提供与外部检测端同形态的上报模板，方便后续把新的检测源直接接到 CICSIC。

## 统一设备接入与联防

统一观测接口接收 `camera`、`robot_dog`、`thermal` 和 `drone` 四类设备源。每次观测至少可以带上 `deviceId`、`deviceType`、`marketId`、`zoneId`、`location`、`timestamp`、`riskType`、`thermalScore`、`behaviorScore`、`crowdScore`、`confidence` 和 `evidence`。

观测会复用现有 `security_detections` 和 `safety_events` 主链，补写标准化 `meta.context`，再生成 `risk_records`。同类风险会在 30 分钟窗口内按市场、区域、来源和信号分数聚合；跨夜市且达到阈值时标记为 `联防预警`，并在 `/api/events/overview` 的 `linkage` 字段和 Web 指挥前端中展示。

无人机任务接口保留任务区域、航点、优先级、喊话文本、视频地址和设备状态字段。真实飞控平台接入时，只需在该接口后增加设备适配器，任务回执仍回写到同一张 `drone_tasks` 表。

## 微信登录配置

小程序前端只调用 `wx.login` 获取一次性 `code`，再交给后端 `/api/auth/wechat-login` 换取登录态。后端读取：

```powershell
$env:WECHAT_APPID="你的微信小程序 AppID"
$env:WECHAT_APP_SECRET="你的微信小程序 AppSecret"
```

开发测试如需临时会话，必须同时设置 `APP_ENV=development`；上线前必须配置真实 `AppSecret`。
