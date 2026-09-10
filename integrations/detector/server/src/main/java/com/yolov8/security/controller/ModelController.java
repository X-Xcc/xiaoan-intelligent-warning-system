package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.ModelInfoService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 模型信息与 GPU 状态接口
 */
@RestController
@RequestMapping("/api")
public class ModelController {

    private static final Logger log = LoggerFactory.getLogger(ModelController.class);

    private final ModelInfoService modelInfoService;

    public ModelController(ModelInfoService modelInfoService) {
        this.modelInfoService = modelInfoService;
    }

    @PostMapping("/model_info")
    public ResponseEntity<Map<String, Object>> updateModelInfo(@RequestBody Map<String, Object> modelInfo) {
        try {
            modelInfoService.updateModelInfo(modelInfo);
            return ResponseEntity.ok(Map.of("status", "success", "message", "Model info updated"));
        } catch (Exception e) {
            log.error("Error updating model info", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("status", "error", "message", "更新模型信息失败: " + e.getMessage()));
        }
    }

    @GetMapping("/model_info")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getModelInfo() {
        try {
            Map<String, Object> modelInfo = modelInfoService.getModelInfo();
            return ResponseEntity.ok(ApiResponse.success(modelInfo));
        } catch (Exception e) {
            log.error("Error getting model info", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取模型信息失败: " + e.getMessage()));
        }
    }

    @PostMapping("/gpu_status")
    public ResponseEntity<Map<String, Object>> updateGpuStatus(@RequestBody Map<String, Object> gpuData) {
        try {
            Object gpuPercent = gpuData.get("gpuPercent");
            if (gpuPercent instanceof Number) {
                SystemMetricsController.updateGpuPercent(((Number) gpuPercent).doubleValue());
            }
            return ResponseEntity.ok(Map.of("status", "success"));
        } catch (Exception e) {
            log.error("Error updating GPU status", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("status", "error", "message", "更新 GPU 状态失败: " + e.getMessage()));
        }
    }
}
