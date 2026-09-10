package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.Go2rtcService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/streams")
public class StreamController {

    private final Go2rtcService go2rtcService;

    public StreamController(Go2rtcService go2rtcService) {
        this.go2rtcService = go2rtcService;
    }

    @GetMapping
    public ResponseEntity<?> getAllStreams() {
        try {
            if (!go2rtcService.isApiAvailable()) {
                return ResponseEntity.status(503).body(ApiResponse.error("go2rtc 未运行"));
            }
            return ResponseEntity.ok(ApiResponse.success(go2rtcService.getAllStreams()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/{id}/info")
    public ResponseEntity<?> getStreamInfo(@PathVariable String id) {
        try {
            return ResponseEntity.ok(ApiResponse.success(go2rtcService.getStreamInfo("cam_" + id)));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/status")
    public ResponseEntity<?> getStatus() {
        return ResponseEntity.ok(ApiResponse.success(Map.of(
            "running", go2rtcService.isRunning(),
            "apiAvailable", go2rtcService.isApiAvailable()
        )));
    }
}
