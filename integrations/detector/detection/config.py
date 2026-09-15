import os
import json


# 模块级常量（原 yolov8_security.py 顶部）
WEB_SERVER_URL = os.environ.get("WEB_SERVER_URL", "http://127.0.0.1:5000")
SEND_FRAME_INTERVAL = 1      # 每N帧发送一次，1=每帧都发
JPEG_QUALITY = 50            # JPEG压缩质量
DRAW_OVERLAY = False          # 是否绘制检测框和UI叠加层


class Config:
    # 路径配置
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
    MODEL_PATH = os.environ.get("YOLOV8_MODEL_PATH", os.path.join(PROJECT_ROOT, "models", "yolov8n-pose.pt"))
    SOURCES = []
    RESULT_VIDEO_PATH = os.path.join(os.environ.get("RESULT_DIR", os.path.join(PROJECT_ROOT, "results")), "security_result.mp4")
    DATASET_DIR = os.environ.get("DATA_DIR", os.path.join(PROJECT_ROOT, "server", "data"))

    # 模型参数
    IMG_SIZE = 512
    CONF_THRESH = 0.5
    DEVICE = "cuda" if os.environ.get("YOLOV8_DEVICE", "cpu").lower() == "cuda" else "cpu"
    HALF = DEVICE == "cuda"
    USE_TENSORRT = False

    # 检测参数
    FIGHTING_THRESHOLD = 0.3
    INFERENCE_EVERY = 2
    FALL_CONFIRM_FRAMES = 2
    FALL_SCORE_THRESHOLD = 0.5
    FALL_MIN_KP_CONF = 0.5
    FALL_MIN_VALID_KP = 5
    FALL_ASPECT_RATIO_HIGH = 0.7
    FALL_ASPECT_RATIO_LOW = 0.55
    FALL_HEAD_HIP_RATIO = -0.05
    FALL_KNEE_ANGLE_BEND = 60
    FALL_KNEE_ANGLE_STRAIGHT = 170
    FALL_VERTICALITY_RATIO = 0.25
    FALL_HIP_ANKLE_DIFF = 0.03
    FALL_TRUNK_ANGLE = 40
    FALL_HEAD_GROUND_RATIO = 0.65
    FALL_MIN_FEATURES = 2
    # 打架检测
    FIGHT_TRUNK_DISTANCE = 0.15
    FIGHT_BBOX_OVERLAP = 0.1
    FIGHT_ARM_ELBOW_OFFSET = 0.05
    FIGHT_ARM_WRIST_OFFSET = 0.1
    # 人员聚集
    GATHER_THRESHOLD = 3
    GATHER_RADIUS = 0.08
    GATHER_DURATION = 3.0
    GATHER_CONF_DIVISOR = 8.0
    # 跨帧追踪
    TRACKING_IOU_THRESHOLD = 0.3

    # 报警参数
    ALERT_COOLDOWN = 5.0

    # 数据保存参数
    SAVE_INTERVAL = 5
    SAVE_IMAGE_ON_ACTION = True

    # UI参数
    PANEL_WIDTH = 300
    HEADER_HEIGHT = 60
    BANNER_HEIGHT = 40

    # 颜色配置
    COLORS = {
        'bg': (30, 30, 30),
        'panel': (45, 45, 45),
        'text': (220, 220, 220),
        'normal': (0, 255, 0),
        'warning': (0, 165, 255),
        'danger': (0, 0, 255),
        'leave': (150, 150, 150),
        'live_green': (0, 255, 0),
        'live_red': (0, 0, 255),
        'card_bg': (50, 50, 50),
        'card_border': (60, 60, 60)
    }

    def __init__(self):
        self._load_thresholds()

    @staticmethod
    def _clamp(value, lo, hi):
        """将值限制在 [lo, hi] 范围内"""
        return max(lo, min(hi, value))

    def _load_thresholds(self):
        """从 thresholds.json 加载阈值，缺失字段保留默认值，带范围校验"""
        config_path = os.environ.get("THRESHOLDS_PATH", os.path.join(self.SCRIPT_DIR, "thresholds.json"))
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Warning: 阈值配置加载失败 ({e})，使用默认值")
            return

        m = data.get("model", {})
        self.IMG_SIZE = max(128, m.get("img_size", self.IMG_SIZE))
        self.CONF_THRESH = self._clamp(m.get("conf_thresh", self.CONF_THRESH), 0.0, 1.0)
        self.INFERENCE_EVERY = max(1, m.get("inference_every", self.INFERENCE_EVERY))

        f = data.get("fall", {})
        self.FALL_CONFIRM_FRAMES = max(1, f.get("confirm_frames", self.FALL_CONFIRM_FRAMES))
        self.FALL_SCORE_THRESHOLD = self._clamp(f.get("score_threshold", 0.5), 0.0, 1.0)
        self.FALL_MIN_KP_CONF = self._clamp(f.get("min_keypoint_conf", 0.5), 0.0, 1.0)
        self.FALL_MIN_VALID_KP = max(1, f.get("min_valid_keypoints", 5))
        self.FALL_ASPECT_RATIO_HIGH = f.get("aspect_ratio_high", 0.7)
        self.FALL_ASPECT_RATIO_LOW = f.get("aspect_ratio_low", 0.55)
        self.FALL_HEAD_HIP_RATIO = f.get("head_hip_ratio", -0.05)
        self.FALL_KNEE_ANGLE_BEND = f.get("knee_angle_bend", 60)
        self.FALL_KNEE_ANGLE_STRAIGHT = f.get("knee_angle_straight", 170)
        self.FALL_VERTICALITY_RATIO = f.get("verticality_ratio", 0.25)
        self.FALL_HIP_ANKLE_DIFF = f.get("hip_ankle_diff", 0.03)
        self.FALL_TRUNK_ANGLE = f.get("trunk_angle", 40)
        self.FALL_HEAD_GROUND_RATIO = f.get("head_ground_ratio", 0.65)
        self.FALL_MIN_FEATURES = f.get("min_features", 2)

        fi = data.get("fight", {})
        self.FIGHTING_THRESHOLD = fi.get("threshold", self.FIGHTING_THRESHOLD)
        self.FIGHT_TRUNK_DISTANCE = fi.get("trunk_distance", 0.15)
        self.FIGHT_BBOX_OVERLAP = fi.get("bbox_overlap", 0.1)
        self.FIGHT_ARM_ELBOW_OFFSET = fi.get("arm_elbow_offset", 0.05)
        self.FIGHT_ARM_WRIST_OFFSET = fi.get("arm_wrist_offset", 0.1)

        g = data.get("gathering", {})
        self.GATHER_THRESHOLD = g.get("threshold", self.GATHER_THRESHOLD)
        self.GATHER_RADIUS = g.get("radius", self.GATHER_RADIUS)
        self.GATHER_DURATION = g.get("duration", self.GATHER_DURATION)
        self.GATHER_CONF_DIVISOR = g.get("confidence_divisor", 8.0)

        t = data.get("tracking", {})
        self.TRACKING_IOU_THRESHOLD = t.get("iou_threshold", 0.3)

        a = data.get("alert", {})
        self.ALERT_COOLDOWN = a.get("cooldown", self.ALERT_COOLDOWN)
