package com.yolov8.security.controller;

import com.yolov8.security.config.AppConfig;
import com.yolov8.security.util.AlertUtils;
import com.yolov8.security.model.Alert;
import com.yolov8.security.model.AuditLog;
import com.yolov8.security.service.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@RestController
@RequestMapping("/api/demo")
public class DemoController {

    private final AppConfig appConfig;
    private final DemoService demoService;
    private final DetectionService detectionService;
    private final AlertService alertService;
    private final AuditLogService auditLogService;

    public DemoController(AppConfig appConfig, DemoService demoService,
                          DetectionService detectionService, AlertService alertService,
                          AuditLogService auditLogService) {
        this.appConfig = appConfig;
        this.demoService = demoService;
        this.detectionService = detectionService;
        this.alertService = alertService;
        this.auditLogService = auditLogService;
    }

    @PostMapping("/trigger")
    public ResponseEntity<?> trigger() {
        if (!appConfig.isDemoMode()) {
            return ResponseEntity.notFound().build();
        }

        // Random behavior type
        ThreadLocalRandom tlr = ThreadLocalRandom.current();
        String behavior = DemoService.ACTION_TYPES[tlr.nextInt(DemoService.ACTION_TYPES.length)];

        // Random camera
        int camIdx = tlr.nextInt(DemoService.CAMERA_DEFS.length);
        String cameraId = DemoService.CAMERA_DEFS[camIdx][0];
        String cameraName = DemoService.CAMERA_DEFS[camIdx][1];

        // Generate detection data
        demoService.generateDetectionWithAction(behavior, cameraId, cameraName);
        detectionService.invalidateScanCache();

        // Create alert
        Alert alert = new Alert();
        alert.setType(behavior);
        alert.setLevel(AlertUtils.mapSeverity(behavior));
        alert.setTime(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(java.time.LocalDateTime.now()));
        alert.setSnapshotUrl("/api/images/frame_" + System.currentTimeMillis() + "_" + cameraId + ".jpg");
        alert.setStatus("pending");
        alert.setConfidence(90 + tlr.nextDouble() * 10);
        alert.setMessage("Demo触发：" + behavior);
        alert.setCameraName(cameraName);
        alert.setCameraId(cameraId);
        alert = alertService.addAlert(alert);

        // Create audit log
        AuditLog auditLog = new AuditLog();
        auditLog.setOperatorId("demo");
        auditLog.setOperatorName("系统");
        auditLog.setCategory("行为检测");
        auditLog.setAction("触发Demo检测：" + behavior);
        auditLog.setRiskLevel(AlertUtils.mapSeverity(behavior));
        auditLog.setStatus(true);
        auditLog.setMessage("Demo模式触发检测事件，摄像头：" + cameraName);
        auditLogService.addLog(auditLog);

        // Push SSE event
        Map<String, Object> eventData = new LinkedHashMap<>();
        eventData.put("behavior", behavior);
        eventData.put("cameraId", cameraId);
        eventData.put("cameraName", cameraName);
        eventData.put("alertId", alert.getId());
        KanbanEventBus.publish("demo_trigger", eventData);

        // Return response
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("behavior", behavior);
        response.put("camera", cameraName);
        response.put("alertId", alert.getId());
        return ResponseEntity.ok(response);
    }

}
