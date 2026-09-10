package com.yolov8.security.controller;

import com.yolov8.security.model.Alert;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.model.DetectionData;
import com.yolov8.security.service.AlertService;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.DetectionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 证据管理接口
 */
@RestController
@RequestMapping("/api")
public class EvidenceController {

    private static final Logger log = LoggerFactory.getLogger(EvidenceController.class);

    private final AlertService alertService;
    private final CameraConfigService cameraConfigService;
    private final DetectionService detectionService;

    public EvidenceController(AlertService alertService,
                              CameraConfigService cameraConfigService,
                              DetectionService detectionService) {
        this.alertService = alertService;
        this.cameraConfigService = cameraConfigService;
        this.detectionService = detectionService;
    }

    @GetMapping("/evidence/list")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getEvidenceList(
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String camera,
            @RequestParam(required = false) String type,
            @RequestParam(required = false, name = "actions_only") String actionsOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        try {
            if (size > 100) size = 100;
            if (size < 1) size = 20;
            List<DetectionData> allDetections = detectionService.getDetections();
            java.util.stream.Stream<DetectionData> stream = allDetections.stream();

            if (date != null && !date.isEmpty()) {
                String prefix = date;
                stream = stream.filter(d -> d.getTimestamp() != null && d.getTimestamp().startsWith(prefix));
            }
            if (camera != null && !camera.isEmpty()) {
                stream = stream.filter(d -> camera.equals(d.getCameraId()));
            }
            if (type != null && !type.isEmpty()) {
                stream = stream.filter(d -> d.getActions() != null && d.getActions().contains(type));
            }
            if (!"true".equals(actionsOnly)) {
                stream = stream.filter(d -> d.getImageFilename() != null);
            }

            List<DetectionData> filtered = stream
                .sorted((a, b) -> {
                    String ta = a.getTimestamp() != null ? a.getTimestamp() : "";
                    String tb = b.getTimestamp() != null ? b.getTimestamp() : "";
                    return tb.compareTo(ta);
                })
                .collect(Collectors.toList());
            int total = filtered.size();
            int from = Math.min(page * size, total);
            int to = Math.min(from + size, total);
            List<DetectionData> pageItems = filtered.subList(from, to);

            List<Map<String, Object>> items = new ArrayList<>();
            for (DetectionData det : pageItems) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", det.getId());
                item.put("timestamp", det.getTimestamp());
                item.put("actions", det.getActions());
                item.put("personCount", det.getPersonCount());
                item.put("cameraName", det.getCameraName());
                item.put("cameraId", det.getCameraId());
                item.put("imageFilename", det.getImageFilename());
                String safeFilename = det.getImageFilename() != null
                    ? det.getImageFilename().replaceAll("[/\\\\]", "")
                    : null;
                item.put("snapshotUrl", safeFilename != null ? "/api/images/" + safeFilename : null);
                item.put("confidence", det.getFps());
                items.add(item);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("items", items);
            result.put("total", total);
            result.put("page", page);
            result.put("size", size);
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("Error getting evidence list", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取证据列表失败: " + e.getMessage()));
        }
    }

    @GetMapping("/evidence/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getEvidenceStats() {
        try {
            List<Alert> alerts = alertService.getAllAlerts();
            int total = 0;
            int archived = 0;
            int critical = 0;
            for (Alert a : alerts) {
                if (a.getSnapshotUrl() != null && !a.getSnapshotUrl().isEmpty()) total++;
                if ("confirmed".equals(a.getStatus())) archived++;
                if ("critical".equals(a.getLevel())) critical++;
            }
            int onlineDevices = 0, totalDevices = 0;
            try {
                var cameras = cameraConfigService.getAllCameras();
                totalDevices = cameras.size();
                onlineDevices = (int) cameras.stream()
                    .filter(c -> (System.currentTimeMillis() - SystemMetricsController.getLastFrameUpdate()) < 30000)
                    .count();
            } catch (Exception ignored) {}
            double onlineRate = totalDevices > 0 ? Math.round((double) onlineDevices / totalDevices * 1000.0) / 10.0 : 0;

            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("total", total);
            stats.put("archived", archived);
            stats.put("critical", critical);
            stats.put("onlineRate", onlineRate);
            return ResponseEntity.ok(ApiResponse.success(stats));
        } catch (Exception e) {
            log.error("Error getting evidence stats", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取证据统计失败: " + e.getMessage()));
        }
    }
}
