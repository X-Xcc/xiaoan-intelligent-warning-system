package com.yolov8.security.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.util.AlertUtils;
import com.yolov8.security.model.Alert;
import com.yolov8.security.model.DetectionData;
import com.yolov8.security.model.StatsResponse;
import com.yolov8.security.model.SystemInfoDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.DoubleSummaryStatistics;
import java.util.stream.Collectors;
import java.util.stream.Stream;

// DirScan 缓存 — 15秒 TTL
@Service
public class DetectionService {

    private static final Logger log = LoggerFactory.getLogger(DetectionService.class);
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");
    /** One directory walk serves both JSON detections and frame_*.jpg listing. */
    private record DirScan(List<DetectionData> detections, List<String> imageFiles, int totalDetectionCount) {}

    private static final int MAX_DETECTIONS_IN_STATS_PAYLOAD = 200;

    private final AppConfig appConfig;
    private final ObjectMapper objectMapper;
    private final AlertService alertService;
    // TODO: alertedImageFilenames grows unboundedly — replace with Caffeine cache (TTL-based eviction) if memory becomes a concern
    private final Set<String> alertedImageFilenames = ConcurrentHashMap.newKeySet();

    private volatile DirScan scanCache;
    private volatile long scanCacheTimeMs;
    private static final long SCAN_CACHE_TTL_MS = 15000L;
    private volatile boolean snapshotUrlsResolved = false;

    // Separate cache for system info (expensive totalSize computation)
    private volatile SystemInfoDTO systemInfoCache;
    private volatile long systemInfoCacheTimeMs;
    private static final long SYSTEM_INFO_CACHE_TTL_MS = 60000L;

    public DetectionService(AppConfig appConfig, ObjectMapper objectMapper, AlertService alertService) {
        this.appConfig = appConfig;
        this.objectMapper = objectMapper;
        this.alertService = alertService;

        // Warm systemInfo cache in background to avoid blocking first page load
        Thread warmer = new Thread(() -> {
            try { Thread.sleep(5000); } catch (InterruptedException ignored) {}
            try { getSystemInfo(); } catch (Exception ignored) {}
        }, "sysinfo-warmer");
        warmer.setDaemon(true);
        warmer.start();
    }

    /** Call after bulk deletes so the next read sees an empty / updated folder. */
    public void invalidateScanCache() {
        scanCache = null;
        scanCacheTimeMs = 0L;
    }

    private DirScan getOrScanUploadDir() throws IOException {
        // Fast path: check volatile (no lock needed if cache is valid)
        long now = System.currentTimeMillis();
        var cached = scanCache;
        if (cached != null && (now - scanCacheTimeMs) < SCAN_CACHE_TTL_MS) {
            return cached;
        }
        // Slow path: synchronize to avoid duplicate I/O
        synchronized (this) {
            now = System.currentTimeMillis();
            cached = scanCache;
            if (cached != null && (now - scanCacheTimeMs) < SCAN_CACHE_TTL_MS) {
                return cached;
            }
            DirScan fresh = scanUploadDirectory();
            scanCache = fresh;
            scanCacheTimeMs = now;
            return fresh;
        }
    }

