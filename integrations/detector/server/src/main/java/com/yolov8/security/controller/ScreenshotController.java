package com.yolov8.security.controller;

import com.yolov8.security.config.AppConfig;
import com.yolov8.security.model.Alert;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.model.DetectionData;
import com.yolov8.security.service.AlertService;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.DetectionService;
import com.yolov8.security.service.KanbanEventBus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 截图与训练素材上传接口
 */
@RestController
@RequestMapping("/api")
public class ScreenshotController {

    private static final Logger log = LoggerFactory.getLogger(ScreenshotController.class);

    private static final java.util.Map<String, String> ALARM_TYPE_MAP = java.util.Map.of(
        "fight", "打架",
        "fall", "跌倒",
        "suicide", "自杀",
        "gathering", "异常聚集"
    );

    private final AlertService alertService;
    private final CameraConfigService cameraConfigService;
    private final DetectionService detectionService;
    private final AppConfig appConfig;
    private final RestTemplate restTemplate;

    public ScreenshotController(AlertService alertService,
                                CameraConfigService cameraConfigService,
                                DetectionService detectionService,
                                AppConfig appConfig,
                                RestTemplate restTemplate) {
        this.alertService = alertService;
        this.cameraConfigService = cameraConfigService;
        this.detectionService = detectionService;
        this.appConfig = appConfig;
        this.restTemplate = restTemplate;
    }

    @PostMapping("/screenshot")
    public ResponseEntity<ApiResponse<Map<String, Object>>> takeScreenshot(
            @RequestBody Map<String, Object> body) {
        try {
            String type = (String) body.get("type");
            if (type == null || type.isBlank()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("type 参数必填"));
            }
            String zhType = ALARM_TYPE_MAP.get(type);
            if (zhType == null) {
                return ResponseEntity.badRequest()
                    .body(ApiResponse.error("不支持的报警类型: " + type + "，可选: fight/fall/suicide/gathering"));
            }

            final List<String> filterIds;
            Object rawCameraIds = body.get("cameraIds");
            if (rawCameraIds instanceof List<?> rawList) {
                filterIds = rawList.stream().filter(String.class::isInstance).map(String.class::cast).collect(Collectors.toList());
            } else {
                filterIds = java.util.List.of();
            }
            List<CameraConfigService.Camera> allCams = cameraConfigService.getAllCameras();
            List<CameraConfigService.Camera> targets;
            if (!filterIds.isEmpty()) {
                targets = allCams.stream()
                    .filter(c -> filterIds.contains(c.getId()))
                    .collect(Collectors.toList());
            } else {
                targets = allCams;
            }
            if (targets.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("没有可用的摄像头"));
            }

            String go2rtcHost = appConfig.getGo2rtc().getApiHost();
            List<String> alertIds = new java.util.ArrayList<>();
            int saved = 0;
            List<String> failures = new java.util.ArrayList<>();

            for (CameraConfigService.Camera cam : targets) {
                String go2rtcId = cam.getGo2rtcId();
                if (go2rtcId == null || go2rtcId.isBlank()) {
                    go2rtcId = "cam_" + cam.getId();
                }
                try {
                    String snapshotUrl = go2rtcHost + "/api/frame.jpeg?src=" + go2rtcId;
                    byte[] jpeg = restTemplate.getForObject(snapshotUrl, byte[].class);
                    if (jpeg == null || jpeg.length == 0) {
                        failures.add(cam.getId() + ": 空响应");
                        continue;
                    }

                    List<String> actions = List.of(zhType);
                    DetectionData det = detectionService.saveManualDetection(
                        jpeg, cam.getId(), cam.getName(), actions);

                    Alert alert = new Alert();
                    alert.setType(zhType);
                    alert.setLevel("suicide".equals(type) ? "high" : "medium");
                    alert.setTime(det.getTimestamp());
                    alert.setCameraId(cam.getId());
                    alert.setCameraName(cam.getName());
                    alert.setImageFilename(det.getImageFilename());
                    alert.setSnapshotUrl("/api/images/" + det.getImageFilename().replaceAll("[/\\\\]", ""));
                    alert.setMessage("手动报警: " + zhType);
                    alert.setConfidence(100.0);
                    alertService.addAlert(alert);
                    alertIds.add(alert.getId());
                    saved++;
                } catch (Exception e) {
                    log.warn("摄像头 {} 截图失败: {}", cam.getId(), e.getMessage());
                    failures.add(cam.getId() + ": " + e.getMessage());
                }
            }

