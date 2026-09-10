package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.FrameService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * 帧更新 &amp; 其他通用 API
 */
@RestController
@RequestMapping("/api")
public class ApiController {

    private static final Logger log = LoggerFactory.getLogger(ApiController.class);
    private final FrameService frameService;
    private final Path uploadDir;

    public ApiController(FrameService frameService,
                         @Value("${app.file.upload-dir:./data}") String uploadDir) {
        this.frameService = frameService;
        this.uploadDir = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    // --- Settings endpoints 已迁移至 SettingsController ---

    @PostMapping(value = "/update_frame", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateFrame(
            @RequestParam("frame") MultipartFile frame,
            @RequestParam(value = "cam", required = false) String cam,
            @RequestParam(value = "person_count", required = false, defaultValue = "0") int personCount) {
        String camId = (cam == null || cam.isBlank()) ? "0" : cam.trim();
        try {
            byte[] frameBytes = frame.getBytes();
            if (frameBytes.length == 0) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(ApiResponse.error("空帧数据"));
            }
            frameService.updateFrame(frameBytes, camId);
            SystemMetricsController.notifyFrameReceived();
            log.debug("Frame updated successfully: cam={}, personCount={}, bytes={}",
                    camId, personCount, frameBytes.length);
            return ResponseEntity.ok(ApiResponse.success(Map.of(
                    "status", "ok",
                    "cam", camId,
                    "person_count", personCount,
                    "bytes", frameBytes.length
            )));
        } catch (IOException e) {
            log.error("Error updating frame", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("更新帧失败: " + e.getMessage()));
        }
    }
}
