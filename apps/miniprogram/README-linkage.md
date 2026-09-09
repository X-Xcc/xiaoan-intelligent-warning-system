# 小程序报警联动

## 本轮核对（2026-09-09）

- 当前新版服务的接口为 `http://47.114.37.85:8080/public-security/api`，健康检查正常。
- 本地 `http://127.0.0.1:5177/command` 已通过代理连接这套接口，不再读取本地旧警情库。
- 此 HTTP 地址用于本轮 Web 联调，不是已经配置好的手机体验版 HTTPS 地址。
- 本地原生产配置的临时隧道域名无法解析，已清除；服务器尚未配置 HTTPS 监听和域名。
- 无法仅从本地源码确定手机里已安装的体验版请求地址，本轮未重新上传体验版。

## Web 联调

在工作区根目录运行，必须明确选择接收后端：

```powershell
.\tools\start_alarm_linkage.ps1 -ApiBaseUrl 'http://47.114.37.85:8080/public-security/api'
```

已有程序占用端口时，脚本会拒绝覆盖。使用 `-WebPort` 指定空闲端口，不会停止原有服务。
生成的 `.verify/alarm-linkage/web-5177.json` 记录实际后端和进程；不含认证凭据。

## 体验版发布前

1. 确定可用的固定 HTTPS 域名，并将其 API 反代到同一套新版后端；不要指向旧系统或另一套数据库。
2. 在微信公众平台核对 request、uploadFile、downloadFile 和 socket 对应的服务器域名配置。
3. 将完整 API 地址填入本目录 `.env.production` 的 `TARO_APP_API_BASE_URL`，保留 `/api` 及必要的路径前缀。
4. 安装小程序依赖后运行 `npm --workspace apps/miniprogram run build:weapp:release`，再上传、设置新的体验版。
5. 使用明确标注的联调求助，核对小程序回执编号、服务器事件编号和 Web 警情编号一致。

生产构建会拒绝缺失地址、本机地址、HTTP/IP、临时隧道以及携带凭据或查询参数的接口地址。
地址格式检查通过不等于域名配置、网络连接或手机端已经验收。
本轮仅做服务器只读检查，没有往线上提交测试报警。