            if (saved == 0) {
                return ResponseEntity.status(503)
                    .body(ApiResponse.error("截图服务不可用: " + String.join("; ", failures)));
            }

            KanbanEventBus.publish("alerts", alertService.getAllAlerts());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("saved", saved);
            result.put("alertIds", alertIds);
            if (!failures.isEmpty()) {
                result.put("failures", failures);
            }
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("截图接口异常", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("截图失败: " + e.getMessage()));
        }
    }

    @PostMapping("/screenshot/upload")
    public ResponseEntity<ApiResponse<Map<String, Object>>> uploadScreenshot(
            @RequestBody Map<String, Object> body) {
        try {
            String base64Data = (String) body.get("base64");
            String alarmType = (String) body.getOrDefault("type", "fight");
            String cameraId = (String) body.getOrDefault("cameraId", "cam-unknown");
            String cameraName = (String) body.getOrDefault("cameraName", "未知摄像头");

            if (base64Data == null || base64Data.isBlank()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("base64 参数必填"));
            }

            if (base64Data.contains(",")) {
                base64Data = base64Data.split(",")[1];
            }

            // Base64 大小限制: 最大 ~10MB 原始数据 (base64 约 13.3MB 字符串)
            if (base64Data.length() > 14_000_000) {
                return ResponseEntity.status(413)
                        .body(ApiResponse.error("Payload Too Large: base64 数据超过 10MB 限制"));
            }

            byte[] jpeg = Base64.getDecoder().decode(base64Data);

            String zhType = ALARM_TYPE_MAP.getOrDefault(alarmType, "打架");
            String level = "suicide".equals(alarmType) ? "high" : "medium";

            DetectionData det = detectionService.saveManualDetection(jpeg, cameraId, cameraName, List.of(zhType));

            Alert alert = new Alert();
            alert.setType(zhType);
            alert.setLevel(level);
            alert.setTime(det.getTimestamp());
            alert.setCameraId(cameraId);
            alert.setCameraName(cameraName);
            alert.setImageFilename(det.getImageFilename());
            alert.setSnapshotUrl("/api/images/" + det.getImageFilename().replaceAll("[/\\\\]", ""));
            alert.setMessage("手动报警: " + zhType);
            alert.setConfidence(100.0);
            alertService.addAlert(alert);

            KanbanEventBus.publish("alerts", alertService.getAllAlerts());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("alertId", alert.getId());
            result.put("imageFilename", det.getImageFilename());
            result.put("snapshotUrl", alert.getSnapshotUrl());
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error("无效的 base64 数据: " + e.getMessage()));
        } catch (Exception e) {
            log.error("上传截图异常", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("上传失败: " + e.getMessage()));
        }
    }

    @PostMapping("/upload_training_resource")
    public ResponseEntity<ApiResponse<Map<String, Object>>> uploadTrainingResource(
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        try {
            if (file.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("文件为空"));
            }

            String originalName = file.getOriginalFilename();
            if (originalName == null) {
                return ResponseEntity.badRequest().body(ApiResponse.error("文件名为空"));
            }

            String ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();
            if (!ext.matches("\\.(mp4|avi|jpg|jpeg|png)")) {
                return ResponseEntity.badRequest().body(ApiResponse.error("仅支持 MP4/AVI/JPG/PNG 格式"));
            }

            String type = (ext.equals(".mp4") || ext.equals(".avi")) ? "video" : "image";
            String uniqueName = "training_" + System.currentTimeMillis() + ext;

            java.nio.file.Path dir = java.nio.file.Paths.get(appConfig.getFile().getUploadDir(), "training");
            java.nio.file.Files.createDirectories(dir);
            java.nio.file.Path target = dir.resolve(uniqueName);
            java.nio.file.Files.copy(file.getInputStream(), target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);

            log.info("训练素材已上传: {} -> {}", originalName, target);

            Map<String, Object> result = Map.of(
                "filename", uniqueName,
                "originalName", originalName,
                "size", file.getSize(),
                "type", type,
                "path", "/data/training/" + uniqueName
            );
            return ResponseEntity.ok(ApiResponse.success("上传成功", result));
        } catch (Exception e) {
            log.error("训练素材上传失败", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("上传失败: " + e.getMessage()));
        }
    }
}
