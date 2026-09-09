package com.yolov8.security.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.util.CsvEscaper;
import com.yolov8.security.util.JsonFileUtils;
import com.yolov8.security.model.Alert;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.model.DetectionData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class AlertService {

    private static final Logger log = LoggerFactory.getLogger(AlertService.class);
    private static final TypeReference<List<Alert>> TYPE_REF = new TypeReference<>() {};
    private static final DateTimeFormatter DET_TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final Path filePath;
    private final ObjectMapper objectMapper;
    private final ReadWriteLock lock = JsonFileUtils.newLock();

    @Autowired
    public AlertService(AppConfig appConfig, ObjectMapper objectMapper) {
        this.filePath = Paths.get(appConfig.getFile().getUploadDir()).resolve("alerts.json");
        this.objectMapper = objectMapper;
        JsonFileUtils.cleanupTmp(filePath);
    }

    private List<Alert> read() {
        return JsonFileUtils.readList(filePath, objectMapper, TYPE_REF);
    }

    private void write(List<Alert> data) {
        JsonFileUtils.writeList(filePath, data, objectMapper);
    }

    public List<Alert> getAllAlerts() {
        lock.readLock().lock();
        try {
            return read().stream()
                    .sorted(Comparator.comparing(Alert::getTime, Comparator.nullsLast(Comparator.reverseOrder())))
                    .collect(Collectors.toList());
        } finally {
            lock.readLock().unlock();
        }
    }

    public Alert addAlert(Alert alert) {
        lock.writeLock().lock();
        try {
            List<Alert> alerts = read();
            alert.setId("ALERT_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 6));
            if (alert.getStatus() == null) {
                alert.setStatus("pending");
            }
            alerts.add(alert);
            write(alerts);
            return alert;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void updateAlertStatus(String id, String status) {
        lock.writeLock().lock();
        try {
            List<Alert> alerts = read();
            Alert existing = alerts.stream()
                    .filter(a -> a.getId().equals(id))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("告警不存在: " + id));
            existing.setStatus(status);
            write(alerts);
        } finally {
            lock.writeLock().unlock();
        }
    }

    public ApiResponse.PageData<Alert> getAlertsPage(int page, int size, String type, String status, String since) {
        lock.readLock().lock();
        try {
            List<Alert> all = read();
            if (all == null) all = List.of();

            Stream<Alert> stream = all.stream();

            if (type != null && !type.isEmpty()) {
                stream = stream.filter(a -> type.equals(a.getType()));
            }
            if (status != null && !status.isEmpty()) {
                stream = stream.filter(a -> status.equals(a.getStatus()));
            }
            if (since != null && !since.isEmpty()) {
                stream = stream.filter(a -> a.getTime() != null && a.getTime().compareTo(since) >= 0);
            }

            List<Alert> sorted = stream
                .sorted(Comparator.comparing(Alert::getTime, Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());

            int total = sorted.size();
            int fromIndex = Math.min(page * size, total);
            int toIndex = Math.min(fromIndex + size, total);

            return new ApiResponse.PageData<>(sorted.subList(fromIndex, toIndex), total, page, size);
        } finally {
            lock.readLock().unlock();
        }
    }

    public String toCsv(String type, String status, String since) {
        ApiResponse.PageData<Alert> page = getAlertsPage(0, Integer.MAX_VALUE, type, status, since);
        List<Alert> alerts = page.getItems().stream()
                .filter(a -> !a.isSimulated())
                .collect(Collectors.toList());
        StringBuilder sb = new StringBuilder();
        sb.append("\uFEFFID,\u7C7B\u578B,\u7EA7\u522B,\u65F6\u95F4,\u5730\u70B9,\u72B6\u6001,\u7F6E\u4FE1\u5EA6,\u6D88\u606F\n");
        for (Alert a : alerts) {
            sb.append(CsvEscaper.field(a.getId())).append(',')
              .append(CsvEscaper.field(a.getType())).append(',')
              .append(CsvEscaper.field(a.getLevel())).append(',')
              .append(CsvEscaper.field(a.getTime())).append(',')
              .append(CsvEscaper.field(a.getCameraName())).append(',')
              .append(CsvEscaper.field(a.getStatus())).append(',')
              .append(String.format("%.1f", a.getConfidence())).append(',')
              .append(CsvEscaper.field(a.getMessage())).append('\n');
        }
        return sb.toString();
    }

    /**
     * Resolve null snapshotUrl on alerts by matching with detection JSON files.
     * Match key: cameraId + timestamp within ±3 seconds.
     */
    public void resolveSnapshotUrls(String dataDir) {
        lock.writeLock().lock();
        try {
            List<Alert> alerts = read();
            boolean needsWrite = false;
            List<DetectionRef> detRefs = loadDetectionRefs(dataDir);

            for (Alert alert : alerts) {
                if (alert.getSnapshotUrl() != null && !alert.getSnapshotUrl().isEmpty()) continue;
                if (alert.getTime() == null || alert.getCameraId() == null) continue;

                try {
                    long alertMs = LocalDateTime.parse(alert.getTime(), DET_TS_FMT)
                            .atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();

                    String bestImg = null;
                    long bestDiff = Long.MAX_VALUE;
                    for (DetectionRef ref : detRefs) {
                        if (!ref.cameraId.equals(alert.getCameraId())) continue;
                        long diff = Math.abs(ref.epochMs - alertMs);
                        if (diff < bestDiff && diff <= 3000) {
                            bestDiff = diff;
                            bestImg = ref.imageFilename;
                        }
                    }
                    if (bestImg != null) {
                        alert.setImageFilename(bestImg);
                        alert.setSnapshotUrl("/api/images/" + bestImg);
                        needsWrite = true;
                    }
                } catch (Exception e) { log.debug("Failed to resolve snapshot URL for alert", e); }
            }

            if (needsWrite) {
                write(alerts);
            }
        } finally {
            lock.writeLock().unlock();
        }
    }

    private List<DetectionRef> loadDetectionRefs(String dataDir) {
        List<DetectionRef> refs = new ArrayList<>();
        Path dir = Paths.get(dataDir);
        if (!Files.exists(dir)) return refs;

        try (Stream<Path> paths = Files.list(dir)) {
            paths.filter(p -> {
                String name = p.getFileName().toString();
                return Files.isRegularFile(p) && name.startsWith("detection_") && name.endsWith(".json");
            }).forEach(p -> {
                try (var reader = Files.newBufferedReader(p, StandardCharsets.UTF_8)) {
                    DetectionData det = objectMapper.readValue(reader, DetectionData.class);
                    if (det.getTimestamp() != null && det.getImageFilename() != null && det.getCameraId() != null) {
                        long epochMs = LocalDateTime.parse(det.getTimestamp(), DET_TS_FMT)
                                .atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
                        refs.add(new DetectionRef(det.getCameraId(), epochMs, det.getImageFilename()));
                    }
                } catch (Exception e) { log.debug("Failed to parse detection ref: {}", p.getFileName(), e); }
            });
        } catch (IOException e) { log.debug("Failed to list detection files in {}", dataDir, e); }

        return refs;
    }

    private record DetectionRef(String cameraId, long epochMs, String imageFilename) {}
}
