import time
import logging
from itertools import combinations
from typing import List, Tuple, Optional

import numpy as np

from config import Config
from utils import Utils, DetectionResult

logger = logging.getLogger(__name__)


class DetectionModule:
    """行为检测模块"""

    def __init__(self, config: Config):
        self.config = config

    def detect_fall(self, keypoints: np.ndarray) -> Tuple[bool, float]:
        """基于多维度特征检测跌倒行为"""
        if len(keypoints) < 17:
            return False, 0.0

        valid_kp = keypoints[keypoints[:, 2] > self.config.FALL_MIN_KP_CONF]
        if len(valid_kp) < self.config.FALL_MIN_VALID_KP:
            return False, 0.0

        # 维度1: 包围框长宽比
        min_x, max_x = valid_kp[:, 0].min(), valid_kp[:, 0].max()
        min_y, max_y = valid_kp[:, 1].min(), valid_kp[:, 1].max()
        height = max_y - min_y
        if height == 0:
            return False, 0.0
        aspect_ratio = (max_x - min_x) / height

        # 维度3: 头臀相对位置
        head_y = keypoints[0][1]
        hip_y = (keypoints[11][1] + keypoints[12][1]) / 2
        head_hip_ratio = (head_y - hip_y) / height

        # 腿部角度
        left_knee_angle = Utils.calculate_angle(keypoints[11], keypoints[13], keypoints[15])
        right_knee_angle = Utils.calculate_angle(keypoints[12], keypoints[14], keypoints[16])

        # 躯干垂直度
        shoulder_y = (keypoints[5][1] + keypoints[6][1]) / 2
        verticality_ratio = abs(hip_y - shoulder_y) / height

        # 脚踝与髋部的相对位置
        hip_ankle_diff = hip_y - (keypoints[15][1] + keypoints[16][1]) / 2

        # 维度2: 躯干倾斜角
        shoulder_center = (keypoints[5][:2] + keypoints[6][:2]) / 2
        hip_center = (keypoints[11][:2] + keypoints[12][:2]) / 2
        trunk_vector = shoulder_center - hip_center
        trunk_norm = np.linalg.norm(trunk_vector)
        trunk_angle = np.arccos(
            np.clip(-trunk_vector[1] / trunk_norm, -1.0, 1.0)) * 180 / np.pi if trunk_norm > 0 else 0

        # 头部与地面的相对位置
        head_ground_ratio = head_y

        # 关键点置信度加权
        confidence_score = np.mean(keypoints[:, 2])

        # 综合评分
        fall_score = 0
        required_features = 0

        if aspect_ratio > self.config.FALL_ASPECT_RATIO_HIGH:
            fall_score += 0.25
            required_features += 1
        elif aspect_ratio > self.config.FALL_ASPECT_RATIO_LOW:
            fall_score += 0.1

        if head_hip_ratio < self.config.FALL_HEAD_HIP_RATIO:
            fall_score += 0.2
            required_features += 1

        if (left_knee_angle < self.config.FALL_KNEE_ANGLE_BEND or left_knee_angle > self.config.FALL_KNEE_ANGLE_STRAIGHT) and \
                (right_knee_angle < self.config.FALL_KNEE_ANGLE_BEND or right_knee_angle > self.config.FALL_KNEE_ANGLE_STRAIGHT):
            fall_score += 0.15

        if verticality_ratio < self.config.FALL_VERTICALITY_RATIO:
            fall_score += 0.15
            required_features += 1

        if hip_ankle_diff > self.config.FALL_HIP_ANKLE_DIFF:
            fall_score += 0.1

        if trunk_angle > self.config.FALL_TRUNK_ANGLE:
            fall_score += 0.15
            required_features += 1

        if head_ground_ratio > self.config.FALL_HEAD_GROUND_RATIO:
            fall_score += 0.1

        fall_score *= confidence_score

        is_fall = fall_score > self.config.FALL_SCORE_THRESHOLD and required_features >= self.config.FALL_MIN_FEATURES
        return is_fall, fall_score

    def _is_arm_raised(self, keypoints: np.ndarray) -> bool:
        """检测手臂是否高于肩膀"""
        if len(keypoints) < 10:
            return False
        shoulder_y = (keypoints[5][1] + keypoints[6][1]) / 2
        elbow_y = (keypoints[7][1] + keypoints[8][1]) / 2
        wrist_y = (keypoints[9][1] + keypoints[10][1]) / 2
        return (elbow_y < shoulder_y - self.config.FIGHT_ARM_ELBOW_OFFSET) or (wrist_y < shoulder_y - self.config.FIGHT_ARM_WRIST_OFFSET)

    def detect_fighting(self, keypoints_list: List[np.ndarray], bboxes: List[List[float]],
                        img_shape: Tuple[int, int]) -> Tuple[bool, List[int]]:
        """基于躯干数据检测打架行为"""
        if len(keypoints_list) < 2:
            return False, []

        h, w = img_shape[:2]
        max_dim = max(w, h)
        fighting_persons = set()

        for (i, kp1), (j, kp2) in combinations(enumerate(keypoints_list), 2):
            center1 = Utils.get_body_center(kp1)
            center2 = Utils.get_body_center(kp2)
            if center1 is None or center2 is None:
                continue

            fight_score = 0
            if Utils.calculate_distance(center1, center2) / max_dim < self.config.FIGHT_TRUNK_DISTANCE:
                fight_score += 0.4
            if Utils.calculate_overlap(bboxes[i], bboxes[j], img_shape) > self.config.FIGHT_BBOX_OVERLAP:
                fight_score += 0.3
            if self._is_arm_raised(kp1) and self._is_arm_raised(kp2):
                fight_score += 0.3

            if fight_score > self.config.FIGHTING_THRESHOLD:
                fighting_persons.add(i)
                fighting_persons.add(j)

        return len(fighting_persons) > 0, list(fighting_persons)

    def detect_gathering(self, keypoints_list: List[np.ndarray],
                         img_shape: Tuple[int, int],
                         gather_start_times: Optional[dict]) -> Tuple[bool, int, float]:
        """检测人员聚集行为"""
        n = len(keypoints_list)
        if n < self.config.GATHER_THRESHOLD:
            return False, 0, 0.0

        h, w = img_shape[:2]
        max_dim = max(w, h)

        clusters = Utils.find_gathering_clusters(keypoints_list, self.config.GATHER_RADIUS, max_dim)

        if not clusters:
            return False, 0, 0.0
        best_cluster = max(clusters, key=len)
        gather_count = len(best_cluster)

        if gather_count < self.config.GATHER_THRESHOLD:
            return False, 0, 0.0

        current_time = time.time()
        cluster_key = tuple(sorted(best_cluster))
        if gather_start_times is None:
            gather_start_times = {}

        if cluster_key not in gather_start_times:
            gather_start_times[cluster_key] = current_time

        start_time = gather_start_times.get(cluster_key, current_time)
        duration = current_time - start_time
        confidence = min(gather_count / self.config.GATHER_CONF_DIVISOR, 1.0)
        is_gathering = duration >= self.config.GATHER_DURATION
        return is_gathering, gather_count, confidence

    def detect_security_actions(self, pose_results: List, prev_centers: Optional[List[np.ndarray]],
                                last_move_times: Optional[List[float]],
                                gather_start_times: Optional[dict] = None,
                                prev_bboxes: Optional[List] = None,
                                fall_confirm_counts: Optional[List[int]] = None) -> DetectionResult:
        """检测所有安全行为，支持多人检测（IoU 跟踪 + 时序平滑）"""
        detected_actions = set()
        person_count = 0
        keypoints_list = []
        bboxes = []
        img_shape = None
        new_gather_start_times = gather_start_times if gather_start_times is not None else {}
        fighting_persons = []
        action_confidences = {}

        for r in pose_results:
            if r.keypoints is None:
                continue

            img_shape = r.orig_img.shape
            keypoints = r.keypoints.data
            person_count = len(keypoints)

            current_bboxes = []
            for i, kp in enumerate(keypoints):
                kp_np = kp.cpu().numpy() if hasattr(kp, 'cpu') else kp
                keypoints_list.append(kp_np)

                if len(r.boxes) > i:
                    bbox = (
                        r.boxes[i].xyxy[0].cpu().numpy()
                        if hasattr(r.boxes[i].xyxy[0], 'cpu')
                        else r.boxes[i].xyxy[0]
                    )
                    normalized_bbox = bbox / [img_shape[1], img_shape[0], img_shape[1], img_shape[0]]
                    bboxes.append(normalized_bbox)
                    current_bboxes.append(normalized_bbox)
                else:
                    current_bboxes.append(None)

            # IoU 人体跟踪
            new_prev_centers = [None] * person_count
            new_last_move_times = [time.time()] * person_count
            new_fall_confirm_counts = [0] * person_count
            new_prev_bboxes_list = [None] * person_count

            if prev_bboxes and len(prev_bboxes) > 0 and current_bboxes:
                n_new = len(current_bboxes)
                n_prev = len(prev_bboxes)
                iou_matrix = np.zeros((n_new, n_prev))
                for ni in range(n_new):
                    if current_bboxes[ni] is None:
                        continue
                    for pi in range(n_prev):
                        if prev_bboxes[pi] is None:
                            continue
                        iou_matrix[ni, pi] = Utils.calculate_iou(current_bboxes[ni], prev_bboxes[pi])

                matched_new = set()
                matched_prev = set()
                while len(matched_new) < n_new and len(matched_prev) < n_prev:
                    best_iou, best_ni, best_pi = 0.0, -1, -1
                    for ni in range(n_new):
                        if ni in matched_new:
                            continue
                        for pi in range(n_prev):
                            if pi in matched_prev:
                                continue
                            if iou_matrix[ni, pi] > best_iou:
                                best_iou, best_ni, best_pi = iou_matrix[ni, pi], ni, pi
                    if best_iou < self.config.TRACKING_IOU_THRESHOLD:
                        break
                    matched_new.add(best_ni)
                    matched_prev.add(best_pi)
                    if prev_centers and best_pi < len(prev_centers):
                        new_prev_centers[best_ni] = prev_centers[best_pi]
                    if last_move_times and best_pi < len(last_move_times):
                        new_last_move_times[best_ni] = last_move_times[best_pi]
                    if fall_confirm_counts and best_pi < len(fall_confirm_counts):
                        new_fall_confirm_counts[best_ni] = fall_confirm_counts[best_pi]

            # 逐人检测（仅遍历当前帧内有效索引，避免 keypoints_list 累积导致越界）
            n_track = min(len(keypoints_list), len(new_prev_bboxes_list), len(new_fall_confirm_counts))
            for i in range(n_track):
                kp_np = keypoints_list[i]
                new_prev_bboxes_list[i] = current_bboxes[i] if i < len(current_bboxes) else None
                is_fall, fall_confidence = self.detect_fall(kp_np)
                if is_fall:
                    new_fall_confirm_counts[i] += 1
                    if new_fall_confirm_counts[i] >= self.config.FALL_CONFIRM_FRAMES:
                        detected_actions.add("跌倒")
                        action_confidences["跌倒"] = fall_confidence
                else:
                    new_fall_confirm_counts[i] = 0

            if person_count >= 2 and img_shape is not None:
                is_fighting, fight_persons = self.detect_fighting(keypoints_list, bboxes, img_shape)
                if is_fighting:
                    detected_actions.add("打架")
                    fighting_persons = fight_persons
                    action_confidences["打架"] = 1.0

            if person_count == 0:
                detected_actions.add("离岗")
                action_confidences["离岗"] = 1.0

            if person_count >= 2 and img_shape is not None:
                is_gathering, gather_count, gather_conf = self.detect_gathering(
                    keypoints_list, img_shape, new_gather_start_times
                )
                if is_gathering:
                    detected_actions.add("人员聚集")
                    action_confidences["人员聚集"] = gather_conf

        return DetectionResult(
            actions=list(detected_actions),
            person_count=person_count,
            fighting_persons=fighting_persons,
            prev_centers=new_prev_centers,
            last_move_times=new_last_move_times,
            action_confidences=action_confidences,
            gather_start_times=new_gather_start_times,
            prev_bboxes=new_prev_bboxes_list,
            fall_confirm_counts=new_fall_confirm_counts,
        )
