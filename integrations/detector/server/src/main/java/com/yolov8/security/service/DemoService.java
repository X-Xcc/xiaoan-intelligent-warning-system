package com.yolov8.security.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.config.DemoProperties;
import com.yolov8.security.model.Alert;
import com.yolov8.security.model.AuditLog;
import com.yolov8.security.model.DetectionData;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class DemoService {

    private static final Logger log = LoggerFactory.getLogger(DemoService.class);

    public static final String[][] CAMERA_DEFS = {
        {"cam0", "A区监舍1号"}, {"cam1", "A区监舍2号"}, {"cam2", "A区监舍3号"}, {"cam3", "A区监舍4号"},
        {"cam4", "B区走廊1号"}, {"cam5", "B区走廊2号"}, {"cam6", "B区走廊3号"}, {"cam7", "B区走廊4号"},
        {"cam8", "C区工场1号"}, {"cam9", "C区工场2号"}, {"cam10", "C区工场3号"}, {"cam11", "C区工场4号"},
        {"cam12", "D区放风场1号"}, {"cam13", "D区放风场2号"}, {"cam14", "D区放风场3号"}, {"cam15", "D区放风场4号"}
    };

    // 行为类型概率权重 — 异常占 ~55%，让图表有足够数据
    public static final String[] ACTION_TYPES = {"人员聚集", "跌倒", "离岗", "打架"};
    private static final double[] ACTION_CUMULATIVE = {0.20, 0.38, 0.50, 0.55};
    // 正常 = 1 - 0.55 = 45%

    private static final DateTimeFormatter TS_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DemoProperties demoProperties;
    private final AppConfig appConfig;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private DetectionService detectionService;

    @Autowired(required = false)
    private ModelInfoService modelInfoService;

    @Autowired(required = false)
    private AlertService alertService;

    @Autowired(required = false)
    private AuditLogService auditLogService;

    public DemoService(DemoProperties demoProperties, AppConfig appConfig, ObjectMapper objectMapper) {
        this.demoProperties = demoProperties;
        this.appConfig = appConfig;
        this.objectMapper = objectMapper;
    }

    /**
     * 返回 16 路虚拟摄像头信息。
     */
    public List<Map<String, Object>> getVirtualCameras() {
        List<Map<String, Object>> cameras = new ArrayList<>();
        for (String[] def : CAMERA_DEFS) {
            Map<String, Object> cam = new LinkedHashMap<>();
            cam.put("id", def[0]);
            cam.put("name", def[1]);
            cam.put("type", "rtsp");
            cam.put("address", "rtsp://192.168.1." + (100 + cameras.size()) + ":554/stream");
            cam.put("status", "offline");
            cameras.add(cam);
        }
        return cameras;
    }

    /**
     * 按概率返回行为类型列表。空列表 = 正常。
     */
    public List<String> randomActions() {
        double roll = ThreadLocalRandom.current().nextDouble();
        for (int i = 0; i < ACTION_CUMULATIVE.length; i++) {
            if (roll < ACTION_CUMULATIVE[i]) {
                return List.of(ACTION_TYPES[i]);
            }
        }
        return Collections.emptyList();
    }

    /**
     * 生成一条随机检测数据 + 占位帧 JPEG，写入 dataDir。
     */
    public void generateDetection() {
        int camIdx = ThreadLocalRandom.current().nextInt(CAMERA_DEFS.length);
        String[] cam = CAMERA_DEFS[camIdx];
        List<String> actions = randomActions();
        generateDetectionWithAction(actions.isEmpty() ? null : actions.get(0), cam[0], cam[1]);
    }

    /**
     * 指定行为类型的检测数据生成。
     */
    public void generateDetectionWithAction(String action, String cameraId, String cameraName) {
        try {
            Path dataDir = Paths.get(appConfig.getFile().getUploadDir());
            Files.createDirectories(dataDir);

            long now = System.currentTimeMillis();
            String ts = TS_FORMAT.format(java.time.LocalDateTime.now());
            String id = "det_demo_" + now + "_" + UUID.randomUUID().toString().substring(0, 6);
            String imageFilename = "frame_" + now + "_" + cameraId + ".jpg";

            List<String> actions;
            if (action != null && !action.isEmpty()) {
                actions = List.of(action);
            } else {
                actions = Collections.emptyList();
            }

            int personCount = actions.isEmpty() ? ThreadLocalRandom.current().nextInt(1, 5)
                    : ThreadLocalRandom.current().nextInt(1, 6);

            List<Map<String, Object>> boxes = new ArrayList<>();
            for (int i = 0; i < personCount; i++) {
                Map<String, Object> box = new LinkedHashMap<>();
                int x = ThreadLocalRandom.current().nextInt(50, 500);
                int y = ThreadLocalRandom.current().nextInt(50, 350);
                int w = ThreadLocalRandom.current().nextInt(80, 160);
                int h = ThreadLocalRandom.current().nextInt(120, 220);
                box.put("x", x);
                box.put("y", y);
                box.put("width", w);
                box.put("height", h);
                box.put("confidence", Math.round((75 + ThreadLocalRandom.current().nextDouble() * 20) * 100.0) / 100.0);
                box.put("class", "person");
                boxes.add(box);
            }

            DetectionData detection = new DetectionData();
            detection.setId(id);
            detection.setTimestamp(ts);
            detection.setActions(actions);
            detection.setPersonCount(personCount);
            detection.setFilename("detection_" + now + "_" + cameraId + ".json");
            detection.setImageFilename(imageFilename);
            detection.setFrameCount(ThreadLocalRandom.current().nextInt(100, 9999));
            detection.setFps(Math.round((25 + ThreadLocalRandom.current().nextDouble() * 10) * 10.0) / 10.0);
            detection.setBoxes(boxes);
            detection.setCameraName(cameraName);
            detection.setCameraId(cameraId);

            // Write JSON
            Path jsonPath = dataDir.resolve(detection.getFilename());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(jsonPath.toFile(), detection);

            // Write placeholder frame
            generatePlaceholderFrame(imageFilename, cameraName, now);

            log.debug("Demo detection generated: {} @ {}", action != null ? action : "正常", cameraName);
        } catch (Exception e) {
            log.error("Failed to generate demo detection", e);
        }
    }

    /**
     * 绘制 640x480 占位图并保存为 JPEG。
     */
    public void generatePlaceholderFrame(String filename, String cameraName, long timestamp) {
        try {
            BufferedImage image = new BufferedImage(640, 480, BufferedImage.TYPE_INT_RGB);
            Graphics2D g2d = image.createGraphics();
            g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            // 深灰背景
            g2d.setColor(new Color(30, 30, 30));
            g2d.fillRect(0, 0, 640, 480);

            // 网格线
            g2d.setColor(new Color(50, 50, 50));
            for (int i = 0; i < 640; i += 40) g2d.drawLine(i, 0, i, 480);
            for (int i = 0; i < 480; i += 40) g2d.drawLine(0, i, 640, i);

            // NO SIGNAL
            g2d.setColor(new Color(180, 180, 180));
            g2d.setFont(new Font("Consolas", Font.BOLD, 36));
            String noSignal = "NO SIGNAL";
            int sw = g2d.getFontMetrics().stringWidth(noSignal);
            g2d.drawString(noSignal, (640 - sw) / 2, 200);

            // 摄像头名称
            g2d.setFont(new Font("Microsoft YaHei", Font.PLAIN, 20));
            int nw = g2d.getFontMetrics().stringWidth(cameraName);
            g2d.drawString(cameraName, (640 - nw) / 2, 240);

            // 时间戳
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            String timeStr = sdf.format(new Date(timestamp));
            g2d.setFont(new Font("Consolas", Font.PLAIN, 16));
            int tw = g2d.getFontMetrics().stringWidth(timeStr);
            g2d.drawString(timeStr, (640 - tw) / 2, 280);

            g2d.dispose();

            // Save as JPEG with quality ~0.5 (via default ImageIO settings)
            Path dataDir = Paths.get(appConfig.getFile().getUploadDir());
            Path imagePath = dataDir.resolve(filename);
            ImageIO.write(image, "jpg", imagePath.toFile());
        } catch (IOException e) {
            log.error("Failed to generate placeholder frame: {}", filename, e);
        }
    }

    /**
     * 启动时生成 24 小时的历史检测数据，让趋势图有合理的分布。
     */
    @PostConstruct
    public void seedHistoricalData() {
        if (!demoProperties.isEnabled()) return;

        Path dataDir = Paths.get(appConfig.getFile().getUploadDir());
        try {
            Files.createDirectories(dataDir);
        } catch (IOException e) {
            log.error("Cannot create data dir", e);
            return;
        }

        log.info("Demo mode: seeding 200 historical detections across 24 hours...");
        LocalDateTime now = LocalDateTime.now();
        ThreadLocalRandom rng = ThreadLocalRandom.current();

        for (int i = 0; i < 200; i++) {
            // Spread across last 24 hours, more data in recent hours
            int minutesAgo = rng.nextInt(0, 24 * 60);
            LocalDateTime ts = now.minusMinutes(minutesAgo);
            String tsStr = TS_FORMAT.format(ts);
            long epochMs = ts.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();

            int camIdx = rng.nextInt(CAMERA_DEFS.length);
            String[] cam = CAMERA_DEFS[camIdx];
            List<String> actions = randomActions();
            int personCount = actions.isEmpty() ? rng.nextInt(1, 5) : rng.nextInt(1, 8);

            String id = "det_demo_" + epochMs + "_" + UUID.randomUUID().toString().substring(0, 6);
            String filename = "detection_" + epochMs + "_" + cam[0] + ".json";

            DetectionData det = new DetectionData();
            det.setId(id);
            det.setTimestamp(tsStr);
            det.setActions(actions);
            det.setPersonCount(personCount);
            det.setFilename(filename);
            det.setImageFilename("frame_" + epochMs + "_" + cam[0] + ".jpg");
            det.setFrameCount(rng.nextInt(100, 9999));
            det.setFps(Math.round((25 + rng.nextDouble() * 10) * 10.0) / 10.0);
            det.setBoxes(Collections.emptyList());
            det.setCameraName(cam[1]);
            det.setCameraId(cam[0]);

            try {
                objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(dataDir.resolve(filename).toFile(), det);
            } catch (IOException e) {
                log.warn("Failed to write historical detection {}", filename);
            }

            // Create alerts for detections with abnormal actions
            if (!actions.isEmpty() && alertService != null) {
                String imgFile = det.getImageFilename();
                Alert alert = new Alert();
                alert.setType(actions.get(0));
                alert.setLevel(rng.nextDouble() < 0.3 ? "high" : (rng.nextDouble() < 0.6 ? "medium" : "low"));
                alert.setTime(tsStr);
                alert.setCameraName(cam[1]);
                alert.setCameraId(cam[0]);
                alert.setConfidence(Math.round((75 + rng.nextDouble() * 20) * 100.0) / 100.0);
                alert.setMessage(cam[1] + " 检测到" + actions.get(0) + "行为");
                alert.setStatus(rng.nextDouble() < 0.7 ? "resolved" : "pending");
                alert.setImageFilename(imgFile);
                alert.setSnapshotUrl("/api/images/" + imgFile);
                alertService.addAlert(alert);
            }

            // Create audit logs for some detections
            if (auditLogService != null && rng.nextDouble() < 0.4) {
                AuditLog auditEntry = new AuditLog();
                auditEntry.setOperatorId("system");
                auditEntry.setOperatorName("系统");
                auditEntry.setCategory("检测");
                auditEntry.setAction(actions.isEmpty() ? "正常巡检" : actions.get(0) + "告警");
                auditEntry.setRiskLevel(actions.isEmpty() ? "low" : (rng.nextDouble() < 0.3 ? "high" : "medium"));
                auditEntry.setMessage(cam[1] + (actions.isEmpty() ? " 正常" : " 检测到" + actions.get(0)));
                auditEntry.setTimestamp(tsStr);
                auditLogService.addLog(auditEntry);
            }
        }

        if (detectionService != null) {
            detectionService.invalidateScanCache();
        }
        log.info("Demo mode: 200 historical detections seeded.");
    }

    /**
     * 定时任务：定时生成虚拟检测数据。
     */
    @Scheduled(fixedDelayString = "${app.demo.detection-interval-ms:6000}", initialDelay = 3000)
    public void scheduledGeneration() {
        if (!demoProperties.isEnabled()) {
            return;
        }
        generateDetection();
        if (detectionService != null) {
            detectionService.invalidateScanCache();
        }
        // Keep model info "online" in demo mode (prevents 5-min timeout)
        if (modelInfoService != null) {
            modelInfoService.updateModelInfo(Map.of(
                "precision", "FP16",
                "device", "GPU",
                "model_size_mb", 6.2,
                "total_layers", 128,
                "conv_layers", 64,
                "quantized_layers", 32,
                "gpu_available", true,
                "half_precision", true
            ));
        }
    }
}
