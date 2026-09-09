package com.yolov8.security.controller;

import com.yolov8.security.model.Alert;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.AlertService;
import com.yolov8.security.service.KanbanEventBus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class AlertController {

    private final AlertService alertService;

    public AlertController(AlertService alertService) {
        this.alertService = alertService;
    }

    @GetMapping("/alerts")
    public ResponseEntity<ApiResponse<ApiResponse.PageData<Alert>>> getAlerts(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String since,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        try {
            if (size > 100) size = 100;
            if (size < 1) size = 20;
            ApiResponse.PageData<Alert> result = alertService.getAlertsPage(page, size, type, status, since);
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取告警列表失败: " + e.getMessage()));
        }
    }

    @GetMapping("/alerts/export")
    public ResponseEntity<byte[]> exportAlerts(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String since) {
        try {
            String csv = alertService.toCsv(type, status, since);
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=alerts.csv")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csv.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(("{\"status\":\"error\",\"message\":\"导出告警失败\"}").getBytes(StandardCharsets.UTF_8));
        }
    }

    @PostMapping("/alerts")
    public ResponseEntity<ApiResponse<Alert>> addAlert(@RequestBody Alert alert) {
        try {
            Alert added = alertService.addAlert(alert);
            KanbanEventBus.publish("alerts", alertService.getAllAlerts());
            return ResponseEntity.ok(ApiResponse.success("告警已创建", added));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("创建告警失败: " + e.getMessage()));
        }
    }

    @PatchMapping("/alerts/{id}")
    public ResponseEntity<ApiResponse<Void>> updateAlert(
            @PathVariable String id, @RequestBody Map<String, String> body) {
        try {
            String status = body.get("status");
            if (status == null || (!status.equals("confirmed") && !status.equals("ignored"))) {
                return ResponseEntity.badRequest().body(ApiResponse.error("status必须是confirmed或ignored"));
            }
            alertService.updateAlertStatus(id, status);
            KanbanEventBus.publish("alerts", alertService.getAllAlerts());
            return ResponseEntity.ok(ApiResponse.success("告警状态已更新", null));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("更新告警失败: " + e.getMessage()));
        }
    }
}
