package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.DetectionService;
import com.yolov8.security.util.SystemMetricsCollector;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SystemMetricsController {

    private static volatile double latestGpuPercent = 0;
    private static volatile long lastFrameUpdate = 0;

    private final CameraConfigService cameraConfigService;
    private final DetectionService detectionService;

    public SystemMetricsController(CameraConfigService cameraConfigService, DetectionService detectionService) {
        this.cameraConfigService = cameraConfigService;
        this.detectionService = detectionService;
    }

    public static void updateGpuPercent(double gpuPercent) {
        latestGpuPercent = gpuPercent;
    }

    public static void notifyFrameReceived() {
        lastFrameUpdate = System.currentTimeMillis();
    }

    public static double getLatestGpuPercent() { return latestGpuPercent; }
    public static long getLastFrameUpdate() { return lastFrameUpdate; }

    @GetMapping("/system_metrics")
    public ApiResponse<Map<String, Object>> getMetrics() {
        Map<String, Object> m = SystemMetricsCollector.collectSystemMetrics();
        m.put("gpuPercent", latestGpuPercent);

        boolean yoloHealthy = (System.currentTimeMillis() - lastFrameUpdate) < 30000;
        m.put("services", List.of(
            Map.of("name", "API Server", "status", "Running"),
            Map.of("name", "YOLOv8 Service", "status", yoloHealthy ? "Running" : "Warning"),
            Map.of("name", "Stream Gateway", "status", "Running")
        ));
        m.put("version", "v2.4.1-stable");
        m.put("engine", "YOLOv8n-Pose");
        m.put("coreEngine", "TensorRT 8.6");

        try {
            var cameras = cameraConfigService.getAllCameras();
            m.put("totalDevices", cameras.size());
            long onlineCount = cameras.stream()
                .filter(c -> (System.currentTimeMillis() - lastFrameUpdate) < 30000)
                .count();
            m.put("onlineDevices", (int) onlineCount);
        } catch (Exception e) {
            m.put("totalDevices", 0);
            m.put("onlineDevices", 0);
        }
        m.put("activeModels", 1);
        m.put("totalModels", 1);

        try {
            var sysInfo = detectionService.getSystemInfo();
            m.put("dataDirSizeMb", sysInfo.dataDirSizeMb());
            m.put("detectionCount", sysInfo.detectionCount());
            m.put("imageCount", sysInfo.imageCount());
        } catch (Exception e) {
            m.put("dataDirSizeMb", 0);
            m.put("detectionCount", 0);
            m.put("imageCount", 0);
        }

        return ApiResponse.success(m);
    }
}
