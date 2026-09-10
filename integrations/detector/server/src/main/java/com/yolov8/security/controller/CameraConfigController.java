package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.model.CameraConfigDTO;
import com.yolov8.security.service.CameraConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;

import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class CameraConfigController {

    private static final Logger log = LoggerFactory.getLogger(CameraConfigController.class);
    private final CameraConfigService cameraConfigService;
    @Value("${app.api-key:}")
    private String serviceApiKey;

    public CameraConfigController(CameraConfigService cameraConfigService) {
        this.cameraConfigService = cameraConfigService;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> invalidCameraRequest() {
        return ResponseEntity.badRequest().body(ApiResponse.error("摄像头配置无效"));
    }

    @GetMapping("/camera_config")
    public ResponseEntity<ApiResponse<List<CameraConfigDTO>>> getCameraConfig() {
        try {
            List<CameraConfigDTO> cameras = cameraConfigService.getAllCameras().stream()
                    .map(CameraConfigDTO::from).toList();
            return ResponseEntity.ok(ApiResponse.success(cameras));
        } catch (Exception e) {
            log.error("Error getting camera config");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("读取摄像头配置失败"));
        }
    }

    @GetMapping("/internal/camera_config")
    public ResponseEntity<ApiResponse<List<CameraConfigService.Camera>>> getPrivateCameraSources(
            @RequestHeader(value = "X-API-Key", required = false) String suppliedKey) {
        // Browser JWTs may manage display configuration, but cannot read machine source credentials.
        if (serviceApiKey == null || serviceApiKey.isBlank() || suppliedKey == null
                || !MessageDigest.isEqual(serviceApiKey.getBytes(StandardCharsets.UTF_8),
                suppliedKey.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).header("Cache-Control", "private, no-store")
                    .body(ApiResponse.error("Service authentication required"));
        }
        try {
            return ResponseEntity.ok().header("Cache-Control", "private, no-store")
                    .body(ApiResponse.success(cameraConfigService.getAllCameras()));
        } catch (Exception e) {
            log.error("Error reading private camera sources");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).header("Cache-Control", "private, no-store")
                    .body(ApiResponse.error("Unable to read camera sources"));
        }
    }

    @PostMapping("/camera_config")
    public ResponseEntity<ApiResponse<CameraConfigDTO>> addCamera(@RequestBody CameraConfigService.Camera camera) {
        try {
            CameraConfigService.Camera added = cameraConfigService.addCamera(camera);
            return ResponseEntity.ok(ApiResponse.success("摄像头已添加", CameraConfigDTO.from(added)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error("摄像头配置无效"));
        } catch (Exception e) {
            log.error("Error adding camera");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("添加摄像头失败"));
        }
    }

    @PutMapping("/camera_config/{id}")
    public ResponseEntity<ApiResponse<CameraConfigDTO>> updateCamera(
            @PathVariable String id, @RequestBody CameraConfigService.Camera camera) {
        try {
            CameraConfigService.Camera updated = cameraConfigService.updateCamera(id, camera);
            return ResponseEntity.ok(ApiResponse.success("摄像头已更新", CameraConfigDTO.from(updated)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error("摄像头配置无效"));
        } catch (Exception e) {
            log.error("Error updating camera");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("更新摄像头失败"));
        }
    }

    @DeleteMapping("/camera_config")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteAllCameras() {
        try {
            cameraConfigService.deleteAllCameras();
            return ResponseEntity.ok(ApiResponse.success("所有摄像头已清空", Map.of("deleted", true)));
        } catch (Exception e) {
            log.error("Error clearing cameras");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("清空摄像头失败"));
        }
    }

    @DeleteMapping("/camera_config/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteCamera(@PathVariable String id) {
        try {
            boolean deleted = cameraConfigService.deleteCamera(id);
            if (deleted) {
                return ResponseEntity.ok(ApiResponse.success("摄像头已删除", Map.of("deleted", true)));
            } else {
                return ResponseEntity.badRequest().body(ApiResponse.error("摄像头不存在"));
            }
        } catch (Exception e) {
            log.error("Error deleting camera");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("删除摄像头失败"));
        }
    }

    @PostMapping("/camera_config/batch")
    public ResponseEntity<ApiResponse<Map<String, Object>>> batchAddCameras(
            @RequestBody List<CameraConfigService.Camera> cameras) {
        int added = 0;
        List<String> errors = new ArrayList<>();
        for (CameraConfigService.Camera camera : cameras) {
            try {
                cameraConfigService.addCamera(camera);
                added++;
            } catch (Exception e) {
                errors.add((added + errors.size() + 1) + ": 添加摄像头失败");
            }
        }
        return ResponseEntity.ok(ApiResponse.success(Map.of(
            "added", added,
            "errors", errors
        )));
    }

    @PostMapping("/camera_config/test")
    public ResponseEntity<Map<String, Object>> testCameraConnection(@RequestBody Map<String, String> body) {
        String type = body.getOrDefault("type", "");
        String address = body.getOrDefault("address", "");

        if (address == null || address.isBlank()) {
            return ResponseEntity.ok(Map.of("reachable", false, "message", "地址不能为空"));
        }

        // SSRF 防护：对 http_snapshot 类型检查目标地址是否为内网 IP
        if ("http_snapshot".equals(type)) {
            try {
                URL url = new URL(address);
                InetAddress addr = InetAddress.getByName(url.getHost());
                if (isPrivateOrReservedIp(addr)) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("reachable", false, "message", "内网地址不允许测试连接"));
                }
            } catch (Exception e) {
                // 解析失败，继续执行后续逻辑（会在连接时报错）
            }
        }

        Map<String, Object> result;

        switch (type) {
            case "http_snapshot" -> {
                try {
                    URL url = new URL(address);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("HEAD");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    int code = conn.getResponseCode();
                    boolean reachable = code >= 200 && code < 400;
                    result = Map.of("reachable", reachable,
                            "message", reachable
                                    ? "HTTP连接成功 (HTTP " + code + ")"
                                    : "HTTP连接失败: HTTP " + code);
                } catch (Exception e) {
                    result = Map.of("reachable", false,
                            "message", "HTTP连接失败");
                }
            }
            case "rtsp" -> {
                boolean valid = address.startsWith("rtsp://");
                result = Map.of("reachable", valid,
                        "message", valid
                                ? "RTSP地址格式正确（完整测试需Python检测服务）"
                                : "RTSP地址格式无效");
            }
            case "usb" -> {
                boolean valid;
                try {
                    Integer.parseInt(address.trim());
                    valid = true;
                } catch (NumberFormatException e) {
                    valid = false;
                }
                result = Map.of("reachable", valid,
                        "message", valid
                                ? "USB设备索引有效（完整测试需Python检测服务）"
                                : "USB设备索引必须为数字");
            }
            default -> {
                result = Map.of("reachable", false,
                        "message", "未知摄像头类型");
            }
        }

        return ResponseEntity.ok(result);
    }

    /**
     * 检查给定 IP 地址是否为内网或保留地址（SSRF 防护）
     * 匹配: 192.0.2.1/8, 192.0.2.4/12, 192.0.2.5/16, 127.0.0.0/8, 169.254.0.0/16, ::1, link-local
     */
    public static boolean isPrivateOrReservedIp(InetAddress addr) {
        return addr.isLoopbackAddress()
                || addr.isSiteLocalAddress()
                || addr.isAnyLocalAddress()
                || addr.isLinkLocalAddress()
                || addr.isMulticastAddress();
    }
}
