# 小安智能预警系统

这是一个安全预警系统原型，包含电脑网页后台、后端服务和小程序。

**第一次安装，先按照下面的“第一部分”在 Windows 电脑上打开网页。** 不需要买服务器、买域名，也不需要准备摄像头或微信小程序账号。

> **当前版本提醒（2026 年 9 月 9 日核对）**
>
> `main` 的后端引用了 `server/app/services/device_bridges.py`，但这个文件尚未提交到仓库，会阻止后端启动。因此，当前不能把本仓库称为“下载后即可完整部署”的版本。
>
> 第一部分用于预览网页。没有后端时，部分页面会显示演示数据、离线状态或请求失败，不能保存或处理真实业务。第二部分是后端安装参考，**请等缺失代码补齐并通过验证后再做，避免白白安装数据库。** 这个问题不是你的电脑操作错了。

## 第一部分：先把网页打开

以下步骤适用于 Windows 10/11 的普通 64 位电脑。建议使用 Edge 或 Chrome 浏览器。安装软件、下载代码和安装依赖时需要联网。

### 第 1 步：安装两个软件

已经安装过的可以跳过。

| 软件 | 去哪里下载 | 安装时怎么选 |
| --- | --- | --- |
| Git：用来下载项目 | [Git 官方下载页](https://git-scm.com/downloads/win) | 普通 Intel/AMD 电脑选择 x64 安装包。大部分选项保持默认；出现 PATH 选项时，保留允许命令行和第三方软件使用 Git 的选项。 |
| Node.js：用来运行网页 | [Node.js 官方下载页](https://nodejs.org/en/download) | 选择 **22.x，且不低于 22.13**，Windows、x64、`.msi` 安装包。保留 npm 和添加到 PATH 的默认选项。 |

ARM 电脑需要选择与电脑架构对应的安装包，不要照搬 x64。

安装完后，**关闭之前打开的终端窗口，再重新打开**：

1. 点击 Windows 开始菜单。
2. 搜索 `PowerShell`，打开它。后面提到的“终端”就是这个窗口，不需要以管理员身份运行。
3. 把下面三行命令逐行粘贴进去，每粘贴一行就按一次回车。

```powershell
git --version
node --version
npm.cmd --version
```

**成功标志：** 三行都能显示版本号，没有“无法识别”之类的报错。Node.js 显示的版本应符合上表要求。

后面的命令框只复制框内内容，不要复制 `PS C:\...>` 这样的终端提示符。

### 第 2 步：下载项目

继续在刚才的 PowerShell 中，逐行运行：

```powershell
cd $HOME
git clone --branch main https://github.com/X-Xcc/xiaoan-intelligent-warning-system.git
cd xiaoan-intelligent-warning-system
```

下载可能需要几分钟，等上一条命令完成，再运行下一条。

项目会放在你的 Windows 用户文件夹里，例如：

```text
C:\Users\你的用户名\xiaoan-intelligent-warning-system
```

命令中的 `$HOME` 会自动找到你的用户文件夹，不用把它改成自己的名字。

**成功标志：** 运行下面的命令，能看到 `package.json`：

```powershell
Get-Item .\package.json
```

如果提示项目文件夹已经存在，先不要删除它。以前按本教程下载过的，直接运行下面这行进入文件夹，然后继续第 3 步：

```powershell
cd "$HOME\xiaoan-intelligent-warning-system"
```

### 第 3 步：安装项目需要的依赖

“依赖”就是系统运行时需要的软件包。保持当前目录不变，运行：

```powershell
npm.cmd ci
```

这一步通常比下载代码更久。窗口持续输出内容时请耐心等待，不要关闭，也不要重复运行。

**成功标志：** 安装结束，窗口重新出现可以输入命令的提示符，没有以 `npm error` 结束。

黄色的 `warn` 或漏洞数量提示不一定代表安装失败，但也不代表已经通过安全检查。先不要执行网上的 `npm audit fix --force`，它可能改变项目需要的版本。

### 第 4 步：启动网页

在同一个窗口运行：

```powershell
npm.cmd run dashboard:dev
```

**成功标志：** 窗口出现 Vite 启动信息，以及类似下面的地址：

```text
Local: http://127.0.0.1:5177/
```

**这个窗口要一直开着。** 没有重新出现输入提示符是正常的，表示网页服务正在运行。

### 第 5 步：用浏览器打开

打开 Edge 或 Chrome，把这个地址输入浏览器顶部的地址栏，按回车：

```text
http://127.0.0.1:5177
```

不要输入到百度等搜索框里。如果终端显示的是其他端口，以终端的 `Local` 地址为准。

**看到系统页面，就完成了网页预览。** 页面里的演示画面、统计数字不等于真实设备已经接入；真实数据保存、接口调用还需要后端和数据库。

### 下次怎么打开？怎么关闭？

**以后不用重复安装，也不用重新下载项目。**

重启电脑后，打开 PowerShell，只运行这两行：

```powershell
cd "$HOME\xiaoan-intelligent-warning-system"
npm.cmd run dashboard:dev
```

再用浏览器打开终端显示的地址。

不用时，回到运行网页的终端，按键盘上的 `Ctrl+C`。如果询问是否终止，输入 `Y` 后回车，再关闭窗口。

## 第二部分：完整本机部署（当前先不要操作）

完整系统需要三个部分一起运行：

```text
网页：你在浏览器里看到的界面
  ↓
后端：处理请求和业务
  ↓
数据库：保存数据
```

**当前 `main` 存在开头说明的缺失模块问题。下面保留安装参考，不代表已经完成新电脑端到端验证。** 后续补齐源码后，还需要实际验证后端启动、数据库读写和页面业务操作。

<details>
<summary>展开后端安装参考：仅在缺失代码补齐并验证后继续</summary>

### 第 1 步：检查下载的版本

先完成第一部分。在新的 PowerShell 窗口中运行：

```powershell
cd "$HOME\xiaoan-intelligent-warning-system"
git ls-files server/app/services/device_bridges.py
```

如果没有任何文件路径输出，说明你下载的版本仍缺少这个模块，**到这里停止**。不要尝试用 `pip install device_bridges` 修复，它是项目自己的文件。

即使显示了文件路径，也只代表这个文件已提交，不代表整套系统已经验证通过，请以维护者的后续验收结果为准。

### 第 2 步：安装 Python

本项目后端依赖版本较旧，本机兼容性参考采用 **Python 3.11**，不要直接选最新版 Python。

1. 打开 [Python 3.11.9 官方页面](https://www.python.org/downloads/release/python-3119/)，在页面下方的 Files 中选择 `Windows installer (64-bit)`。
2. 打开安装包，勾选 `Add python.exe to PATH`，保留 Python Launcher 的安装选项，然后安装。
3. 安装后重新打开 PowerShell，运行：

```powershell
py -3.11 --version
```

显示 `Python 3.11.x` 后继续。这是本机兼容性参考，不是公网服务器的安全版本建议。

### 第 3 步：安装 PostgreSQL 数据库

1. 打开 [PostgreSQL Windows 官方下载页](https://www.postgresql.org/download/windows/)，进入页面提供的安装包下载入口，选择 PostgreSQL **16.x** 的 Windows 64 位安装包。
2. 安装时保留 `PostgreSQL Server`、`pgAdmin 4` 和 `Command Line Tools`。
3. 设置安装程序要求的 `postgres` 管理员密码，记在自己的密码管理器里，后面需要输入。不要发给别人。
4. 端口保留 `5432`，其他设置一般保持默认。
5. 安装结束时如有 Stack Builder 附加组件提示，可以取消，不影响本教程。

如果电脑已经安装并使用 PostgreSQL，不要重装或覆盖已有数据库，先确认已有实例的端口和管理密码。

### 第 4 步：创建系统专用数据库

1. 从开始菜单打开 `pgAdmin 4`。如果它要求设置自己的主密码，按提示设置；这与数据库的 `postgres` 密码不是一回事。
2. 展开左侧 `Servers`，连接本机的 PostgreSQL，输入安装时设置的 `postgres` 密码。
3. 展开 `Databases`，右键数据库 `postgres`，点击 `Query Tool`。
4. 在查询编辑区粘贴下面的第一条 SQL。把 `替换为你的数据库密码` 改成你自己生成的、至少 20 位的随机字母和数字，再点击执行按钮或按 `F5`。

```sql
CREATE USER xiaoan WITH PASSWORD '替换为你的数据库密码';
```

这里创建的是给系统使用的 `xiaoan` 账号，不是刚才的 `postgres` 管理员账号。为简化连接配置，本教程的应用数据库密码先只用字母和数字，避免 `@`、`:`、`/` 等字符需要额外编码。

**第一条执行成功后，清空编辑区，再单独粘贴并执行第二条。不要把两条一起执行。**

```sql
CREATE DATABASE xiaoan OWNER xiaoan;
```

执行成功后，右键左侧 `Databases`，选择刷新，应该能看到 `xiaoan` 数据库。

### 第 5 步：安装后端依赖

打开 PowerShell，逐行运行。每条命令成功结束后，再运行下一条：

```powershell
cd "$HOME\xiaoan-intelligent-warning-system"
py -3.11 -m venv server\.venv
.\server\.venv\Scripts\python.exe -m pip install --upgrade pip
.\server\.venv\Scripts\python.exe -m pip install -r server\requirements.txt
```

`.venv` 是项目自己的 Python 环境。这里直接使用它里面的 Python，**不需要执行激活脚本，也不需要修改 PowerShell 执行策略**。

依赖较多，需要联网下载；出现红色错误并停止时，不要继续启动后端，先看后面的常见问题。

### 第 6 步：填写数据库连接

在同一个终端运行：

```powershell
notepad .\server\.env
```

如果提示创建文件，选择创建。填入以下三行，记得把密码改成第 4 步给 `xiaoan` 用户设置的那个密码：

```dotenv
APP_ENV=development
DATABASE_URL=postgresql://xiaoan:替换为你的数据库密码@127.0.0.1:5432/xiaoan
CICSIC_ADMIN_AUTH_ENABLED=false
```

保存位置必须是项目的 `server` 文件夹，文件名必须是 **`.env`**，不是 `.env.txt` 或 `.env.local`。记事本“另存为”时选“所有文件”和 UTF-8 编码。

回到 PowerShell 检查：

```powershell
Get-Item .\server\.env
```

能够显示该文件才算保存正确。这个文件含密码，不要上传 GitHub，也不要截图发给别人。

**以上配置仅用于自己电脑上、监听 `127.0.0.1` 的本地测试。** `false` 表示关闭管理接口鉴权，不能原样用于局域网、公网或正式部署。

### 第 7 步：启动后端，再启动网页

准备两个 PowerShell 窗口。

**窗口一：后端。**

```powershell
cd "$HOME\xiaoan-intelligent-warning-system"
.\server\.venv\Scripts\python.exe scripts\dev_server.py --no-reload
```

缺失模块修复且环境配置正确后，预期出现 `Application startup complete`，没有随后报错退出。首次正常启动会创建所需业务表，无需复制原电脑的数据库文件夹。

用浏览器打开下面的地址：

```text
http://127.0.0.1:8010/api/health/ready
```

**成功标志：** 返回内容中的顶层 `status` 和 `database.status` 都是 `ready`。只看到网页，或者只看到 `/api/health` 的 `ok`，都不足以证明数据库正常。

**窗口二：网页。** 如果第一部分的网页窗口还在运行，不要再启动一份，直接刷新浏览器即可；否则运行：

```powershell
cd "$HOME\xiaoan-intelligent-warning-system"
npm.cmd run dashboard:dev
```

浏览器打开 `http://127.0.0.1:5177`，两个终端窗口都保持开启。先只使用虚构数据测试；健康检查通过后，还要确认实际的保存、刷新和查询操作正常，才能验收业务功能。

**以后重启电脑：** 确认 PostgreSQL 服务已启动，只需要重新执行本步骤的两组启动命令，不用再创建数据库、安装依赖或填写密码。停止时，在两个窗口分别按 `Ctrl+C`。

</details>

## 卡住了，先查这里

| 遇到的问题 | 先这样处理 |
| --- | --- |
| `git`、`node` 或 `py` “无法识别” | 安装对应软件后，关闭所有终端再重新打开；仍不行时检查安装时是否添加了 PATH。 |
| 提示 `npm.ps1` 禁止运行 | 使用本教程的 `npm.cmd`，不需要修改系统执行策略。 |
| 找不到 `package.json`，或出现 `ENOENT` | 先执行 `cd "$HOME\xiaoan-intelligent-warning-system"`，再重试。 |
| 下载很久，出现连接超时 | 确认浏览器能访问相应下载网站；恢复网络后重试失败的步骤，不要删除整个项目。 |
| `npm.cmd ci` 报 Node 版本不符合要求 | 用 `node --version` 检查，按第一部分安装符合要求的 Node.js 22.x，再重新开终端。 |
| 网页打不开 | 先看网页终端是否还在运行；把它显示的 `Local` 地址完整复制到浏览器地址栏。默认端口是 `5177`，不是 `5173`。 |
| 页面显示演示、离线或接口失败 | 只运行网页时可能出现。完整业务需要后端和数据库，不能靠反复刷新解决。 |
| `No module named 'app.services.device_bridges'` | 当前仓库缺少自身模块，不是漏装第三方软件。停止后端安装，等待代码补齐。 |
| `DATABASE_URL must be configured` | 检查 `server\.env` 是否存在、有无保存成 `.env.txt`，以及是否填写了 `DATABASE_URL`。 |
| 数据库连接失败或密码错误 | 在 Windows“服务”中检查 PostgreSQL 是否运行，再核对端口、数据库名 `xiaoan`、用户 `xiaoan` 及其密码。不要误填 `postgres` 的密码。 |
| SQL 提示用户或数据库已存在 | 不要删除它，可能之前已创建成功。确认是本项目的数据库后，继续下一步。 |
| 后端提示端口 `8010` 已占用 | 检查是否已经开了一个后端窗口；先停止自己重复启动的进程，不要随意结束不认识的服务。 |
| 接口返回 `401` | 表示需要授权。检查当前运行模式和管理令牌配置，不要为了绕过报错关闭正式环境的鉴权。 |

仍解决不了时，提供：卡在哪一步、最后几行报错、使用的软件版本。**请先遮住密码、Token、密钥、设备地址和个人信息。**

## 换一台电脑怎么办？

- **只是打开网页看看：** 在新电脑重新做第一部分，不用从原电脑复制 `node_modules`。
- **独立部署整套系统：** 等后端问题修复并验证后，在新电脑完成两部分。新建数据库不会自动带上原电脑的业务数据。
- **还要迁移已有数据：** 需要单独备份并恢复 PostgreSQL，以及业务需要的上传文件和设备配置。不要直接复制正在运行的数据库数据目录，也不要把这些内容上传到代码仓库。
- **让另一台电脑访问同一套系统：** 这与独立安装不同。`127.0.0.1` 只表示当前电脑，把这个地址发给别人打不开你的服务。本教程没有开放外网访问。

仓库文件看起来少，不一定是漏了系统：依赖会在安装时下载，数据库和密码由部署者自己创建。但开头提到的后端模块缺失是实际问题，不能归为“正常省略”。

## 小程序、摄像头和正式上线

这些不是第一部分的必做步骤，新手可以先跳过。

| 需要做什么 | 还需要准备什么 |
| --- | --- |
| 微信或支付宝小程序 | 对应开发者工具、自己的 AppID，以及可访问的后端。构建前显式设置 `TARO_APP_API_BASE_URL`，不要依赖历史默认地址；正式使用需按平台要求配置 HTTPS 和合法域名。 |
| 摄像头、Go2、视频检测或 AI 复核 | 对应设备、网络、模型或服务密钥，并逐项验证真实链路。网页里的演示画面不能当作接入成功。Go2 的补充说明在 `tools/README-go2-video.md`。 |
| 长期运行或开放给别人访问 | 先解决缺失源码并验收完整功能，再配置正式服务、鉴权、HTTPS、防火墙、数据库备份和依赖安全更新。不应直接把本教程的开发服务暴露出去。 |

`deploy/production` 里保留了 Linux 的 Nginx、systemd 和环境变量参考模板，其中路径、用户和端口需要按实际机器调整。**它们不是双击就能安装的一键部署包，也不能修复缺失的源码。**

网页的生产构建命令是：

```powershell
npm.cmd run dashboard:build
```

输出目录为 `apps/dashboard/dist`。这个目录只有网页，不包含后端和数据库；不要把它单独复制给别人就称为完整系统。

## 仓库里各目录是做什么的？

| 目录或文件 | 用途 |
| --- | --- |
| `apps/dashboard` | 电脑网页后台源码和资源 |
| `apps/miniprogram` | 小程序源码和资源 |
| `server/app` | 后端源码；当前缺失模块见开头提醒 |
| `server/models` | 本地检测模型资源 |
| `server/requirements.txt` | Python 依赖清单 |
| `package.json`、`package-lock.json` | 网页/小程序命令及依赖版本清单 |
| `scripts/dev_server.py` | 本地后端启动入口 |
| `deploy/production` | 正式部署参考模板 |
| `tools` | 可选设备接入工具 |

数据库、`.env` 密码配置、日志、缓存、`node_modules` 和 Python 虚拟环境不应提交到仓库。演示数据和画面仅用于原型展示，不代表真实监控证据；系统不能替代正式报警和急救渠道。地图及其他第三方资源仍需保留相应署名和许可信息。
