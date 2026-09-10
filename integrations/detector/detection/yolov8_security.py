# ===================== 向后兼容入口 =====================
# 原 1922 行单文件已拆分为多个模块，此文件保留入口点和公开 API 导出
# 运行: cd detection && python yolov8_security.py
import sys
import os

# 确保当前目录在 sys.path 中
_dir = os.path.dirname(os.path.abspath(__file__))
if _dir not in sys.path:
    sys.path.insert(0, _dir)

# 忽略警告
import warnings
warnings.filterwarnings("ignore")

# 从子模块导出所有公开 API（保持 import 路径兼容）
from config import Config, WEB_SERVER_URL, SEND_FRAME_INTERVAL, JPEG_QUALITY, DRAW_OVERLAY
from utils import Utils, DetectionResult
from detector import DetectionModule
from data_saver import DataSaver
from alert_manager import AlertManager
from ui_manager import UIManager
from camera import detect_cameras, load_cameras_config
from gpu_monitor import init_gpu, report_gpu_status, HAS_CV2_CUDA

# SecurityMonitor 依赖 ultralytics/torch，延迟导入避免测试环境缺依赖时报错
try:
    from monitor import SecurityMonitor
except ImportError:
    SecurityMonitor = None


if __name__ == "__main__":
    if SecurityMonitor is None:
        print("错误: SecurityMonitor 无法加载，请确保已安装 ultralytics 和 torch")
        sys.exit(1)
    monitor = SecurityMonitor()
    monitor.run()
