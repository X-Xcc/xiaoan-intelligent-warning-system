# Go2 真实画面桥接

该服务只接收宇树 Go2 摄像头画面，并转换成小安智能预警系统现有 Web 视频墙使用的 MJPEG。它不发送行走、站立、速度、云台或其他机器人控制指令。

## 安装

在项目自带的 Python 环境中安装桥接依赖：

```powershell
server\.venv-runtime\Scripts\python.exe -m pip install "unitree-webrtc-connect==2.2.0"
```

## 启动

让 Windows 电脑和 Go2 处于可以互相访问的网络中，然后设置 Go2 在局域网中的 IP：

```powershell
$env:GO2_IP="192.168.8.181"
$env:GO2_CONNECT_MODE="LocalSTA"
$env:GO2_VIDEO_PORT="5000"
server\.venv-runtime\Scripts\python.exe tools\go2_video_bridge.py
```

桥接服务地址为 `http://127.0.0.1:5000`。它提供：

```text
GET /health
GET /api/cameras
GET /api/stats/summary
GET /video_feed?cam=robot-dog-01
```

另开终端启动现有后端和 dashboard：

```powershell
$env:SECURITY_VIDEO_BASE_URL="http://127.0.0.1:5000"
npm run server:dev
npm run dashboard:dev
```

浏览器打开 dashboard 的视频监控页后，第 01 路应显示 Go2 当前真实画面。Go2 未连接或没有收到第一帧时，桥接服务会报告离线，前端保留原有演示回退画面。

## 固件与连接方式

使用 `unitree-webrtc-connect` 2.2.0；本桥接仅开放 `LocalSTA` 和 `LocalAP`。已对 GO2 X 软件 V1.1.14、硬件 V2.0 的热点连接收到真实 1280x720 视频帧。旧 `go2-webrtc-connect` 0.2.1 无法处理该设备的 `data2=2` 握手。

本地局域网优先使用 `LocalSTA` 并设置 `GO2_IP`；热点直连使用 `GO2_CONNECT_MODE=LocalAP`，地址为 `192.168.12.1`。其他固件版本仍需单独验证，当前配置不提供新版固件的逐设备密钥输入。

该上游驱动还声明了音频依赖；Linux 安装 PyAudio 时可能需要系统提供 PortAudio 开发包。桥接不打开本机麦克风或发送音频。

视频驱动通过 WebRTC 接收轨道，桥接层只把轨道帧编码为 JPEG 并提供 MJPEG，不保存视频文件。