    /**
     * Single {@link Files#walk} collects detection JSON and image filenames (sorted newest first).
     */
    private DirScan scanUploadDirectory() throws IOException {
        File dataDir = new File(appConfig.getFile().getUploadDir());
        if (!dataDir.exists()) {
            log.warn("Data directory does not exist: {}", dataDir.getAbsolutePath());
            return new DirScan(Collections.emptyList(), Collections.emptyList(), 0);
        }

        List<Path> jsonPaths = new ArrayList<>();
        List<Path> jpgPaths = new ArrayList<>();

        try (Stream<Path> paths = Files.walk(dataDir.toPath(), 2)) {
            paths.filter(Files::isRegularFile).forEach(p -> {
                String name = p.getFileName().toString();
                if (name.startsWith("detection_") && name.endsWith(".json")) {
                    jsonPaths.add(p);
                } else if (name.startsWith("frame_") && name.endsWith(".jpg")) {
                    jpgPaths.add(p);
                }
            });
        }

        Comparator<Path> byMtimeDesc = (a, b) -> {
            try {
                return Long.compare(Files.getLastModifiedTime(b).toMillis(),
                        Files.getLastModifiedTime(a).toMillis());
            } catch (IOException e) {
                return 0;
            }
        };
        jsonPaths.sort(byMtimeDesc);
        jpgPaths.sort(byMtimeDesc);

        int totalCount = jsonPaths.size();

        // Only parse the most recent MAX_DETECTIONS_IN_STATS_PAYLOAD files for performance
        List<DetectionData> detections = jsonPaths.stream()
                .limit(MAX_DETECTIONS_IN_STATS_PAYLOAD)
                .map(this::loadDetectionFile)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());

        List<String> images = jpgPaths.stream()
                .map(p -> {
                    Path relative = dataDir.toPath().relativize(p);
                    return relative.toString().replace(File.separatorChar, '/');
                })
                .collect(Collectors.toList());

        log.info("Scanned {}: {} JSON files (parsed {}), {} JPG files",
                dataDir.getAbsolutePath(), totalCount, detections.size(), images.size());

