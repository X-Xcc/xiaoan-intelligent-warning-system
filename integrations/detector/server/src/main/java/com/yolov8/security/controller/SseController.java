package com.yolov8.security.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.model.CameraConfigDTO;
import com.yolov8.security.service.AlertService;
import com.yolov8.security.service.AuditLogService;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.DetectionService;
import com.yolov8.security.service.FrameService;
import com.yolov8.security.service.KanbanEventBus;
import com.yolov8.security.util.SystemMetricsCollector;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;

@RestController
public class SseController {

    private static final Logger log = LoggerFactory.getLogger(SseController.class);
    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();
    private final ObjectMapper objectMapper;
    private final ObjectMapper compactMapper;
    private final CameraConfigService cameraConfigService;
    private final AlertService alertService;
    private final AuditLogService auditLogService;
    private final DetectionService detectionService;
    private final FrameService frameService;
    private final AppConfig appConfig;
    private final ScheduledExecutorService scheduler;
    private final BiConsumer<String, Object> eventSubscriber = this::broadcast;

    public SseController(ObjectMapper objectMapper, CameraConfigService cameraConfigService,
                         AlertService alertService, AuditLogService auditLogService,
                         DetectionService detectionService, FrameService frameService,
                         AppConfig appConfig) {
        this.objectMapper = objectMapper;
        this.compactMapper = objectMapper.copy();
        this.compactMapper.disable(com.fasterxml.jackson.databind.SerializationFeature.INDENT_OUTPUT);
        this.cameraConfigService = cameraConfigService;
        this.alertService = alertService;
        this.auditLogService = auditLogService;
        this.detectionService = detectionService;
        this.frameService = frameService;
        this.appConfig = appConfig;

        // Subscribe to event bus
        KanbanEventBus.subscribe(eventSubscriber);

        // Periodic system_metrics + camera_stats push (2s)
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sse-metrics-pusher");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(() -> {
            try {
                var metrics = collectSystemMetrics();
                broadcast("system_metrics", metrics);
                broadcast("camera_stats", frameService.getCameraStats());
            } catch (Exception e) { log.debug("SSE metrics push failed", e); }
        }, 2, 2, TimeUnit.SECONDS);
    }

    @PreDestroy
    public void destroy() {
        KanbanEventBus.unsubscribe(eventSubscriber);
        emitters.forEach(SseEmitter::complete);
        emitters.clear();
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
        }
    }

    @GetMapping(value = "/api/sse/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError((e) -> emitters.remove(emitter));

        // Send initial data snapshot
        try {
            sendEvent(emitter, "cameras", cameraConfigService.getAllCameras());
            sendEvent(emitter, "alerts", alertService.getAllAlerts());
            sendEvent(emitter, "audit_logs", auditLogService.getAllLogs());
            sendEvent(emitter, "system_metrics", collectSystemMetrics());
        } catch (Exception e) {
            emitter.completeWithError(new IllegalStateException("Unable to initialize event stream"));
        }

        return emitter;
    }

    private void broadcast(String eventType, Object data) {
        String json;
        try {
            json = serializeEventData(eventType, data);
        } catch (Exception e) {
            log.debug("SSE broadcast serialization error");
            return;
        }
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name(eventType).data(json));
            } catch (IOException e) {
                emitters.remove(emitter);
            }
        }
    }

    private void sendEvent(SseEmitter emitter, String eventType, Object data) throws IOException {
        String json = serializeEventData(eventType, data);
        emitter.send(SseEmitter.event().name(eventType).data(json));
    }

    private String serializeEventData(String eventType, Object data) throws JsonProcessingException {
        if ("cameras".equals(eventType)) {
            // Normalize event-bus maps/JSON trees too, so alternate representations cannot leak secrets.
            List<CameraConfigService.Camera> cameras = compactMapper.convertValue(
                    data, new TypeReference<List<CameraConfigService.Camera>>() {});
            data = cameras.stream().map(CameraConfigDTO::from).toList();
        }
        return compactMapper.writeValueAsString(data);
    }

    @SuppressWarnings("all")
    private Map<String, Object> collectSystemMetrics() {
        // Demo mode: return virtual random metrics
        if (appConfig.isDemoMode()) {
            ThreadLocalRandom tlr = ThreadLocalRandom.current();
            Map<String, Object> m = SystemMetricsCollector.collectSystemMetrics();
            m.put("cpuPercent", 35 + tlr.nextInt(31));
            m.put("memoryPercent", 45 + tlr.nextInt(26));
            m.put("gpuPercent", 30 + tlr.nextInt(26));
            m.put("diskPercent", 42);
            m.put("totalDevices", 16);
            m.put("onlineDevices", tlr.nextInt(3));
            m.put("activeModels", 1);
            m.put("totalModels", 1);
            m.put("version", "v2.4.1-stable");
            m.put("engine", "Spring Boot + YOLOv8 (Demo)");
            m.put("coreEngine", "YOLOv8n-Pose");
            m.put("services", List.of(
                Map.of("name", "API Server", "status", "Running", "uptime", "-", "health", "正常"),
                Map.of("name", "YOLOv8 Service", "status", "Running", "uptime", "-", "health", "正常"),
                Map.of("name", "Stream Gateway", "status", "Running", "uptime", "-", "health", "正常")
            ));
            try {
                var sysInfo = detectionService.getSystemInfo();
                m.put("dataDirSizeMb", sysInfo.dataDirSizeMb());
                m.put("detectionCount", sysInfo.detectionCount());
                m.put("imageCount", sysInfo.imageCount());
            } catch (Exception e) {
                m.put("dataDirSizeMb", 0);
                m.put("detectionCount", 0);
                m.put("imageCount", 0);
            }
            return m;
        }

        // Real mode
        Map<String, Object> m = SystemMetricsCollector.collectSystemMetrics();
        m.put("gpuPercent", SystemMetricsController.getLatestGpuPercent());
        m.put("version", "v2.4.1-stable");
        m.put("engine", "Spring Boot + YOLOv8");
        m.put("coreEngine", "YOLOv8n-Pose");

        try {
            var cameras = cameraConfigService.getAllCameras();
            m.put("totalDevices", cameras.size());
            boolean yoloActive = (System.currentTimeMillis() - SystemMetricsController.getLastFrameUpdate()) < 30000;
            m.put("onlineDevices", yoloActive ? cameras.size() : 0);
        } catch (Exception e) {
            m.put("totalDevices", 0);
            m.put("onlineDevices", 0);
        }
        m.put("activeModels", 1);
        m.put("totalModels", 1);

        try {
            var sysInfo = detectionService.getSystemInfo();
            m.put("dataDirSizeMb", sysInfo.dataDirSizeMb());
            m.put("detectionCount", sysInfo.detectionCount());
            m.put("imageCount", sysInfo.imageCount());
        } catch (Exception e) {
            m.put("dataDirSizeMb", 0);
            m.put("detectionCount", 0);
            m.put("imageCount", 0);
        }

        boolean yoloHealthy = (System.currentTimeMillis() - SystemMetricsController.getLastFrameUpdate()) < 30000;
        m.put("services", List.of(
            Map.of("name", "API Server", "status", "Running", "uptime", "-", "health", "正常"),
            Map.of("name", "YOLOv8 Service", "status", yoloHealthy ? "Running" : "Warning",
                    "uptime", "-", "health", yoloHealthy ? "正常" : "异常"),
            Map.of("name", "Stream Gateway", "status", "Running", "uptime", "-", "health", "正常")
        ));

        return m;
    }
}
