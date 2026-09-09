# 小安智能预警系统

本仓库提供**完整本机部署**所需的网页后台、FastAPI 后端、PostgreSQL 数据库配置、设备视频桥接源码、运行资源和启动脚本。不是只有页面的展示包。

**第一次使用，按下面 5 步操作。只需要安装 Docker Desktop，不用自己安装 Python、Node.js 或数据库。**

摄像头、微信账号和 AI 服务密钥不是打开系统的前提。没有设备时，视频显示未接入；演示数据不代表真实业务或真实监控。小程序发布、真实设备和外网访问见后面的可选章节。

## 第 1 步：安装 Docker Desktop

Docker 可以把系统需要的软件一起运行，你不需要分别配置它们。

1. 准备一台支持 Docker Desktop 的 Windows 电脑。本教程面向普通 Intel/AMD 64 位电脑，建议至少 8 GB 内存、20 GB 空闲空间，首次安装需要联网。
2. 打开 [Docker Desktop Windows 安装说明](https://docs.docker.com/desktop/setup/install/windows-install/)，按页面的当前系统要求下载 Windows 安装包。ARM 电脑不要下载 x86_64 安装包。
3. 运行安装包，保留使用 WSL 2 的默认选项。如果安装程序要求重启电脑，先重启。
4. 从开始菜单打开 **Docker Desktop**，等待它显示引擎已经运行，再继续下一步。保持 Linux containers 模式。

如果提示需要更新 WSL，打开开始菜单，搜索 PowerShell，右键“以管理员身份运行”，输入：

```powershell
wsl --update
```

按提示重启电脑，再打开 Docker Desktop。如果提示系统没有开启虚拟化，需要按电脑厂商说明启用；这不是项目代码报错。

Docker Desktop 的使用许可由 Docker 提供，企业使用前请确认适用条款。

## 第 2 步：下载并解压项目

仓库地址：[小安智能预警系统](https://github.com/X-Xcc/xiaoan-intelligent-warning-system)。

**仓库目前是私有仓库。** 接收方需要先登录已被邀请的 GitHub 账号；未获授权时看到 404 不代表地址失效。也可以由仓库所有者下载 ZIP 后私下交付，不必把仓库改成公开。

1. 打开上面的仓库，确认左上角分支是 **`main`**。
2. 点击绿色 **Code** 按钮，再点击 **Download ZIP**。
3. 找到下载的 ZIP 文件，右键选择“全部解压缩”。
4. 打开解压后的文件夹，找到 **`start.cmd`**。

**一定要先解压，不能在压缩包里直接双击运行。** 文件夹里应该同时有 `README.md`、`compose.yaml`、`start.cmd`、`apps`、`server` 和 `deploy`。

熟悉 Git 的人也可以用：

```powershell
git clone --branch main https://github.com/X-Xcc/xiaoan-intelligent-warning-system.git
```

## 第 3 步：双击 start.cmd

确认 Docker Desktop 已运行，然后双击项目文件夹里的 **`start.cmd`**。

它会自动完成：

- 生成这台部署独有的数据库密码和管理令牌。
- 下载运行环境，安装网页与后端依赖。
- 构建网页，启动数据库、后端和网页服务。
- 等待数据库、API 和网页代理的健康检查通过。

首次需要下载较多内容，请耐心等待。出现下载进度或英文日志是正常的，不要连续双击多次。

**成功标志：** 窗口最后显示：

```text
READY: http://127.0.0.1:8080
```

只有显示 `READY` 才表示启动检查通过。如果显示 `Startup failed`，先看下方“遇到问题怎么办”，不要继续反复安装。

后端设备管理只运行一个进程，避免多进程争用视频桥接配置。数据库和 API 不直接开放宿主机端口；默认只有本机可以访问网页。

## 第 4 步：打开系统

打开 Edge 或 Chrome，把下面的地址输入浏览器顶部地址栏，按回车：

```text
http://127.0.0.1:8080
```

不要输入到百度等搜索框。

再打开这个地址，检查后端和数据库：

```text
http://127.0.0.1:8080/api/health/ready
```

返回内容中应同时包含顶层 `"status":"ready"` 和数据库的 `"status":"ready"`、`"engine":"postgresql"`。看到网页本身，不等于数据库已经正常。

**启动成功后可以关闭黑色命令窗口，但不要退出 Docker Desktop。** 服务在后台运行，不需要一直开着 PowerShell。

## 第 5 步：进入管理页面

系统默认开启管理鉴权，没有统一的默认密码。

1. 在项目文件夹中打开 `deploy` 文件夹。
2. 用记事本打开里面的 **`.env`** 文件。它是在第 3 步生成的；若没有生成，说明启动步骤未完成。
3. 找到 `CICSIC_ADMIN_TOKEN=` 这一行，复制等号后面的整段内容，不包含等号和换行。
4. 打开管理页，把它粘贴到“管理令牌”框，点击“验证”：

```text
http://127.0.0.1:8080/admin
```

设备管理使用同一个令牌，进入后也需要验证：

```text
http://127.0.0.1:8080/admin/bridges
```

**`deploy/.env` 里面有密码，不要上传 GitHub、不要发到群里、不要截图给别人。** 管理令牌只用于管理授权，不等于微信登录或处警人员账号。刷新管理页面后可能需要重新输入。

## 以后怎么开、怎么关？

**下次打开：** 先打开 Docker Desktop，再双击同一个项目文件夹里的 `start.cmd`，然后访问 `http://127.0.0.1:8080`。已有密码和数据会继续使用，不会重新生成。

**停止系统：**

1. 在项目文件夹的空白处右键，选择“在终端中打开”，使用 PowerShell。
2. 输入下面这一行，按回车：

```powershell
docker compose --env-file deploy/.env stop
```

这只停止服务，不删除数据。再次启动仍然双击 `start.cmd`。

不要运行带 **`down -v`** 的命令，也不要在 Docker Desktop 中删除本项目的数据卷；那会删除数据库和持久文件。不要把 `deploy/.env` 删掉“重新生成”，旧数据库仍使用原来的密码。

## 遇到问题怎么办？

| 看到的问题 | 怎么处理 |
| --- | --- |
| GitHub 页面是 404 | 确认登录了被邀请的账号，并接受仓库邀请；或请所有者交付 ZIP。 |
| 找不到 `start.cmd` | 确认下载的是 `main`，已经全部解压，且打开的是含 `compose.yaml` 的那一层文件夹。 |
| `Docker was not found` | 安装 Docker Desktop，打开一次；关闭当前命令窗口，再双击 `start.cmd`。 |
| `Docker is not running` | 打开 Docker Desktop，等引擎启动。 |
| 下载超时、连接失败、TLS 报错 | 检查网络及 Docker Desktop 的代理设置。首次需访问镜像仓库、npm、PyPI 和系统软件源；网络恢复后再次运行，不要关闭证书校验。 |
| 端口 `8080` 已被占用 | 用记事本打开 `deploy/.env`，只把 `WEB_PORT=8080` 改成 `WEB_PORT=8088`，保存后重新运行。以后打开 `http://127.0.0.1:8088`。密码两行不要改。 |
| `Configuration failed` | 检查 `deploy/.env` 是否被错误修改。不要删除它；从自己的备份恢复原文件。配置检测不通过时，脚本不会覆盖已有密码。 |
| 网页打不开 | 检查 Docker Desktop 是否仍在运行、启动窗口是否出现 `READY`，以及自己是否改过端口。 |
| 管理接口返回 `401` | 重新复制 `CICSIC_ADMIN_TOKEN=` 后面的完整内容；不要复制数据库密码，不要关闭鉴权。 |
| 视频没有画面 | 默认没有连接你的设备。在设备管理中添加实际设备并测试；不能把无设备状态当成部署失败。 |
| Windows 提示内存或磁盘不足 | 为 Docker 分配足够资源并释放磁盘空间，再重新启动。 |

需要查看运行状态时，在项目文件夹打开 PowerShell，执行：

```powershell
docker compose --env-file deploy/.env ps
docker compose --env-file deploy/.env logs --tail=80 api
```

应有 `db`、`api`、`web` 三个服务。提供错误信息时，先遮住令牌、密码、设备地址和个人信息。不要提供 `docker compose config` 或 `docker inspect` 的完整输出，它们可能包含密码。

## 换一台电脑、备份和更新

**另一台电脑独立安装：** 按上面的 5 步重新操作即可。新安装会创建独立数据库，不会自动带上原电脑的数据。

**让别的电脑访问这一台：** 这是联网部署，不是独立安装。`127.0.0.1` 只指当前电脑，把这个地址发给别人是打不开的。不要为了访问方便就把开发或管理接口直接暴露到公网。

持久数据在 Docker 的数据卷中，不在 GitHub：

| 默认数据卷 | 保存什么 |
| --- | --- |
| `xiaoan_database` | PostgreSQL 业务数据 |
| `xiaoan_evidence` | 上传的证据与业务文件 |
| `xiaoan_bridge-secrets` | 加密设备配置及其解密密钥，必须一起备份 |
| `xiaoan_detection-data` | 外部检测结果 |

还要单独备份项目中的 `deploy/.env`。保留代码或下载 ZIP **不等于备份业务数据**。跨电脑迁移应先停写，使用 PostgreSQL 的 `pg_dump` / `pg_restore` 备份恢复数据库，并备份恢复上述文件卷；不要复制正在运行的 PostgreSQL 数据目录。

Git 安装方式更新前先备份。在原项目目录运行：

```powershell
git pull --ff-only
```

成功后双击 `start.cmd`。ZIP 安装方式需要在备份后更新源码并保留原来的 `deploy/.env` 和数据卷；不要同时启动新旧两份。涉及数据库结构变化时，应先查看对应版本的迁移说明。

## 可选：小程序、设备和 AI

### 微信/支付宝小程序

小程序源码位于 `apps/miniprogram`。Docker 默认部署电脑网页后台和 API，不会替你注册小程序或上传微信/支付宝平台。

需要：自己的平台账号、AppID、开发者工具，以及指向这套 API 的固定 HTTPS 域名。后端微信登录还要配置私有的 `WECHAT_APPID` 和 `WECHAT_APP_SECRET`，不能把 AppSecret 写入前端。

将后端变量以 `变量名=值` 的形式追加到私有的 `deploy/.env`，然后重新运行 `start.cmd`。不要改动原有数据库密码。

在另外安装 Node.js 22.13+ 后，从项目根目录运行以下命令。把示例域名改成自己实际部署的域名：

```powershell
npm.cmd ci
$env:TARO_APP_API_BASE_URL="https://你的域名/api"
npm.cmd --workspace apps/miniprogram run build:weapp:release
```

微信开发者工具导入 `apps/miniprogram/dist`。支付宝构建命令为：

```powershell
npm.cmd --workspace apps/miniprogram run build:alipay:release
```

支付宝输出目录是 `apps/miniprogram/dist-alipay`。缺少可用的生产 API 地址时，发布构建会拒绝继续，避免误连旧服务器。真实平台登录、真机访问和发布审核需要部署者用自己的账号验收。

### 摄像头与 Go2

设备桥接包含 RTSP、HTTP 快照/MJPEG、Go2 和本机 USB 的相关源码。容器里带视频解码所需依赖，但**有依赖不代表设备已接通**。

- RTSP/HTTP 设备：在 `/admin/bridges` 填写你的地址、账号和视频路径，先测试，再启动和绑定视频槽位。
- 容器里的 `127.0.0.1` 指容器自己。访问 Windows 主机上的视频服务时，Docker Desktop 通常使用 `host.docker.internal`；访问局域网设备使用设备实际地址。
- Go2：还需设备网络可达；WebRTC/UDP 在 Docker Desktop 下可能需要额外网络配置。
- USB：默认容器没有接入 Windows USB 摄像头，需要设备透传或原生 Python 运行方式，不能直接照搬本机设备编号。

这些设备能力必须使用实际硬件单独验收，不会自动复制原电脑的设备账号。

### AI 复核与外网部署

云端 AI 复核需要自己的服务密钥；外部 YOLO 检测服务也需要另行接入。模型文件和 API 源码已经包含在仓库中，但默认启动不代表已有真实 AI 识别或告警。

可在私有 `deploy/.env` 追加 `SECURITY_VLM_API_KEY`、`SECURITY_VLM_BASE_URL`、`SECURITY_VLM_MODEL` 或 `SECURITY_VIDEO_BASE_URL`，然后重新启动。这些变量会传给 API 容器，不会打包到网页。不要在网页中填写服务密钥。

本教程以**本机完整运行**为验收范围，不是公网安全认证。对外提供服务前还需要 HTTPS、访问控制、防火墙、依赖安全更新、日志与备份策略，以及真实业务权限审查。不要直接把 `WEB_BIND` 改为对外地址就投入生产。

## Linux 部署

安装 Docker Engine、Compose v2 和 Python 3 后，在项目根目录运行：

```bash
python3 deploy/configure.py
docker compose --env-file deploy/.env up -d --build --wait --wait-timeout 180
```

然后在部署机器上访问 `http://127.0.0.1:8080`。远程服务器需由部署人员另行配置 HTTPS 与受控访问。Windows 启动脚本与这里使用同一份 `compose.yaml`，不是两套不同的系统。

## 仓库内容与验收

| 路径 | 用途 |
| --- | --- |
| `start.cmd`、`deploy/start.ps1` | Windows 启动入口 |
| `compose.yaml`、`deploy/docker` | 网页、API、数据库的一体化部署 |
| `deploy/configure.py` | 为每次新安装生成独立密码，重启时保留原密码 |
| `apps/dashboard` | 网页源码、页面与资源 |
| `apps/miniprogram` | 小程序源码、构建配置与测试 |
| `server/app` | 后端、数据库模型、业务接口与完整设备桥接模块 |
| `server/models` | 模型资源 |
| `package-lock.json`、`server/requirements.txt`、`server/requirements-deploy.lock` | 依赖清单及经过验证的 Linux 容器依赖版本 |
| `deploy/verify.py` | 针对隔离测试部署的真实读写及重建后持久化验收 |
| `server/tests`、`deploy/tests` | 后端与部署测试 |

依赖、编译输出、数据库、密码、日志和本机缓存不上传 GitHub，也不会复制进部署镜像。它们会在接收方电脑上重新安装或生成。

`deploy/verify.py` 会写入明确标注的合成测试记录，只能用于隔离测试实例，不能随意对现有业务库运行。健康检查、真实数据库读写和容器重建后的持久化，需要分别通过，不能只用“网页编译成功”代替。

### 本次实际验证结果

2026 年 9 月 9 日，从准备提交的 Git 文件生成干净副本，在隔离的 WSL Ubuntu 24.04 / Linux Docker 环境中安装依赖、构建并启动，使用全新 PostgreSQL 数据卷，不读取原电脑的环境文件或业务数据库。

| 检查 | 结果 |
| --- | --- |
| 网页与 API 镜像构建、三个服务健康检查 | 通过 |
| PostgreSQL 事件写入、证据文件上传与读取 | 通过 |
| 加密设备配置、视频槽位、管理设置保存 | 通过 |
| 重建全部容器后，再读取上述数据 | 通过，数据保留 |
| 浏览器管理登录、错误令牌拒绝、退出、手机宽度布局 | 通过 |
| 管理配置尚未加载时禁止保存 | 通过，避免默认值覆盖已有设置 |
| Nginx 转发 WebSocket 握手与发送 | 通过 |
| 后端测试 | 176 项中 172 项通过，4 项按条件跳过 |
| 前端管理及设备接口测试、小程序测试、配置生成测试 | 分别 32、124、3 项通过 |
| 网页、微信与支付宝生产构建 | 通过，仍有包体积与 Sass 弃用警告 |

4 个跳过项包括 1 个仅适用于 Windows 的底层句柄测试，以及 3 个需要额外 FFmpeg/MediaMTX 的 RTSP 测试。HTTP 视频测试使用合成素材，不代表真实摄像头验收。Windows 启动脚本已检查语法，**尚未在另一台物理 Windows 电脑上完成双击安装验收**。真实摄像头、Go2、微信/支付宝真机登录、云端 AI 与公网访问也不在本次已通过范围内。

这些结果说明仓库具备独立构建和启动整套网页、后端及数据库的必要内容，不依赖把原电脑的缓存、密码和数据库一并上传。接收方仍需要满足系统要求，并能访问依赖下载服务。

演示素材仅用于原型展示，不代表真实监控证据；系统不能替代正式报警和急救渠道。第三方地图、模型和依赖应保留各自署名与许可信息。
