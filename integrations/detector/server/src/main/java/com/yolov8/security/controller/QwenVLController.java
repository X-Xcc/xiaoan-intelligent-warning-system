package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.QwenVLService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class QwenVLController {

    private static final Logger log = LoggerFactory.getLogger(QwenVLController.class);
    private final QwenVLService qwenVLService;

    public QwenVLController(QwenVLService qwenVLService) {
        this.qwenVLService = qwenVLService;
    }

    /**
     * 检查 AI 服务状态
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        boolean isHealthy = qwenVLService.isHealthy();
        Map<String, Object> result = new HashMap<>();
        result.put("status", isHealthy ? "online" : "offline");
        result.put("message", isHealthy ? "AI 服务正常运行" : "AI 服务未启动或模型未加载");
        return ResponseEntity.ok(result);
    }

    /**
     * 分析图片（Base64）
     */
    @PostMapping("/analyze")
    public ResponseEntity<?> analyzeImage(@RequestBody Map<String, String> request) {
        try {
            String base64Image = request.get("image");
            String prompt = request.getOrDefault("prompt", "描述这张图片");

            if (base64Image == null || base64Image.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("缺少图片数据"));
            }

            // 限制 base64 大小 (~10MB 原图，14MB base64)
            if (base64Image.length() > 14_000_000) {
                return ResponseEntity.status(413).body(ApiResponse.error("图片数据过大，最大支持 10MB"));
            }

            String result = qwenVLService.analyzeImage(base64Image, prompt);

            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("result", result);
            response.put("prompt", prompt);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("分析图片失败", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * 分析检测到的安全图片
     */
    @PostMapping("/analyze-security")
    public ResponseEntity<?> analyzeSecurityImage(@RequestBody Map<String, Object> request) {
        try {
            String imagePath = (String) request.get("imagePath");
            @SuppressWarnings("unchecked")
            List<String> actions = (List<String>) request.get("actions");

            if (imagePath == null || imagePath.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("缺少图片路径"));
            }

            String result = qwenVLService.analyzeSecurityImage(imagePath, actions);

            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("result", result);
            response.put("imagePath", imagePath);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("分析安全图片失败", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * 批量分析图片
     */
    @PostMapping("/batch-analyze")
    public ResponseEntity<?> batchAnalyzeImages(@RequestBody Map<String, Object> request) {
        try {
            @SuppressWarnings("unchecked")
            List<String> images = (List<String>) request.get("images");
            String prompt = (String) request.getOrDefault("prompt", "描述这张图片");

            if (images == null || images.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("缺少图片数据"));
            }

            // 限制批量数量
            if (images.size() > 10) {
                return ResponseEntity.badRequest().body(ApiResponse.error("批量分析最多支持 10 张图片"));
            }

            // 限制每张图片大小
            for (int i = 0; i < images.size(); i++) {
                if (images.get(i) != null && images.get(i).length() > 14_000_000) {
                    return ResponseEntity.status(413)
                        .body(ApiResponse.error("第 " + (i + 1) + " 张图片数据过大，最大支持 10MB"));
                }
            }

            List<Map<String, Object>> results = qwenVLService.batchAnalyzeImages(images, prompt);

            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("results", results);
            response.put("total", images.size());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("批量分析图片失败", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }
}
