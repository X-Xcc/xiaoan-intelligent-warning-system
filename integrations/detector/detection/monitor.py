import os
import sys
import re
import time
import logging
import threading
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# requests 可选
try:
    import requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False
    logger.warning("未安装 requests 库，无法发送视频流到 web 面板")

from ultralytics import YOLO

from config import Config, WEB_SERVER_URL, SEND_FRAME_INTERVAL, JPEG_QUALITY, DRAW_OVERLAY, API_KEY
from utils import Utils
from detector import DetectionModule
from data_saver import DataSaver
from alert_manager import AlertManager
from ui_manager import UIManager
from camera import detect_cameras, load_cameras_config
from gpu_monitor import init_gpu, report_gpu_status, HAS_CV2_CUDA


class SecurityMonitor:
    """安防监控主程序"""

    def __init__(self):
        # GPU 初始化（打印设备信息）
        init_gpu()

        self.config = Config()

        # 从 Java API 加载摄像头配置
        self.config.SOURCES = load_cameras_config()
        self._go2rtc_available = self._check_go2rtc()
        if not self.config.SOURCES and os.environ.get("DETECTOR_DISCOVER_USB", "false").lower() == "true":
            logger.warning("未找到 cameras.json 或配置为空，回退到 USB 摄像头自动检测...")
            usb_cams = detect_cameras(max_index=5)
            self.config.SOURCES = [{"id": f"cam{i}", "type": "usb", "address": i, "name": f"USB摄像头{i}"} for i in usb_cams]

        self.detection_module = DetectionModule(self.config)
        self.data_saver = DataSaver(self.config)
        self.alert_manager = AlertManager(self.config)
        self.ui_manager = UIManager(self.config)

        # 加载模型
        if not self.config.SOURCES:
            raise RuntimeError("No cameras configured; import private camera configuration before starting detection")
        if not os.path.isfile(self.config.MODEL_PATH):
            raise FileNotFoundError("Configured local pose model is missing; automatic downloads are disabled")
        if self.config.USE_TENSORRT:
            engine_path = self.config.MODEL_PATH.replace('.pt', f'_trt_{self.config.IMG_SIZE}.engine')
            if os.path.exists(engine_path):
                logger.info("加载 TensorRT engine: %s", engine_path)
                self.model = YOLO(engine_path)
            else:
                logger.info("首次运行：导出 TensorRT engine（约需 1-2 分钟）...")
                base_model = YOLO(self.config.MODEL_PATH)
                base_model.export(format='engine', imgsz=self.config.IMG_SIZE, half=True, device=self.config.DEVICE)
                self.model = YOLO(engine_path)
                logger.info("TensorRT 导出完成")
        else:
            self.model = YOLO(self.config.MODEL_PATH)

        # GPU 预热
        logger.info("GPU 预热中...")
        dummy = np.zeros((self.config.IMG_SIZE, self.config.IMG_SIZE, 3), dtype=np.uint8)
        self.model(dummy, imgsz=self.config.IMG_SIZE, device=self.config.DEVICE,
                   half=self.config.HALF, verbose=False)
        logger.info("GPU 预热完成")

        # 是否启用 web 视频流
        self.enable_web_stream = _HAS_REQUESTS
        self.session = requests.Session() if _HAS_REQUESTS else None
        if self.session and API_KEY:
            self.session.headers['X-API-Key'] = API_KEY

        # 帧大小
        self.web_stream_width = 960
        self.web_stream_height = 540

        # 多摄像头线程控制
        self._stop_event = threading.Event()
        self._threads = []

        # 异步帧发送线程池
        self._frame_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="frame_sender") if _HAS_REQUESTS else None
        self._pending_frames = 0
        self._frame_lock = threading.Lock()

    def _check_go2rtc(self):
        """检查 go2rtc 是否可用"""
        go2rtc_api = os.environ.get("GO2RTC_API", "http://127.0.0.1:1984")
        if not _HAS_REQUESTS:
            return False
        try:
            resp = requests.get(f"{go2rtc_api}/api", timeout=2)
            if resp.status_code == 200:
                logger.info("go2rtc 可用")
                return True
        except Exception:
            pass
        logger.warning("go2rtc 不可用，RTSP 摄像头可能无法拉流")
        return False

    def _init_video_source(self, source=0, cam_type="usb"):
        """初始化视频源"""
        cap = None
        try:
            if cam_type == "rtsp":
                backend = cv2.CAP_FFMPEG
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
            else:
                backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY
            cap = cv2.VideoCapture(source, backend)
            if not cap.isOpened():
                logger.warning("Video source could not be opened")
                return True, None, 1280, 720

            if cam_type == "rtsp":
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)
            else:
                cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                cap.set(cv2.CAP_PROP_FPS, 30)

            frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            if cam_type == "rtsp":
                for _ in range(2):
                    cap.grab()
            return False, cap, frame_width, frame_height
        except Exception as e:
            logger.error("Video source initialization failed (%s)", type(e).__name__)
            return True, None, 1280, 720

    def _init_video_writer(self):
        """初始化视频写入器"""
        new_frame_width = self.frame_width + self.config.PANEL_WIDTH
        new_frame_height = self.frame_height + self.config.HEADER_HEIGHT
        results_dir = os.path.dirname(self.config.RESULT_VIDEO_PATH)
        os.makedirs(results_dir, exist_ok=True)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(self.config.RESULT_VIDEO_PATH, fourcc, 30.0,
                               (new_frame_width, new_frame_height), isColor=True)
        if not out.isOpened():
            logger.warning("视频写入器初始化失败，将不会保存视频")
            out = None
        else:
            logger.info("视频写入器初始化成功，输出路径: %s", self.config.RESULT_VIDEO_PATH)
            logger.info("视频尺寸: %dx%d", new_frame_width, new_frame_height)
        return out, (new_frame_width, new_frame_height)

    def report_model_info(self):
        """向 Java 后端报告模型信息"""
        if not _HAS_REQUESTS:
            return
        try:
            model_size = 0
            try:
                model_size = os.path.getsize(self.config.MODEL_PATH) / 1024 / 1024
            except OSError:
                pass
            info = {
                "precision": "FP16" if Config.HALF else "FP32",
                "device": Config.DEVICE,
                "model_size_mb": round(model_size, 1),
                "total_layers": 0,
                "conv_layers": 0,
                "quantized_layers": 0,
                "gpu_available": Config.DEVICE == "cuda",
                "half_precision": Config.HALF
            }
            headers = {'X-API-Key': API_KEY} if API_KEY else {}
            requests.post(f"{WEB_SERVER_URL}/api/model_info", json=info, timeout=2, headers=headers)
        except Exception as e:
            logger.warning("模型信息上报失败: %s", e)

    def run(self):
        """主运行循环 - 多摄像头模式"""
        sources = self.config.SOURCES
        if not sources:
            logger.error("没有可用的摄像头，退出。")
            return

        logger.info("Detection started with %d configured cameras", len(sources))
        logger.info("按 Enter 退出系统")
        if self.enable_web_stream:
            logger.info("视频流将发送到: %s", WEB_SERVER_URL)

        self.report_model_info()

        self._threads = []
        for cam_config in sources:
            t = threading.Thread(target=self._run_camera_thread, args=(cam_config,), daemon=True)
            t.start()
            self._threads.append(t)

        try:
            while not self._stop_event.is_set():
                time.sleep(0.5)
        except KeyboardInterrupt:
            logger.info("收到中断信号，正在停止...")
            self._stop_event.set()

        for t in self._threads:
            t.join(timeout=3)

        cv2.destroyAllWindows()
        logger.info("系统已退出")

    def _get_frame_from_cap(self, cap, use_static, test_image, cam_type="usb"):
        """从指定摄像头获取视频帧"""
        if use_static:
            return test_image.copy(), use_static
        try:
            if cam_type == "rtsp" and cap is not None:
                cap.grab()
            ret, frame = cap.read()
            if not ret:
                logger.warning("无法获取视频帧，切换到静态图像模式...")
                return test_image.copy(), True
            return frame, False
        except Exception as e:
            logger.error("读取视频帧时出错: %s", e)
            return test_image.copy(), True

    def _fetch_http_snapshot(self, url, session):
        """通过 HTTP 获取单帧快照"""
        try:
            resp = session.get(url, timeout=5)
            if resp.status_code == 200 and len(resp.content) > 100:
                img_array = np.frombuffer(resp.content, dtype=np.uint8)
                frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                if frame is not None:
                    return frame, True
        except Exception:
            pass
        return None, False

    def _run_camera_thread(self, cam_config):
        """单个摄像头的检测循环"""
        cam_str = cam_config["id"]
        source = cam_config["address"]
        cam_name = cam_config["name"]
        cam_type = cam_config["type"]
        logger.info("Camera worker started; type=%s", cam_type)

        if cam_type == "http_snapshot":
            snapshot_url = source
            user = cam_config.get("user", "")
            password = cam_config.get("password", "")
            http_session = requests.Session()
            http_session.auth = (user, password)
            test_frame, ok = self._fetch_http_snapshot(snapshot_url, http_session)
            if ok:
                frame_height, frame_width = test_frame.shape[:2]
                logger.info("[%s] HTTP 快照连接成功，分辨率: %dx%d", cam_name, frame_width, frame_height)
            else:
                logger.warning("HTTP snapshot connection failed; camera skipped")
                return
            cap = None
            use_static = False
            test_image = np.zeros((frame_height, frame_width, 3), dtype=np.uint8)
        else:
            logger.info("Initializing configured video source")
            use_static, cap, frame_width, frame_height = self._init_video_source(source, cam_type)
            logger.info("[%s] 初始化完成: use_static=%s, cap=%s, %dx%d", cam_name, use_static, cap is not None, frame_width, frame_height)
            if use_static:
                logger.warning("[%s] 摄像头连接失败，跳过该摄像头", cam_name)
                return

        if use_static:
            test_image = np.zeros((720, 1280, 3), dtype=np.uint8)
            cv2.putText(test_image, f"{cam_name}", (400, 360), cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
        else:
            test_image = np.zeros((720, 1280, 3), dtype=np.uint8)

        session = requests.Session() if _HAS_REQUESTS else None
        if session and API_KEY:
            session.headers['X-API-Key'] = API_KEY

        prev_centers = []
        last_move_times = []
        gather_start_times = {}
        prev_bboxes = []
        fall_confirm_counts = []
        logs = deque(maxlen=20)
        prev_actions = []
        frame_count = 0
        start_time = time.time()
        last_model_info_time = time.time()

        cached_results = None
        cached_actions = []
        cached_person_num = 0
        cached_fighting_persons = []
        cached_action_confidences = {}
        inference_every = max(1, self.config.INFERENCE_EVERY)

        window_name = f"Camera {cam_str}"

        try:
            logger.info("[%s] 进入主循环, cap=%s, use_static=%s", cam_name, cap is not None, use_static)
            while not self._stop_event.is_set():
                # 1. 读取帧
                if cam_type == "http_snapshot" and not use_static:
                    frame, ok = self._fetch_http_snapshot(snapshot_url, http_session)
                    if not ok:
                        logger.warning("[%s] HTTP 快照获取失败，切换到静态图像模式", cam_name)
                        use_static = True
                        frame = test_image.copy()
                else:
                    frame, use_static = self._get_frame_from_cap(cap, use_static, test_image, cam_type)
                    if use_static and cap is not None:
                        cap.release()
                        cap = None
                frame_count += 1

                # 2. 跳帧推理
                if frame_count % inference_every == 1 or cached_results is None:
                    results = self.model(
                        frame,
                        imgsz=self.config.IMG_SIZE,
                        conf=self.config.CONF_THRESH,
                        device=self.config.DEVICE,
                        half=self.config.HALF,
                        batch=False
                    )

                    det = self.detection_module.detect_security_actions(
                        results, prev_centers, last_move_times, gather_start_times,
                        prev_bboxes, fall_confirm_counts
                    )
                    actions = det.actions
                    person_num = det.person_count
                    fighting_persons = det.fighting_persons
                    prev_centers = det.prev_centers
                    last_move_times = det.last_move_times
                    action_confidences = det.action_confidences
                    gather_start_times = det.gather_start_times
                    prev_bboxes = det.prev_bboxes
                    fall_confirm_counts = det.fall_confirm_counts

                    cached_results = results
                    cached_actions = actions
                    cached_person_num = person_num
                    cached_fighting_persons = fighting_persons
                    cached_action_confidences = action_confidences
                else:
                    results = cached_results
                    actions = cached_actions
                    person_num = cached_person_num
                    fighting_persons = cached_fighting_persons
                    action_confidences = cached_action_confidences

                # 4. 原始帧（仅 overlay 启用时复制，避免不必要的内存拷贝）
                frame_out = frame.copy() if DRAW_OVERLAY else frame

                # 8. 发送帧到 web（异步）
                if frame_count % SEND_FRAME_INTERVAL == 0 and session is not None and self._frame_executor is not None:
                    with self._frame_lock:
                        can_submit = self._pending_frames < 3
                        if can_submit:
                            self._pending_frames += 1
                    if can_submit:
                        future = self._frame_executor.submit(self._send_frame_session, frame_out.copy(), cam_str, session, person_num)
                        future.add_done_callback(lambda _: self._release_frame_slot())

                # 9. 日志
                current_time_str = time.strftime("%H:%M:%S")
                for action in actions:
                    if action not in prev_actions:
                        log_entry = f"[{current_time_str}] [CAM-{cam_str}] {action}"
                        logs.append(log_entry)
                prev_actions = actions.copy()

                # 10. FPS
                elapsed = time.time() - start_time
                fps = frame_count / elapsed if elapsed > 0 else 0

                # 11. 定期报告
                now = time.time()
                if cam_str == "0" and now - last_model_info_time > 60:
                    self.report_model_info()
                    last_model_info_time = now

                if cam_str == "0" and frame_count % (max(1, int(fps)) * 5) == 0:
                    report_gpu_status(WEB_SERVER_URL)

                # 12. 画检测框 + UI
                if DRAW_OVERLAY:
                    self._draw_detection_boxes(results, fighting_persons, frame_out)
                    is_alarm = "跌倒" in actions or "打架" in actions
                    frame_out = self._draw_ui(frame_out, is_alarm, actions, logs, action_confidences, person_num, fps)

                # 13. 显示
                if DRAW_OVERLAY:
                    show_gui = os.isatty(0)
                    if show_gui:
                        cv2.imshow(window_name, frame_out)

                # 14. 保存检测数据
                if cam_str == self.config.SOURCES[0]["id"] and frame_count % self.config.SAVE_INTERVAL == 0:
                    timestamp = self.data_saver.save_detection_data(actions, person_num, fps, frame_count,
                                                                     camera_name=cam_name, camera_id=cam_str)
                    image_path = None
                    if actions:
                        image_path = self.data_saver.save_frame_image(frame, actions, timestamp)
                    self.data_saver.notify_cicsic_review(
                        actions,
                        person_num,
                        fps,
                        frame_count,
                        time.strftime("%Y-%m-%d %H:%M:%S"),
                        cam_name,
                        cam_str,
                        image_path,
                    )

                # 15. 检查退出
                if DRAW_OVERLAY and os.isatty(0):
                    key = cv2.waitKey(1) & 0xFF
                    if key == 13:
                        logger.info("[摄像头 %s] 收到退出信号，停止所有摄像头...", cam_str)
                        self._stop_event.set()
                        break

        except Exception as e:
            logger.error("[摄像头 %s] 线程异常: %s", cam_str, e)
        finally:
            if cap is not None:
                cap.release()
            if session is not None:
                session.close()
            logger.info("[摄像头 %s] 线程结束", cam_str)

    def _release_frame_slot(self):
        """释放帧发送槽位"""
        with self._frame_lock:
            self._pending_frames = max(0, self._pending_frames - 1)

    def _send_frame_session(self, frame, cam, session, person_count=0):
        """使用指定会话发送帧到web服务器"""
        try:
            if HAS_CV2_CUDA:
                gpu_frame = cv2.cuda_GpuMat()
                gpu_frame.upload(frame)
                gpu_resized = cv2.cuda.resize(gpu_frame, (self.web_stream_width, self.web_stream_height))
                frame_resized = gpu_resized.download()
            else:
                frame_resized = cv2.resize(frame, (self.web_stream_width, self.web_stream_height))
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
            _, img_encoded = cv2.imencode('.jpg', frame_resized, encode_params)
            response = session.post(
                f"{WEB_SERVER_URL}/api/update_frame",
                files={'frame': ('frame.jpg', img_encoded.tobytes(), 'image/jpeg')},
                data={'cam': cam, 'person_count': str(person_count)},
                timeout=1.5
            )
            if response.status_code != 200:
                logger.warning("[摄像头 %s] 帧上传失败: HTTP %d %s", cam, response.status_code, response.text[:200])
        except Exception as e:
            logger.error("[摄像头 %s] 帧上传异常: %s", cam, e)

    def _draw_detection_boxes(self, results, fighting_persons, frame_out):
        """绘制所有检测框"""
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy() if hasattr(box.xyxy[0], 'cpu') else box.xyxy[0])
                conf = float(box.conf[0])
                cv2.rectangle(frame_out, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame_out, f"person {conf:.2f}", (x1, y1 - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            self._draw_torso_boxes(result, frame_out)
            if fighting_persons:
                self._draw_fighting_persons(result, fighting_persons, frame_out)
            if result.keypoints is not None:
                kp_list = []
                for kp in result.keypoints.data:
                    kp_np = kp.cpu().numpy() if hasattr(kp, 'cpu') else kp
                    kp_list.append(kp_np)
                if kp_list:
                    self._draw_gathering_persons(result, kp_list, frame_out)

    def _draw_torso_boxes(self, result, frame_out):
        """用红框标出躯干区域"""
        try:
            if result.keypoints is None:
                return
            keypoints = result.keypoints.data
            for kp in keypoints:
                kp_np = kp.cpu().numpy() if hasattr(kp, 'cpu') else kp
                if len(kp_np) < 13:
                    continue
                torso_points = kp_np[[5, 6, 11, 12]]
                valid = torso_points[torso_points[:, 2] > 0.35]
                if len(valid) < 2:
                    continue
                x1, y1 = valid[:, :2].min(axis=0)
                x2, y2 = valid[:, :2].max(axis=0)
                pad_x = max(12, int((x2 - x1) * 0.35))
                pad_y = max(18, int((y2 - y1) * 0.45))
                h, w = frame_out.shape[:2]
                x1 = max(0, int(x1) - pad_x)
                y1 = max(0, int(y1) - pad_y)
                x2 = min(w - 1, int(x2) + pad_x)
                y2 = min(h - 1, int(y2) + pad_y)
                cv2.rectangle(frame_out, (x1, y1), (x2, y2), (0, 0, 255), 4)
                cv2.putText(frame_out, "TORSO", (x1, max(25, y1 - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        except Exception as e:
            logger.error("绘制躯干红框失败: %s", e)

    def _draw_fighting_persons(self, result, fighting_persons, frame_out):
        """框选打架人员"""
        try:
            if result.boxes is not None:
                for i in fighting_persons:
                    if i < len(result.boxes):
                        bbox = result.boxes[i].xyxy[0].cpu().numpy() if hasattr(result.boxes[i].xyxy[0], 'cpu') else result.boxes[i].xyxy[0]
                        x1, y1, x2, y2 = map(int, bbox)
                        cv2.rectangle(frame_out, (x1, y1), (x2, y2), (0, 0, 255), 3)
                        cv2.putText(frame_out, "打架", (x1, y1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        except Exception as e:
            logger.error("框选打架人员失败: %s", e)

    def _draw_gathering_persons(self, result, keypoints_list, frame_out):
        """用黄色圆弧框选聚集人员"""
        try:
            n = len(keypoints_list)
            if n < self.config.GATHER_THRESHOLD:
                return
            h, w = frame_out.shape[:2]
            max_dim = max(w, h)
            clusters = Utils.find_gathering_clusters(keypoints_list, self.config.GATHER_RADIUS, max_dim)
            best = max(clusters, key=len) if clusters else []
            if len(best) < self.config.GATHER_THRESHOLD:
                return
            xs = [Utils.get_body_center(keypoints_list[i])[0] * w for i in best]
            ys = [Utils.get_body_center(keypoints_list[i])[1] * h for i in best]
            if not xs:
                return
            min_x, max_x = int(min(xs)), int(max(xs))
            min_y, max_y = int(min(ys)), int(max(ys))
            pad = 20
            cv2.rectangle(frame_out, (min_x - pad, min_y - pad), (max_x + pad, max_y + pad),
                         (0, 255, 255), 3)
            label = f"人员聚集 {len(best)}人"
            cv2.putText(frame_out, label, (min_x - pad, min_y - pad - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        except Exception as e:
            logger.error("绘制聚集人员失败: %s", e)

    def _draw_ui(self, frame_out, is_alarm, actions, logs, action_confidences, person_num, fps):
        """绘制UI"""
        frame_out = self.ui_manager.draw_header(frame_out, is_alarm)
        frame_out, _ = self.alert_manager.check_and_trigger_alert(actions, frame_out)

        card_w, card_h = 120, 40
        fx = frame_out.shape[1] - card_w - 10
        cv2.rectangle(frame_out, (fx, 10), (fx + card_w, 50), self.config.COLORS['panel'], -1)
        cv2.rectangle(frame_out, (fx, 10), (fx + card_w, 50), self.config.COLORS['card_border'], 1)

        frame_out = self.ui_manager.draw_left_panel(frame_out, person_num, actions, logs, action_confidences)

        draw = Utils.begin_text_batch(frame_out)
        Utils.draw_text_cn_batch(draw, f"{fps:.1f} FPS", (fx + 10, 35), 20, self.config.COLORS['text'])
        Utils.draw_text_cn_batch(draw, "按 Enter 退出系统",
                                  (frame_out.shape[1] - 250, frame_out.shape[0] - 30), 20, self.config.COLORS['text'])
        frame_out = Utils.end_text_batch(frame_out)

        return frame_out


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
    monitor = SecurityMonitor()
    monitor.run()
