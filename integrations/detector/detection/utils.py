import os
import math
import time
import logging
import threading
from typing import List, Tuple, Optional
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import ImageFont, ImageDraw, Image

logger = logging.getLogger(__name__)


class Utils:
    _AVAILABLE_FONT_PATH = None
    _FONT_CACHE = {}
    _cache_lock = threading.Lock()

    KEYPOINT_NAMES = {
        0: 'nose', 1: 'left_eye', 2: 'right_eye', 3: 'left_ear', 4: 'right_ear',
        5: 'left_shoulder', 6: 'right_shoulder', 7: 'left_elbow', 8: 'right_elbow',
        9: 'left_wrist', 10: 'right_wrist', 11: 'left_hip', 12: 'right_hip',
        13: 'left_knee', 14: 'right_knee', 15: 'left_ankle', 16: 'right_ankle'
    }

    @classmethod
    def _get_available_font_path(cls) -> str:
        """获取可用的字体路径，缓存结果"""
        if cls._AVAILABLE_FONT_PATH is None:
            font_paths = [
                r"C:\Windows\Fonts\simhei.ttf",
                r"C:\Windows\Fonts\simsun.ttc",
                r"C:\Windows\Fonts\msyh.ttc",
                r"C:\Windows\Fonts\msyhbd.ttc",
                r"C:\Windows\Fonts\simkai.ttf",
                r"C:\Windows\Fonts\simli.ttf",
                r"C:\Windows\Fonts\simfang.ttf",
                r"C:\Windows\Fonts\STXINGKA.TTF",
                r"C:\Windows\Fonts\STKAITI.TTF",
                r"C:\Windows\Fonts\STSONG.TTF",
                r"C:\Windows\Fonts\STZHONGS.TTF",
                r"C:\Windows\Fonts\microsoftyahei.ttf",
                r"C:\Windows\Fonts\yahei.ttf",
                "/System/Library/Fonts/PingFang.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
                "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
            ]
            for path in font_paths:
                if os.path.exists(path):
                    cls._AVAILABLE_FONT_PATH = path
                    break
        return cls._AVAILABLE_FONT_PATH

    @staticmethod
    def _get_cached_font(size: int):
        """Get or create a cached font for the given size (thread-safe)"""
        if size not in Utils._FONT_CACHE:
            with Utils._cache_lock:
                if size not in Utils._FONT_CACHE:
                    font_path = Utils._get_available_font_path()
                    if font_path is None:
                        Utils._FONT_CACHE[size] = ImageFont.load_default()
                    else:
                        try:
                            Utils._FONT_CACHE[size] = ImageFont.truetype(font_path, size, encoding="utf-8")
                        except (OSError, IOError):
                            Utils._FONT_CACHE[size] = ImageFont.load_default()
        return Utils._FONT_CACHE[size]

    _tls = threading.local()

    @classmethod
    def begin_text_batch(cls, img: np.ndarray) -> ImageDraw.Draw:
        """开始批量文字渲染"""
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        cls._tls._pil_buffer = Image.fromarray(img_rgb)
        return ImageDraw.Draw(cls._tls._pil_buffer)

    @classmethod
    def end_text_batch(cls, img: np.ndarray) -> np.ndarray:
        """结束批量文字渲染"""
        buf = getattr(cls._tls, '_pil_buffer', None)
        if buf is None:
            return img
        result = cv2.cvtColor(np.array(buf), cv2.COLOR_RGB2BGR)
        cls._tls._pil_buffer = None
        return result

    @staticmethod
    def draw_text_cn_batch(draw: ImageDraw.Draw, text: str, pos: Tuple[int, int],
                           size: int = 30, color: Tuple[int, int, int] = (255, 255, 255)) -> None:
        """批量模式绘制文字"""
        font = Utils._get_cached_font(size)
        draw.text(pos, text, font=font, fill=color)

    @staticmethod
    def draw_text_cn(img: np.ndarray, text: str, pos: Tuple[int, int],
                     size: int = 30, color: Tuple[int, int, int] = (255, 255, 255)) -> np.ndarray:
        """绘制中文文本（单次调用兼容模式）"""
        try:
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img_pil = Image.fromarray(img_rgb)
            draw = ImageDraw.Draw(img_pil)
            font = Utils._get_cached_font(size)
            draw.text(pos, text, font=font, fill=color)
            img_bgr = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
            return img_bgr
        except (OSError, IOError, ValueError) as e:
            logger.warning("中文绘制失败: %s", e)
            return img

    @staticmethod
    def calculate_distance(p1, p2) -> float:
        """计算两点之间的距离（使用 math.hypot，比 numpy 更快用于标量）"""
        return math.hypot(float(p1[0]) - float(p2[0]), float(p1[1]) - float(p2[1]))

    @staticmethod
    def calculate_angle(p1: np.ndarray, p2: np.ndarray, p3: np.ndarray) -> float:
        """三点夹角"""
        v1 = np.array([float(p1[0]) - float(p2[0]), float(p1[1]) - float(p2[1])])
        v2 = np.array([float(p3[0]) - float(p2[0]), float(p3[1]) - float(p2[1])])
        norm_v1 = np.linalg.norm(v1)
        norm_v2 = np.linalg.norm(v2)
        if norm_v1 == 0 or norm_v2 == 0:
            return 0.0
        cos_angle = np.dot(v1, v2) / (norm_v1 * norm_v2)
        return np.arccos(np.clip(cos_angle, -1.0, 1.0)) * 180 / np.pi

    @staticmethod
    def get_body_center(keypoints: np.ndarray) -> Optional[np.ndarray]:
        """躯干中心=(左肩+右肩+左髋+右髋)/4"""
        if len(keypoints) >= 13:
            return np.mean(keypoints[[5, 6, 11, 12], :2], axis=0)
        return None

    @staticmethod
    def calculate_iou(bbox1, bbox2) -> float:
        """两人框的交并比（像素坐标）"""
        x1 = max(float(bbox1[0]), float(bbox2[0]))
        y1 = max(float(bbox1[1]), float(bbox2[1]))
        x2 = min(float(bbox1[2]), float(bbox2[2]))
        y2 = min(float(bbox1[3]), float(bbox2[3]))
        inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        area1 = (float(bbox1[2]) - float(bbox1[0])) * (float(bbox1[3]) - float(bbox1[1]))
        area2 = (float(bbox2[2]) - float(bbox2[0])) * (float(bbox2[3]) - float(bbox2[1]))
        union = area1 + area2 - inter
        return inter / union if union > 0 else 0.0

    @staticmethod
    def calculate_overlap(bbox1: List[float], bbox2: List[float], img_shape: Tuple[int, int]) -> float:
        """计算两个人体框的重叠度（归一化坐标 → 像素 → IoU）"""
        h, w = img_shape[:2]
        b1 = [bbox1[0] * w, bbox1[1] * h, bbox1[2] * w, bbox1[3] * h]
        b2 = [bbox2[0] * w, bbox2[1] * h, bbox2[2] * w, bbox2[3] * h]
        return Utils.calculate_iou(b1, b2)

    @staticmethod
    def find_gathering_clusters(keypoints_list: List[np.ndarray],
                                 radius: float,
                                 max_dim: float) -> List[List[int]]:
        """贪心聚类：将躯干中心距离 < radius*max_dim 的人归为同一簇。

        Args:
            keypoints_list: 每个人的 17 关键点数组
            radius: 归一化半径阈值
            max_dim: 图像最大边长（用于归一化距离）

        Returns:
            所有簇的列表，每个簇是 keypoints_list 的索引列表
        """
        n = len(keypoints_list)
        clusters = []
        used = [False] * n

        # Pre-compute all body centers (避免在嵌套循环中重复计算)
        centers = []
        for kp in keypoints_list:
            centers.append(Utils.get_body_center(kp))

        for i in range(n):
            if used[i]:
                continue
            center_i = centers[i]
            if center_i is None:
                continue
            cluster = [i]
            used[i] = True
            for j in range(i + 1, n):
                if used[j]:
                    continue
                center_j = centers[j]
                if center_j is None:
                    continue
                dist = Utils.calculate_distance(center_i, center_j) / max_dim
                if dist < radius:
                    cluster.append(j)
                    used[j] = True
            clusters.append(cluster)
        return clusters

    @staticmethod
    def generate_timestamp() -> str:
        """生成带毫秒的时间戳"""
        ms = int(time.time() * 1000) % 1000
        return f"{time.strftime('%Y%m%d_%H%M%S')}_{ms:03d}"

    _scratch_img = None
    _scratch_draw = None

    @staticmethod
    def measure_text_size(text: str, font_size: int) -> Tuple[int, int]:
        """测量文本尺寸（线程安全）"""
        try:
            with Utils._cache_lock:
                if Utils._scratch_img is None:
                    Utils._scratch_img = Image.new('RGB', (100, 100))
                    Utils._scratch_draw = ImageDraw.Draw(Utils._scratch_img)
            font = Utils._get_cached_font(font_size)
            with Utils._cache_lock:
                text_bbox = Utils._scratch_draw.textbbox((0, 0), text, font=font)
                return int(text_bbox[2] - text_bbox[0]), int(text_bbox[3] - text_bbox[1])
        except (OSError, IOError, AttributeError):
            return 80, 20


# ===================== 检测结果封装 =====================
@dataclass
class DetectionResult:
    """detect_security_actions 的返回值封装"""
    actions: List[str] = field(default_factory=list)
    person_count: int = 0
    fighting_persons: List[int] = field(default_factory=list)
    prev_centers: List[Optional[np.ndarray]] = field(default_factory=list)
    last_move_times: List[float] = field(default_factory=list)
    action_confidences: dict = field(default_factory=dict)
    gather_start_times: dict = field(default_factory=dict)
    prev_bboxes: list = field(default_factory=list)
    fall_confirm_counts: List[int] = field(default_factory=list)
