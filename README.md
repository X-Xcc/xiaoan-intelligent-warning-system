# 烟火哨兵

烟火哨兵是一套面向夜市商圈、文旅街区和商业综合体周边夜间消费场景的安全治理系统原型，包含 FastAPI 后端、React Web 指挥后台、Taro 微信/支付宝小程序、PostgreSQL 数据库和可选的 Go2 视频桥接。

本仓库只保留可部署源码、必要资源、依赖清单和部署模板，不包含本机虚拟环境、数据库、环境变量、浏览器缓存、构建缓存、报告和临时导出物。

## 目录

```text
apps/dashboard        React + Vite Web 指挥后台
apps/miniprogram      Taro 微信/支付宝小程序源码
server/app            FastAPI 后端
server/models         本地检测模型
deploy/production     systemd、Nginx 和环境变量模板
tools                 可选设备接入工具
scripts/dev_server.py 本地后端启动入口
package.json          npm workspaces 和统一命令
```

系统链路：

```text
小程序 / Web -> FastAPI :8010 -> PostgreSQL
```

## 环境要求

推荐环境：

- Windows 10/11 或 Linux
- Node.js 22.x
- npm 10.x
- Python 3.11+
- PostgreSQL 14+
- Git
- 微信开发者工具（仅小程序开发需要）
- Nginx、systemd（仅 Linux 生产部署需要）

检查版本：

```powershell
node --version
npm --version
python --version
psql --version
```

## 获取代码

```powershell
git clone https://github.com/X-Xcc/jiangtan-zhifang.git
cd jiangtan-zhifang
```

如果需要当前部署分支：

```powershell
git checkout codex/checkpoint-rollback-20260826
```

## 安装依赖

Node 依赖：

```powershell
npm install
```

Windows Python 依赖：

```powershell
python -m venv server\.venv
server\.venv\Scripts\python.exe -m pip install --upgrade pip
server\.venv\Scripts\python.exe -m pip install -r server\requirements.txt
```

Linux Python 依赖：

```bash
python3 -m venv server/.venv
server/.venv/bin/python -m pip install --upgrade pip
server/.venv/bin/python -m pip install -r server/requirements.txt
```

## 配置环境变量

不要把真实密码、微信 AppSecret、API Key 或管理员 Token 写入 Git。

开发环境可使用：

```powershell
$env:APP_ENV="development"
$env:DATABASE_URL="postgresql://cicsic:密码@127.0.0.1:5432/yanhuo_shaobing"
$env:CICSIC_ADMIN_AUTH_ENABLED="false"
```

也可以创建 `server/.env.local`，该文件已被 `.gitignore` 忽略。

生产环境至少需要：

```text
APP_ENV=production
DATABASE_URL=postgresql://用户名:密码@数据库地址:5432/yanhuo_shaobing
CICSIC_ADMIN_TOKEN=随机生成的高熵 Token
DB_ADMIN_USER=受控管理员账号
DB_ADMIN_PASSWORD=随机生成的高熵密码
```

环境变量模板：

```text
deploy/production/cicsic-api.env.example
```

微信登录还需要：

```text
WECHAT_APPID=微信小程序 AppID
WECHAT_APP_SECRET=微信小程序 AppSecret
```

`WECHAT_APP_SECRET` 只能放在后端环境，不能放入小程序前端。

## 初始化数据库

```sql
CREATE USER cicsic WITH PASSWORD '请替换为高熵密码';
CREATE DATABASE yanhuo_shaobing OWNER cicsic;
```

后端启动时会自动初始化业务表，主要包括：

- `safety_events`：求助、上报和工单事件。
- `alarm_pushes`：报警推送确认记录。
- `event_audit_logs`：事件流转审计。
- `security_detections`：视频检测和证据索引。
- `wechat_users`：微信登录态。
- `markets`、`zones`、`devices`：夜市、区域和设备。
- `system_audit_logs`：后台配置和权限变更审计。

## 启动后端

Windows：

```powershell
server\.venv\Scripts\python.exe scripts\dev_server.py
```

或：

```powershell
npm run server:dev
```

Linux：

```bash
server/.venv/bin/python scripts/dev_server.py
```

默认地址：

```text
http://127.0.0.1:8010
```

健康检查：

```powershell
Invoke-WebRequest http://127.0.0.1:8010/api/health
```

接口文档：

```text
http://127.0.0.1:8010/docs
```

## 启动 Web 后台

开发模式：

```powershell
npm run dashboard:dev
```

默认地址：

```text
http://127.0.0.1:5173
```

生产构建：

```powershell
npm run dashboard:build
```

构建输出：

```text
apps/dashboard/dist
```

