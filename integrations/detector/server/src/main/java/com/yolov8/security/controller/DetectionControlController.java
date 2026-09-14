package com.yolov8.security.controller;

import com.yolov8.security.config.DataCleanupTask;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.DetectionService;
import com.yolov8.security.service.FrameService;
import com.yolov8.security.service.PythonScriptService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 检测控制接口（启停、状态、清理、打开文件夹）
 */
@RestController
@RequestMapping("/api")
public class DetectionControlController {

    private static final Logger log = LoggerFactory.getLogger(DetectionControlController.class);

    private final PythonScriptService pythonScriptService;
    private final DataCleanupTask dataCleanupTask;
    private final DetectionService detectionService;
    private final FrameService frameService;

    public DetectionControlController(PythonScriptService pythonScriptService,
                                      DataCleanupTask dataCleanupTask,
                                      DetectionService detectionService,
                                      FrameService frameService) {
        this.pythonScriptService = pythonScriptService;
        this.dataCleanupTask = dataCleanupTask;
        this.detectionService = detectionService;
        this.frameService = frameService;
    }

    @PostMapping("/detection/start")
    public ResponseEntity<ApiResponse<Map<String, Object>>> startDetection() {
        try {
            Map<String, Object> result = pythonScriptService.startMonitoring();
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("Error starting detection", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("启动检测失败: " + e.getMessage()));
        }
    }

    @PostMapping("/detection/stop")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stopDetection() {
        try {
            Map<String, Object> result = pythonScriptService.stopMonitoring();
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("Error stopping detection", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("停止检测失败: " + e.getMessage()));
        }
    }

    @GetMapping("/detection/status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDetectionStatus() {
        try {
            boolean running = pythonScriptService.isRunning();
            return ResponseEntity.ok(ApiResponse.success(Map.of(
                    "running", running,
                    "frames", frameService.getCameraStats()
            )));
        } catch (Exception e) {
            log.error("Error getting detection status", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取检测状态失败: " + e.getMessage()));
        }
    }

    @PostMapping("/cleanup")
    public ResponseEntity<ApiResponse<Map<String, Object>>> cleanupOldFiles() {
        try {
            dataCleanupTask.cleanOldFiles();
            return ResponseEntity.ok(ApiResponse.success(Map.of("status", "success", "message", "Cleanup triggered")));
        } catch (Exception e) {
            log.error("Manual cleanup failed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/open_folder")
    public ResponseEntity<Map<String, Object>> openFolder(@RequestBody Map<String, String> request) {
        try {
            String folderType = request.get("folder_type");
            Map<String, Object> result = detectionService.openFolder(folderType);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error opening folder", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("status", "error", "message", "打开文件夹失败: " + e.getMessage()));
        }
    }
}