        return new DirScan(detections, images, totalCount);
    }

    /**
     * Lightweight summary: counts only, no detection list. For frequent polling.
     */
    public Map<String, Object> getStatsSummary() {
        try {
            DirScan scan = getOrScanUploadDir();
            List<DetectionData> allDetections = scan.detections();
            StatsResponse.BehaviorCounts bc = calculateBehaviorCounts(allDetections);

            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("totalDetections", scan.totalDetectionCount());
            summary.put("totalImages", scan.imageFiles().size());

            Map<String, Integer> counts = new LinkedHashMap<>();
            counts.put("跌倒", bc.getFall());
            counts.put("打架", bc.getFight());
            counts.put("离岗", bc.getAbsent());
            counts.put("人员聚集", bc.getGather());
            summary.put("behaviorCounts", counts);

            return summary;
        } catch (Exception e) {
            log.error("Error getting stats summary", e);
            return Map.of("totalDetections", 0, "totalImages", 0, "behaviorCounts", Map.of());
        }
    }

    public StatsResponse getStats() {
        try {
            // One-time resolve: backfill snapshotUrl on alerts created before imageFilename was added
            if (!snapshotUrlsResolved) {
                snapshotUrlsResolved = true;
                alertService.resolveSnapshotUrls(appConfig.getFile().getUploadDir());
            }

            DirScan scan = getOrScanUploadDir();
            List<DetectionData> allDetections = scan.detections();
            List<String> imageFiles = scan.imageFiles();

            StatsResponse.BehaviorCounts behaviorCounts = calculateBehaviorCounts(allDetections);

            StatsResponse stats = new StatsResponse();
            stats.setTotalDetections(scan.totalDetectionCount());
            stats.setTotalImages(imageFiles.size());
            stats.setBehaviorCounts(behaviorCounts);
            stats.setAllDetections(allDetections);
            stats.setRecentDetections(allDetections.stream()
                    .limit(50)
                    .collect(Collectors.toList()));

            if (!allDetections.isEmpty()) {
                stats.setPersonCount(allDetections.get(0).getPersonCount());
            }

            return stats;
        } catch (Exception e) {
            log.error("Error getting stats", e);
            return new StatsResponse();
        }
    }

    /**
     * 从检测数据中自动创建 Alert（幂等：已处理过的 imageFilename 不会重复创建）。
     * 由定时任务调度，也可手动调用。
     */
    @Scheduled(fixedDelayString = "${app.alert.auto-create-interval-ms:15000}", initialDelay = 5000)
    public void autoCreateAlerts() {
        try {
            DirScan scan = getOrScanUploadDir();
            for (DetectionData det : scan.detections()) {
                if (det.getActions() != null && !det.getActions().isEmpty()
                        && det.getImageFilename() != null
                        && alertedImageFilenames.add(det.getImageFilename())) {
                    for (String action : det.getActions()) {
                        try {
                            Alert alert = new Alert();
                            alert.setType(action);
                            alert.setLevel(AlertUtils.mapSeverity(action));
                            alert.setTime(det.getTimestamp());
                            alert.setSnapshotUrl("/api/images/" + det.getImageFilename());
                            alert.setStatus("pending");
                            alert.setConfidence(95.0);
                            alert.setMessage("自动检测：" + action);
                            alert.setCameraName(det.getCameraName());
                            alert.setCameraId(det.getCameraId());
                            alertService.addAlert(alert);
                        } catch (Exception e) {
                            log.warn("Failed to auto-create alert for action: {}", action, e);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error in autoCreateAlerts", e);
        }
    }

    private StatsResponse.BehaviorCounts calculateBehaviorCounts(List<DetectionData> detections) {
        StatsResponse.BehaviorCounts behaviorCounts = new StatsResponse.BehaviorCounts();

        for (DetectionData detection : detections) {
            if (detection.getActions() != null) {
                for (String action : detection.getActions()) {
                    switch (action) {
                        case "跌倒": behaviorCounts.setFall(behaviorCounts.getFall() + 1); break;
                        case "打架": behaviorCounts.setFight(behaviorCounts.getFight() + 1); break;
                        case "离岗": behaviorCounts.setAbsent(behaviorCounts.getAbsent() + 1); break;
                        case "人员聚集": behaviorCounts.setGather(behaviorCounts.getGather() + 1); break;
                    }
                }
            }
        }
        return behaviorCounts;
    }

    public List<DetectionData> getDetections() {
        try {
            return getOrScanUploadDir().detections();
        } catch (Exception e) {
            log.error("Error getting detections", e);
            return Collections.emptyList();
        }
    }

    public Map<String, Object> getFpsStats() {
        List<DetectionData> detections = getDetections();
        if (detections.isEmpty()) {
            return Map.of("avg", 0, "min", 0, "max", 0, "count", 0);
        }
        DoubleSummaryStatistics stats = detections.stream()
                .filter(d -> d.getFps() > 0)
                .mapToDouble(DetectionData::getFps)
                .summaryStatistics();
        if (stats.getCount() == 0) {
            return Map.of("avg", 0, "min", 0, "max", 0, "count", 0);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("avg", Math.round(stats.getAverage() * 10.0) / 10.0);
        result.put("min", stats.getMin());
        result.put("max", stats.getMax());
        result.put("count", stats.getCount());
        return result;
    }

    public List<String> getRecentFrames() {
        try {
            return getOrScanUploadDir().imageFiles().stream()
                    .limit(appConfig.getMonitor().getMaxRecentFrames())
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.error("Error getting recent frames", e);
            return Collections.emptyList();
        }
    }

    public List<String> getAllFrames() {
        try {
            return new ArrayList<>(getOrScanUploadDir().imageFiles());
        } catch (Exception e) {
            log.error("Error getting all frames", e);
            return Collections.emptyList();
        }
    }

    public Map<String, Object> getAllImages() {
        try {
            List<String> images = getOrScanUploadDir().imageFiles();
            Map<String, Object> result = new HashMap<>();
            result.put("status", "success");
            result.put("images", images);
            return result;
        } catch (Exception e) {
            log.error("Error getting all images", e);
            Map<String, Object> result = new HashMap<>();
            result.put("status", "error");
            result.put("message", e.getMessage());
            return result;
        }
    }

    public Map<String, Object> deleteAllImages() {
        try {
            File dataDir = new File(appConfig.getFile().getUploadDir());
            if (dataDir.exists() && dataDir.isDirectory()) {
                try (Stream<Path> walk = Files.walk(dataDir.toPath(), 2)) {
                    walk.filter(Files::isRegularFile).forEach(p -> {
                        String name = p.getFileName().toString();
                        if ((name.startsWith("frame_") && name.endsWith(".jpg")) ||
                                (name.startsWith("detection_") && name.endsWith(".json"))) {
                            try {
                                Files.delete(p);
                            } catch (IOException e) {
                                log.warn("Failed to delete file: {}", p.toAbsolutePath(), e);
                            }
                        }
                    });
                }
            }

            invalidateScanCache();
            alertedImageFilenames.clear();

            Map<String, Object> result = new HashMap<>();
            result.put("status", "success");
            result.put("message", "所有图片和检测记录已删除");
            return result;
        } catch (Exception e) {
            log.error("Error deleting images", e);
            Map<String, Object> result = new HashMap<>();
            result.put("status", "error");
            result.put("message", e.getMessage());
            return result;
        }
    }

    public Map<String, Object> getMonitorStatus() {
        try {
            Map<String, Object> result = new HashMap<>();
            result.put("status", "online");
            result.put("message", "监控正常运行");
            result.put("update_time", LocalTime.now().format(TIME_FORMATTER));
            return result;
        } catch (Exception e) {
            log.error("Error getting monitor status", e);
            Map<String, Object> result = new HashMap<>();
            result.put("status", "error");
            result.put("message", e.getMessage());
            return result;
        }
    }

    public Map<String, Object> openFolder(String folderType) {
        try {
            String folderPath;
            switch (folderType) {
                case "screenshots":
                    folderPath = appConfig.getFile().getUploadDir();
                    break;
                case "videos":
                    folderPath = appConfig.getFile().getResultDir();
                    break;
                default:
                    Map<String, Object> result = new HashMap<>();
                    result.put("status", "error");
                    result.put("message", "Invalid folder type");
                    return result;
            }

            File folder = new File(folderPath);
            if (!folder.exists()) {
                folder.mkdirs();
            }

            Map<String, Object> result = new HashMap<>();
            result.put("status", "success");
            result.put("path", folder.getAbsolutePath());
            result.put("message", "Folder path: " + folder.getAbsolutePath());
            return result;
        } catch (Exception e) {
            log.error("Error opening folder", e);
            Map<String, Object> result = new HashMap<>();
            result.put("status", "error");
            result.put("message", e.getMessage());
            return result;
        }
    }

    /**
     * 手动截图：保存 JPEG 帧 + detection JSON。
     *
     * @param jpegBytes  go2rtc 快照 JPEG 数据
     * @param camId      摄像头 ID
     * @param cameraName 摄像头名称
     * @param actions    报警类型列表（中文：打架/跌倒/自杀/异常聚集）
     * @return 生成的 DetectionData
     */
    public DetectionData saveManualDetection(byte[] jpegBytes, String camId,
                                              String cameraName, List<String> actions) throws IOException {
        String ts = java.time.LocalDateTime.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        long millis = System.currentTimeMillis();

        String frameFilename = "frame_" + millis + "_" + camId + ".jpg";
        String detectionFilename = "detection_" + millis + "_" + camId + ".json";

        Path uploadDir = Paths.get(appConfig.getFile().getUploadDir());
        Files.createDirectories(uploadDir);

        // 写入 JPEG（原子写入：temp → rename）
        Path framePath = uploadDir.resolve(frameFilename);
        Path tempFrame = uploadDir.resolve(frameFilename + ".tmp");
        Files.write(tempFrame, jpegBytes);
        Files.move(tempFrame, framePath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);

        // 构造 DetectionData
        DetectionData det = new DetectionData();
        det.setId("DET_" + millis + "_" + camId);
        det.setTimestamp(ts);
        det.setActions(actions);
        det.setPersonCount(0);
        det.setCameraId(camId);
        det.setCameraName(cameraName);
        det.setImageFilename(frameFilename);
        det.setFps(0);

        // 写入 JSON（原子写入）
        Path detPath = uploadDir.resolve(detectionFilename);
        Path tempDet = uploadDir.resolve(detectionFilename + ".tmp");
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(tempDet.toFile(), det);
        Files.move(tempDet, detPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);

        // 清缓存，让 DirScan 下次扫描能发现新文件
        invalidateScanCache();

        log.info("手动截图已保存: {} + {}", frameFilename, detectionFilename);
        return det;
    }

    private DetectionData loadDetectionFile(Path path) {
        try (var reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            return objectMapper.readValue(reader, DetectionData.class);
        } catch (IOException e) {
            log.error("Error loading detection file: {}", path, e);
            return null;
        }
    }

    public SystemInfoDTO getSystemInfo() {
        // Fast path: check volatile (no lock needed if cache is valid)
        long now = System.currentTimeMillis();
        var cached = systemInfoCache;
        if (cached != null && (now - systemInfoCacheTimeMs) < SYSTEM_INFO_CACHE_TTL_MS) {
            return cached;
        }
        // Slow path: synchronize to avoid duplicate heavy computation
        synchronized (this) {
            now = System.currentTimeMillis();
            cached = systemInfoCache;
            if (cached != null && (now - systemInfoCacheTimeMs) < SYSTEM_INFO_CACHE_TTL_MS) {
                return cached;
            }

            SystemInfoDTO result;
            try {
                DirScan scan = getOrScanUploadDir();
                int jsonCount = scan.totalDetectionCount();
                int jpgCount = scan.imageFiles().size();

                // Compute totalSize from filesystem (expensive, but cached for 60s)
                long totalSize = 0;
                File dataDir = new File(appConfig.getFile().getUploadDir());
                if (dataDir.exists() && dataDir.isDirectory()) {
                    try (Stream<Path> walk = Files.walk(dataDir.toPath(), 2)) {
                        totalSize = walk.filter(Files::isRegularFile)
                                .mapToLong(p -> {
                                    try { return Files.size(p); }
                                    catch (IOException e) { return 0; }
                                })
                                .sum();
                    }
                }

                Runtime rt = Runtime.getRuntime();
                long usedMemory = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
                long maxMemory = rt.maxMemory() / (1024 * 1024);

                result = SystemInfoDTO.success(
                        Math.round(totalSize / 1024.0 / 1024.0 * 100.0) / 100.0,
                        jsonCount, jpgCount, usedMemory, maxMemory);
            } catch (Exception e) {
                log.error("Error getting system info", e);
                result = SystemInfoDTO.error(e.getMessage());
            }

            systemInfoCache = result;
            systemInfoCacheTimeMs = now;
            return result;
        }
    }

    public Map<String, Object> getCompareData() {
        try {
            DirScan scan = getOrScanUploadDir();
            String today = java.time.LocalDate.now().toString();
            String yesterday = java.time.LocalDate.now().minusDays(1).toString();

            Map<String, Integer> todayCounts = new LinkedHashMap<>();
            Map<String, Integer> yesterdayCounts = new LinkedHashMap<>();
            String[] behaviors = {"跌倒", "打架", "离岗", "人员聚集"};
            for (String b : behaviors) {
                todayCounts.put(b, 0);
                yesterdayCounts.put(b, 0);
            }

            for (DetectionData det : scan.detections()) {
                if (det.getTimestamp() == null || det.getActions() == null) continue;
                String date = det.getTimestamp().substring(0, 10);
                for (String action : det.getActions()) {
                    if (today.equals(date)) {
                        todayCounts.merge(action, 1, Integer::sum);
                    } else if (yesterday.equals(date)) {
                        yesterdayCounts.merge(action, 1, Integer::sum);
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            for (String b : behaviors) {
                int t = todayCounts.getOrDefault(b, 0);
                int y = yesterdayCounts.getOrDefault(b, 0);
                double change = y > 0 ? ((double)(t - y) / y * 100) : (t > 0 ? 100.0 : 0.0);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("today", t);
                item.put("yesterday", y);
                item.put("change", Math.round(change * 10.0) / 10.0);
                result.put(b, item);
            }
            return result;
        } catch (Exception e) {
            log.error("Error getting compare data", e);
            return Map.of();
        }
    }

}
