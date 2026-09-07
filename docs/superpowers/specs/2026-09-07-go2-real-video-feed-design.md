# Go2 实时画面接入设计

## 目标

将宇树 Go2 的真实摄像头画面接入烟火哨兵 Web 指挥后台的视频监控页，绑定到视频墙第 01 路“机械狗巡检视角”。本次只处理视频接入，不增加机器狗运动控制、云台控制或新的 AI 检测能力。

## 现状约束

- `apps/dashboard/src/pages/VideoLinkagePage.tsx` 已支持通过 `<img>` 显示 MJPEG 流。
- `server/app/api/routes/security_video.py` 已提供 `/api/security-video/feed?cam=...`，并转发到外部视频服务的 `/video_feed`。
- 后端通过 `SECURITY_VIDEO_BASE_URL` 配置外部视频服务地址，默认值为 `http://127.0.0.1:5000`。
- 无外部视频服务时，前端继续显示现有演示画面。

## 方案

新增独立的本地 Go2 视频桥接服务 `tools/go2_video_bridge.py`：

1. 从环境变量读取 Go2 地址和桥接服务监听参数。
2. 使用 Go2 WebRTC 连接库获取最新图像帧。
3. 将图像帧编码为 JPEG，并以 `multipart/x-mixed-replace` 输出 MJPEG。
4. 提供现有后端所需的摄像头列表、状态和统计接口。
5. 服务启动或 Go2 断连时返回明确的状态信息；不伪造在线画面。

桥接服务接口：

```text
GET /api/cameras
GET /api/stats/summary
GET /video_feed?cam=robot-dog-01
GET /health
```

## 数据流

```text
Go2 摄像头
  -> go2_webrtc_connect
  -> tools/go2_video_bridge.py
  -> server /api/security-video/feed
  -> VideoLinkagePage 第 01 路
```

前端仍使用现有后端地址，不直接暴露 Go2 地址，也不需要改成浏览器 WebRTC 信令客户端。桥接服务不可用时，第 01 路沿用现有演示回退逻辑。

## 配置与启动

```powershell
$env:GO2_IP="192.168.123.161"
$env:GO2_VIDEO_PORT="5000"
python tools\go2_video_bridge.py
$env:SECURITY_VIDEO_BASE_URL="http://127.0.0.1:5000"
npm run server:dev
npm run dashboard:dev
```

实际 Go2 地址、依赖安装命令和库 API 以所选 `go2-webrtc` 版本为准，写入桥接服务的启动说明，不写死在前端代码中。

## 错误处理

- Go2 地址缺失：启动失败并提示设置 `GO2_IP`。
- Go2 连接失败：健康检查和摄像头状态标记为离线，视频流返回可识别的 HTTP 错误。
- 单帧编码失败：丢弃该帧，继续等待下一帧。
- 客户端断开：及时停止该客户端的流响应，不影响桥接服务继续运行。
- 不修改现有演示回退资源和其他视频源。

## 测试与验收

- 单元测试验证摄像头列表固定包含 `robot-dog-01`，并标记名称、区域和来源。
- 单元测试验证 MJPEG 响应的 Content-Type 和 JPEG 帧边界格式。
- 单元测试验证未连接 Go2 时不会声称实时在线。
- 前端构建验证第 01 路仍绑定 `robot-dog-01`，桥接服务不可用时仍显示演示画面。
- 联调验收：Go2 与 Windows 位于可互通网络，浏览器打开监控页后，第 01 路显示 Go2 当前真实画面。

## 非目标

- 不接入 Go2 行走、站立、速度、云台或急停控制。
- 不替换现有 YOLO/千问复核链路。
- 不把 Go2 视频直接接入微信小程序。
- 不要求改造整个视频墙为原生 WebRTC。
