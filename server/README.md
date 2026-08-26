# 夜市智防后端

本目录为夜市智防 FastAPI 后端服务。

启动方式：

```powershell
npm run server:dev
```

默认监听：`http://127.0.0.1:8010`

当前云服务器临时 HTTPS 调试地址：

```text
https://undergraduate-ears-powell-roots.trycloudflare.com/api
```

该地址由 Cloudflare Quick Tunnel 提供，适合临时联调；服务或隧道重启后地址可能变化。正式上线小程序仍建议绑定自己的域名和 HTTPS 证书。

## 数据库配置

后端现在通过 SQLAlchemy 连接数据库。默认不配置环境变量时，仍会使用本地开发库：

```text
server/data/jiangtan.db
```

上线或多人联调时，建议配置 PostgreSQL：

```powershell
$env:DATABASE_URL="postgresql://jiangtan:你的密码@数据库地址:5432/jiangtan_zhifang"
npm run server:dev
```

也支持 MySQL：

```powershell
$env:DATABASE_URL="mysql+pymysql://jiangtan:你的密码@数据库地址:3306/jiangtan_zhifang?charset=utf8mb4"
npm run server:dev
```

服务启动时会自动创建这些业务表：

- `safety_events`：求助、上报、线索登记等事件工单
- `event_audit_logs`：派单、接收、到达、处理、闭环等流转记录
- `wechat_users`：小程序微信登录态、openid、token

## 真实事件接口

小程序、巡防人员端和 Web 后台共用同一组事件接口。只要它们指向同一个后端地址，就会读写同一个数据库：

```text
POST   /api/auth/wechat-login
GET    /api/events
GET    /api/events/overview
POST   /api/events/help
POST   /api/events/reports
POST   /api/events/lost-claims
PATCH  /api/events/{event_id}/status
PATCH  /api/events/{event_id}/supplement
```

`/api/demo` 仅作为浏览器展示入口，数据同样来自上述事件库，不再维护独立演示列表。

## 微信登录配置

小程序前端只调用 `wx.login` 获取一次性 `code`，再交给后端 `/api/auth/wechat-login` 换取登录态。后端读取：

```powershell
$env:WECHAT_APPID="你的微信小程序 AppID"
$env:WECHAT_APP_SECRET="你的微信小程序 AppSecret"
```

开发期没有配置 `WECHAT_APP_SECRET` 时，接口会返回本地开发会话，方便页面链路调试；上线前必须配置真实 `AppSecret`。
