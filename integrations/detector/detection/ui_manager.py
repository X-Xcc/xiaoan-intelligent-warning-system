import logging
from typing import List

import cv2
import numpy as np

from config import Config
from utils import Utils

logger = logging.getLogger(__name__)


class UIManager:

    def __init__(self, config: Config):
        self.config = config

    def draw_header(self, img: np.ndarray, is_alarm: bool, draw=None) -> np.ndarray:
        """绘制顶部标题栏"""
        header_height = self.config.HEADER_HEIGHT
        header = np.full((header_height, img.shape[1], 3), self.config.COLORS['panel'], dtype=np.uint8)
        header = Utils.draw_text_cn(header, "AI SECURITY SYSTEM", (20, 15), 24, self.config.COLORS['text'])
        live_color = self.config.COLORS['live_red'] if is_alarm else self.config.COLORS['live_green']
        cv2.circle(header, (img.shape[1] - 120, 30), 8, live_color, -1)
        header = Utils.draw_text_cn(header, "LIVE", (img.shape[1] - 100, 15), 20, self.config.COLORS['text'])
        return np.vstack((header, img))

    def draw_left_panel(self, img: np.ndarray, person_count: int, actions: List[str], logs: List[str], action_confidences: dict) -> np.ndarray:
        """绘制左侧状态面板"""
        panel_width = self.config.PANEL_WIDTH
        panel_height = img.shape[0]
        panel = np.full((panel_height, panel_width, 3), self.config.COLORS['panel'], dtype=np.uint8)

        # OpenCV 画矩形
        cv2.rectangle(panel, (10, 50), (panel_width - 10, 170), self.config.COLORS['card_bg'], -1)
        cv2.rectangle(panel, (10, 50), (panel_width - 10, 170), self.config.COLORS['card_border'], 2)
        cv2.rectangle(panel, (10, 180), (panel_width - 10, 330), self.config.COLORS['card_bg'], -1)
        cv2.rectangle(panel, (10, 180), (panel_width - 10, 330), self.config.COLORS['card_border'], 2)
        cv2.rectangle(panel, (10, 340), (panel_width - 10, 590), self.config.COLORS['card_bg'], -1)
        cv2.rectangle(panel, (10, 340), (panel_width - 10, 590), self.config.COLORS['card_border'], 2)

        # 批量文字渲染
        draw = Utils.begin_text_batch(panel)
        Utils.draw_text_cn_batch(draw, "SYSTEM STATUS", (20, 20), 20, self.config.COLORS['text'])

        status = "正常"
        status_color = self.config.COLORS['normal']
        if "跌倒" in actions or "打架" in actions:
            status = "警告"
            status_color = self.config.COLORS['warning']
        Utils.draw_text_cn_batch(draw, "状态信息", (20, 70), 18, self.config.COLORS['text'])
        Utils.draw_text_cn_batch(draw, f"People: {person_count}", (25, 100), 14, self.config.COLORS['text'])
        Utils.draw_text_cn_batch(draw, f"状态: {status}", (25, 130), 14, status_color)

        Utils.draw_text_cn_batch(draw, "行为检测", (20, 200), 18, self.config.COLORS['text'])
        bx = 25
        by = 235
        for action in actions:
            confidence = action_confidences.get(action, 0.0)
            Utils.draw_text_cn_batch(draw, f"  {action} {confidence:.2f}  ", (bx + 5, by + 5), 16, self.config.COLORS['bg'])
            tw, _ = Utils.measure_text_size(f"  {action} {confidence:.2f}  ", 16)
            bx += tw + 20
            if bx > panel_width - 120:
                bx = 25
                by += 40

        Utils.draw_text_cn_batch(draw, "最近日志", (20, 360), 18, self.config.COLORS['text'])
        log_y = 390
        for log in list(logs)[-5:]:
            Utils.draw_text_cn_batch(draw, log, (25, log_y - 5), 14, self.config.COLORS['text'])
            log_y += 30

        panel = Utils.end_text_batch(panel)
        return np.hstack((panel, img))
