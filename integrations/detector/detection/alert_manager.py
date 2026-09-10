import time
import logging
from typing import List, Tuple

import numpy as np

from config import Config
from utils import Utils

logger = logging.getLogger(__name__)


class AlertManager:

    def __init__(self, config: Config):
        self.config = config
        self.last_alert_time = 0.0

    def check_and_trigger_alert(self, actions: List[str], frame: np.ndarray) -> Tuple[np.ndarray, bool]:
        """检查是否需要触发报警"""
        is_alarm = "跌倒" in actions or "打架" in actions
        alert_triggered = False

        if is_alarm:
            current_time = time.time()
            if current_time - self.last_alert_time > self.config.ALERT_COOLDOWN:
                frame = self._draw_alert_banner(frame)
                self.last_alert_time = current_time
                alert_triggered = True
            else:
                # cooldown 中，不画横幅
                pass

        return frame, alert_triggered

    def _draw_alert_banner(self, img: np.ndarray) -> np.ndarray:
        """绘制报警横幅"""
        banner_height = self.config.BANNER_HEIGHT
        banner = np.full((banner_height, img.shape[1], 3), self.config.COLORS['danger'], dtype=np.uint8)

        alert_text = "危险行为检测中"
        text_size = 20
        text_width, _ = Utils.measure_text_size(alert_text, text_size)
        text_x = (img.shape[1] - text_width) // 2

        draw = Utils.begin_text_batch(banner)
        Utils.draw_text_cn_batch(draw, alert_text, (text_x, 5), text_size, (255, 255, 255))
        banner = Utils.end_text_batch(banner)
        return np.vstack((banner, img))
