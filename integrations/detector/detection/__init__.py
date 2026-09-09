# ===================== 公开 API =====================
# 将 detection/ 目录自身加入 sys.path，使子模块间绝对导入可用
import sys as _sys
import os as _os
_pkg_dir = _os.path.dirname(_os.path.abspath(__file__))
if _pkg_dir not in _sys.path:
    _sys.path.insert(0, _pkg_dir)

from config import Config, WEB_SERVER_URL, SEND_FRAME_INTERVAL, JPEG_QUALITY, DRAW_OVERLAY
from utils import Utils, DetectionResult
from detector import DetectionModule
from data_saver import DataSaver
from alert_manager import AlertManager
from ui_manager import UIManager
from camera import detect_cameras, load_cameras_config
from gpu_monitor import init_gpu, report_gpu_status, HAS_CV2_CUDA

# SecurityMonitor 依赖 ultralytics/torch，延迟导入
try:
    from monitor import SecurityMonitor
except ImportError:
    SecurityMonitor = None
