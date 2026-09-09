# 小安检测服务

本目录是小安智能预警系统的原生检测子系统，包含 Java 检测服务、Python YOLO 检测入口、检测管理网页、模型与 go2rtc 程序。完整安装请从仓库根目录执行 `install-prerequisites.cmd`，然后使用 `restore.cmd` 或 `start.cmd`；不需要单独安装 Docker Desktop。

## 本机运行方式

- `start.cmd` 启动 PostgreSQL、API、检测服务和主网页。
- `enable-cameras.cmd` 在确认设备网络后启用桥接、Python 检测和 go2rtc。
- 检测服务地址为 `http://127.0.0.1:5000`。
- 私有配置保存在 `deploy/native/detector.env`，绝不能提交或分享。

首次运行会创建独立的 Python 检测虚拟环境、构建 Java `yolov8-security.war`，并使用项目自己的 Maven 缓存，不继承工作站的全局缓存。

## 恢复内容

完整迁移包会将检测服务数据、摄像头配置、模型、检测结果、训练数据集和训练运行结果恢复到本目录相应位置。恢复脚本会逐个校验文件哈希；恢复前目标目录必须为空。

## 运行边界

默认不连接真实摄像头。目标电脑需要自行满足摄像头网络、账号授权、USB 驱动、GPU/CPU 性能和模型许可条件。Java 服务健康检查不代表某一路真实视频已经能解码或产生有效预警；设备必须逐台验收。
