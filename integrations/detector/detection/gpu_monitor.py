import os
import logging

import cv2

logger = logging.getLogger(__name__)

# GPU 使用率上报（pynvml 可选）
try:
    import pynvml
    _GPU_AVAILABLE = True
except Exception:
    _GPU_AVAILABLE = False

# OpenCV CUDA 检测
HAS_CV2_CUDA = False
try:
    HAS_CV2_CUDA = cv2.cuda.getCudaEnabledDeviceCount() > 0
except Exception:
    pass


def init_gpu():
    """GPU 设备检测 + 打印信息（启动时调用一次）"""
    if os.environ.get("YOLOV8_SKIP_GPU_CHECK"):
        logger.info("YOLOV8_SKIP_GPU_CHECK 已设置，跳过 GPU 检测")
        return
    import torch
    _USE_GPU = os.environ.get("YOLOV8_DEVICE", "cpu").lower() == "cuda"

    logger.info("=" * 60)
    logger.info("PyTorch 版本: %s", torch.__version__)
    logger.info("CUDA 可用: %s", torch.cuda.is_available())

    if _USE_GPU and torch.cuda.is_available():
        logger.info("使用设备: GPU - %s", torch.cuda.get_device_name(0))
        logger.info("GPU 显存: %.1f GB", torch.cuda.get_device_properties(0).total_memory / 1024 / 1024 / 1024)
        torch.backends.cudnn.benchmark = True
        torch.backends.cudnn.enabled = True
        logger.info("cuDNN benchmark: 已启用")
    else:
        logger.info("使用设备: CPU 模式")

    if HAS_CV2_CUDA:
        logger.info("OpenCV CUDA: 可用")
    else:
        logger.info("OpenCV CUDA: 不可用 (resize 走 CPU)")
    logger.info("=" * 60)

    if _GPU_AVAILABLE:
        try:
            pynvml.nvmlInit()
        except Exception:
            pass


def report_gpu_status(web_server_url="http://127.0.0.1:5000"):
    """上报 GPU 使用率到 Java 后端"""
    if not _GPU_AVAILABLE:
        return
    try:
        import requests
        session = requests.Session()
        handle = pynvml.nvmlDeviceGetHandle(0)
        gpu_percent = pynvml.nvmlDeviceGetUtilizationRates(handle).gpu
        memory_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        gpu_name = pynvml.nvmlDeviceGetName(handle)
        if isinstance(gpu_name, bytes):
            gpu_name = gpu_name.decode('utf-8')
        session.post(
            f"{web_server_url}/api/gpu_status",
            json={
                "gpuPercent": gpu_percent,
                "gpuMemoryMb": memory_info.used // (1024 * 1024),
                "gpuName": gpu_name
            },
            timeout=1.0
        )
    except Exception as e:
        logger.warning("GPU状态上报失败: %s", e)
