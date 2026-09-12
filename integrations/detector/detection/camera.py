import os
import json
import logging

logger = logging.getLogger(__name__)

# requests 可选
try:
    import requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False


def detect_cameras(max_index=5):
    """USB capture is intentionally unsupported in the real-camera deployment."""
    raise RuntimeError("USB cameras are not supported")


def load_cameras_config(api_base=None):
    """从内部接口获取源配置，失败时回退到本地 cameras.json。"""
    if api_base is None:
        api_base = os.environ.get("WEB_SERVER_URL", "http://127.0.0.1:5000")

    rtsp_host = os.environ.get("GO2RTC_RTSP_HOST", "rtsp://127.0.0.1:8554")

    if not _HAS_REQUESTS:
        logger.warning("requests 库不可用，回退到本地 cameras.json")
        return _load_cameras_config_fallback()

    try:
        resp = requests.get(
            f"{api_base.rstrip('/')}/api/internal/camera_config",
            timeout=5, allow_redirects=False,
        )
        resp.raise_for_status()
        if resp.status_code != 200:
            raise ValueError("Unexpected camera service response")
        data = resp.json()
        cameras_data = data.get("data", data) if isinstance(data, dict) else data

        cameras = []
        for cam in cameras_data:
            if cam.get("type") == "rtsp":
                go2rtc_id = cam.get("go2rtcId", f"cam_{cam['id']}")
                original_rtsp = _replace_cam_password(cam.get("address", ""))
                cameras.append({
                    "id": cam["id"],
                    "type": "rtsp",
                    "address": original_rtsp if original_rtsp else f"{rtsp_host}/{go2rtc_id}",
                    "name": cam.get("name", f"Camera {cam['id']}"),
                    "go2rtc_id": go2rtc_id,
                })
            elif cam.get("type") in ("http_snapshot", "http_mjpeg"):
                cameras.append({
                    "id": cam["id"],
                    "type": cam["type"],
                    "address": _replace_cam_password(cam.get("address", cam.get("httpUrl", ""))),
                    "name": cam.get("name", f"Camera {cam['id']}"),
                    "user": cam.get("username", cam.get("user", "")),
                    "password": _replace_cam_password(cam.get("password", "")),
                    "go2rtc_id": cam.get("go2rtcId"),
                })

        logger.info("从 API 加载了 %d 个摄像头", len(cameras))
        return cameras

    except Exception as e:
        logger.warning("Camera API unavailable (%s); using private configuration file", type(e).__name__)
        return _load_cameras_config_fallback()


def _replace_cam_password(value):
    """将字符串中的 ${CAM_PASSWORD} 替换为环境变量值"""
    if not isinstance(value, str):
        return value
    if "${CAM_PASSWORD}" not in value:
        return value
    password = os.environ.get("CAM_PASSWORD", "")
    if not password:
        logger.warning("环境变量 CAM_PASSWORD 未设置，摄像头密码为空")
    return value.replace("${CAM_PASSWORD}", password)


def _load_cameras_config_fallback():
    """回退方案：读本地 cameras.json"""
    config_path = os.environ.get("CAMERAS_CONFIG_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "cameras.json"))
    if not os.path.exists(config_path):
        return []
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cameras = []
        for cam in data.get("cameras", []):
            if cam.get("type") == "usb":
                continue
            if cam.get("type") not in ("rtsp", "http_snapshot", "http_mjpeg", "go2"):
                continue
            address = _replace_cam_password(cam.get("address", ""))
            cameras.append({
                "id": cam.get("id", ""),
                "type": cam.get("type", ""),
                "address": address,
                "name": cam.get("name", ""),
                "user": cam.get("username", cam.get("user", "")),
                "password": _replace_cam_password(cam.get("password", "")),
                "go2rtc_id": cam.get("go2rtcId"),
            })
        return cameras
    except Exception as e:
        logger.error("Private camera configuration is invalid (%s)", type(e).__name__)
        return []
