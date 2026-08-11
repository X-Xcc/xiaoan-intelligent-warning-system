# 江滩智防后端

本目录为 FastAPI 后端服务。

启动方式：

```powershell
npm run server:dev
```

默认监听：`http://127.0.0.1:8010`

## 真实事件接口

后端使用 `server/data/jiangtan.db` 作为开发期 SQLite 数据库。小程序、工作人员端和 Web 后台共用同一组事件接口：

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