前后端不在同一台电脑时，在 `apps/dashboard/.env.local` 配置：

```text
VITE_API_BASE_URL=http://后端地址:8010/api
```

生产环境建议用 Nginx 反向代理，让 Web 和 API 共用一个 HTTPS 域名。

## 构建小程序

微信小程序：

```powershell
npm run miniprogram:build:weapp
```

支付宝小程序：

```powershell
npm run miniprogram:build:alipay
```

微信开发者工具使用：

```text
apps/miniprogram/dist
```

本地调试可关闭合法域名校验。生产环境必须配置 HTTPS API、request 合法域名和真实 AppID，然后重新构建上传。

## Linux 生产部署

部署模板位于：

```text
deploy/production/cicsic-api.service
deploy/production/cicsic-nginx.conf
deploy/production/public-security-web-api.service
deploy/production/public-security-web-nginx.conf
```

典型流程：

```bash
git clone https://github.com/X-Xcc/jiangtan-zhifang.git /opt/cicsic
cd /opt/cicsic
npm install
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt
npm run dashboard:build
```

然后：

1. 将生产变量写入 `/etc/cicsic-api.env`，并限制文件权限。
2. 修改 systemd 模板中的项目路径和 Python 路径。
3. 修改 Nginx 模板中的域名、静态目录和 API 代理路径。
4. 启用并重启 API、Web 服务。
5. 检查 `/api/health`、Web 首页和 `/docs`。
6. 配置 HTTPS、防火墙、数据库备份和日志轮转。

生产环境不要使用 `CICSIC_ADMIN_AUTH_ENABLED=false`，必须配置高熵 `CICSIC_ADMIN_TOKEN`。

## 可选 Go2 视频桥接

Go2 桥接不是系统启动必需项，只接收视频，不发送机器狗控制指令：

```powershell
$env:GO2_IP="机器狗 IP"
server\.venv\Scripts\python.exe -m pip install "go2-webrtc-connect[video]"
server\.venv\Scripts\python.exe tools\go2_video_bridge.py
```

详细说明：

```text
tools/README-go2-video.md
```

没有 Go2 时，Web 后台使用离线状态和演示回退画面。

## 视频检测和 AI 复核

可选配置：

```text
SECURITY_MODEL_PATH=server/models/yolov8n-pose.pt
SECURITY_DETECTION_DATA_DIRS=server/security-data
SECURITY_VIDEO_BASE_URL=http://127.0.0.1:5000
SECURITY_VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
SECURITY_VLM_API_KEY=你的密钥
SECURITY_VLM_MODEL=qwen-vl-plus
```

主要接口：

```text
GET  /api/security-video/status
GET  /api/security-video/cameras
GET  /api/security-video/feed?cam=cam-001
GET  /api/security-ai/status
POST /api/security-ai/judgements
POST /api/security-ai/yolo-reviews
POST /api/events/security-detections/sync
```

未配置云端复核密钥时，本地演示和检测数据链路仍可运行。

## 常用命令

```powershell
npm run server:dev
npm run dashboard:dev
npm run dashboard:build
npm run miniprogram:build:weapp
npm run miniprogram:build:alipay
```

验证：

```powershell
npm run dashboard:build
npm --workspace apps/miniprogram run typecheck
server\.venv\Scripts\python.exe -m pytest server\tests
server\.venv\Scripts\python.exe -m pytest tools\tests
```

## 常见问题

### Web 页面打不开

先确认：

```text
http://127.0.0.1:8010/api/health
```

### 数据库连接失败

检查 PostgreSQL 服务、数据库名称、用户名、密码和 `DATABASE_URL`。

### 小程序请求失败

开发时检查合法域名校验；生产时检查 HTTPS、request 合法域名和 API 地址。

### 管理接口返回 401

生产请求需要携带：

```text
X-Admin-Token: 你的 CICSIC_ADMIN_TOKEN
```

### 构建缺少依赖

删除本机 `node_modules` 后重新执行 `npm install`，不要把 `node_modules` 上传到 GitHub。

## 数据和安全边界

- `.env`、数据库、日志、缓存和本地运行目录不会提交。
- 管理员 Token、数据库密码、微信 AppSecret 和云端 API Key 必须通过部署环境注入。
- 小程序前端不能保存后端密钥。
- 演示图片、语音和地图素材用于原型展示，不代表真实监控证据。
- 紧急求助页面不能替代 110、120 等正式报警和急救渠道。

## 第三方资源

地图底图包含 OpenStreetMap 归属信息。Node 依赖、Python 依赖和许可证分别由 `package-lock.json`、workspace `package.json` 和 `server/requirements.txt` 管理。
