package com.yolov8.security.controller;

import com.yolov8.security.model.AnnotationData;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.AnnotationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/annotations")
public class AnnotationController {

    private static final Logger log = LoggerFactory.getLogger(AnnotationController.class);
    private final AnnotationService annotationService;

    public AnnotationController(AnnotationService annotationService) {
        this.annotationService = annotationService;
    }

    // Non-param routes first to avoid Spring MVC collision with {imageFilename}

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStats() {
        try {
            Map<String, Object> stats = annotationService.getStats();
            return ResponseEntity.ok(ApiResponse.success(stats));
        } catch (Exception e) {
            log.error("Error getting annotation stats", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取标注统计失败: " + e.getMessage()));
        }
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "yolo") String format) {
        try {
            byte[] data;
            String filename;
            String contentType;

            if ("coco".equalsIgnoreCase(format)) {
                data = annotationService.exportCoco();
                filename = "annotations_coco.json";
                contentType = "application/json";
            } else {
                data = annotationService.exportYolo();
                filename = "annotations_yolo.zip";
                contentType = "application/zip";
            }

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                    .body(data);
        } catch (Exception e) {
            log.error("Error exporting annotations", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(("{\"status\":\"error\",\"message\":\"导出标注失败: " + e.getMessage().replace("\"", "'") + "\"}").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<ApiResponse<Map<String, String>>> uploadImage(@RequestParam("file") MultipartFile file) {
        try {
            String filename = annotationService.uploadImage(file);
            return ResponseEntity.ok(ApiResponse.success("上传成功", Map.of("filename", filename)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error uploading image", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("上传失败: " + e.getMessage()));
        }
    }

    @GetMapping("/images")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getImageList() {
        try {
            List<Map<String, Object>> images = annotationService.getImageList();
            return ResponseEntity.ok(ApiResponse.success(images));
        } catch (Exception e) {
            log.error("Error getting image list", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取图片列表失败: " + e.getMessage()));
        }
    }

    // Param routes after non-param routes

    @GetMapping
    public ResponseEntity<ApiResponse<List<AnnotationData>>> getAll() {
        try {
            List<AnnotationData> all = annotationService.getAll();
            return ResponseEntity.ok(ApiResponse.success(all));
        } catch (Exception e) {
            log.error("Error getting all annotations", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取标注列表失败: " + e.getMessage()));
        }
    }

    @GetMapping("/{imageFilename}")
    public ResponseEntity<ApiResponse<AnnotationData>> getByImageFilename(@PathVariable String imageFilename) {
        try {
            AnnotationData data = annotationService.getByImageFilename(imageFilename);
            if (data == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(ApiResponse.error("标注不存在: " + imageFilename));
            }
            return ResponseEntity.ok(ApiResponse.success(data));
        } catch (Exception e) {
            log.error("Error getting annotation for {}", imageFilename, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取标注失败: " + e.getMessage()));
        }
    }

    @PutMapping("/{imageFilename}")
    public ResponseEntity<ApiResponse<AnnotationData>> save(
            @PathVariable String imageFilename, @RequestBody AnnotationData data) {
        try {
            data.setImageFilename(imageFilename);
            AnnotationData saved = annotationService.save(data);
            return ResponseEntity.ok(ApiResponse.success("标注已保存", saved));
        } catch (Exception e) {
            log.error("Error saving annotation for {}", imageFilename, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("保存标注失败: " + e.getMessage()));
        }
    }

    @DeleteMapping("/{imageFilename}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> delete(@PathVariable String imageFilename) {
        try {
            boolean deleted = annotationService.delete(imageFilename);
            if (deleted) {
                return ResponseEntity.ok(ApiResponse.success("标注已删除", Map.of("deleted", true)));
            } else {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(ApiResponse.error("标注不存在: " + imageFilename));
            }
        } catch (Exception e) {
            log.error("Error deleting annotation for {}", imageFilename, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("删除标注失败: " + e.getMessage()));
        }
    }
}
