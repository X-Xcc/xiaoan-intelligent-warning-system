package com.yolov8.security.controller;

import com.yolov8.security.model.Alert;
import com.yolov8.security.model.AuditLog;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.AlertService;
import com.yolov8.security.service.AuditLogService;
import com.yolov8.security.service.KanbanEventBus;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuditLogController {

    private final AuditLogService auditLogService;
    private final AlertService alertService;

    public AuditLogController(AuditLogService auditLogService, AlertService alertService) {
        this.auditLogService = auditLogService;
        this.alertService = alertService;
    }

    @GetMapping("/audit_logs")
    public ResponseEntity<ApiResponse<ApiResponse.PageData<AuditLog>>> getLogs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String riskLevel,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        try {
            if (size > 100) size = 100;
            if (size < 1) size = 20;
            ApiResponse.PageData<AuditLog> result = auditLogService.getLogsPage(page, size, search, category, riskLevel);
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取审计日志列表失败: " + e.getMessage()));
        }
    }

    @GetMapping("/audit_logs/export")
    public ResponseEntity<byte[]> exportLogs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String riskLevel) {
        try {
            String csv = auditLogService.toCsv(search, category, riskLevel);
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=audit_logs.csv")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csv.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(("{\"status\":\"error\",\"message\":\"导出审计日志失败\"}").getBytes(StandardCharsets.UTF_8));
        }
    }

    @GetMapping("/audit_logs/trend")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTrend(
            @RequestParam(defaultValue = "day") String range) {
        try {
            Map<String, Object> trend = auditLogService.getTrendData(range);
            return ResponseEntity.ok(ApiResponse.success(trend));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取审计趋势失败: " + e.getMessage()));
        }
    }

    @PostMapping("/audit_logs")
    public ResponseEntity<ApiResponse<AuditLog>> addAuditLog(@RequestBody AuditLog log) {
        try {
            AuditLog added = auditLogService.addLog(log);
            KanbanEventBus.publish("audit_logs", auditLogService.getAllLogs());
            return ResponseEntity.ok(ApiResponse.success("审计日志已创建", added));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("创建审计日志失败: " + e.getMessage()));
        }
    }

    @GetMapping("/audit_logs/automation_rate")
    public ResponseEntity<Map<String, Double>> getAutomationRate() {
        try {
            List<Alert> allAlerts = alertService.getAllAlerts();
            double rate = 0.0;
            if (!allAlerts.isEmpty()) {
                long autoConfirmed = allAlerts.stream()
                        .filter(a -> "auto_confirmed".equals(a.getStatus()))
                        .count();
                rate = Math.round((double) autoConfirmed / allAlerts.size() * 1000.0) / 10.0;
            }
            return ResponseEntity.ok(Map.of("rate", rate));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("rate", 0.0));
        }
    }
}
