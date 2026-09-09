package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.OnvifDiscoveryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class DiscoveryController {

    private final OnvifDiscoveryService discoveryService;

    public DiscoveryController(OnvifDiscoveryService discoveryService) {
        this.discoveryService = discoveryService;
    }

    @PostMapping("/discover")
    public ResponseEntity<ApiResponse<List<OnvifDiscoveryService.DiscoveredCamera>>> discover() {
        try {
            List<OnvifDiscoveryService.DiscoveredCamera> cameras = discoveryService.discover();
            return ResponseEntity.ok(ApiResponse.success(cameras));
        } catch (Exception e) {
            return ResponseEntity.ok(ApiResponse.success(List.of()));
        }
    }
}
