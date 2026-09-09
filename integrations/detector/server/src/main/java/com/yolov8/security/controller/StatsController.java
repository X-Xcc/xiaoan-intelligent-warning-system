package com.yolov8.security.controller;

import com.yolov8.security.model.Alert;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.model.StatsResponse;
import com.yolov8.security.model.SystemInfoDTO;
import com.yolov8.security.service.AlertService;
import com.yolov8.security.service.DetectionService;
import com.yolov8.security.service.ModelInfoService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统计接口（纯统计）
 */
@RestController
@RequestMapping("/api")
public class StatsController {

    private static final Logger log = LoggerFactory.getLogger(StatsController.class);

    private final DetectionService detectionService;
    private final ModelInfoService modelInfoService;
    private final AlertService alertService;

    public StatsController(DetectionService detectionService,
                           ModelInfoService modelInfoService,
                           AlertService alertService) {
        this.detectionService = detectionService;
        this.modelInfoService = modelInfoService;
        this.alertService = alertService;
    }

    // ─── 统计 ───

    @GetMapping("/stats/summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatsSummary() {
        try {
            List<Alert> alerts = alertService.getAllAlerts();
            String today = java.time.LocalDate.now().toString();
            String yesterday = java.time.LocalDate.now().minusDays(1).toString();
            String[] behaviors = {"打架", "跌倒", "离岗", "人员聚集"};

            Map<String, Integer> todayCounts = new LinkedHashMap<>();
            Map<String, Integer> yesterdayCounts = new LinkedHashMap<>();
            for (String b : behaviors) {
                todayCounts.put(b, 0);
                yesterdayCounts.put(b, 0);
            }

            for (Alert a : alerts) {
                if (a.getTime() == null) continue;
                String date = a.getTime().substring(0, 10);
                String type = a.getType();
                if (today.equals(date)) {
                    todayCounts.merge(type, 1, Integer::sum);
                } else if (yesterday.equals(date)) {
                    yesterdayCounts.merge(type, 1, Integer::sum);
                }
            }

            Map<String, Integer> behaviorCounts = new LinkedHashMap<>();
            int total = 0;
            for (String b : behaviors) {
                int count = todayCounts.getOrDefault(b, 0);
                behaviorCounts.put(b, count);
                total += count;
            }

            Map<String, Object> compare = new LinkedHashMap<>();
            for (String b : behaviors) {
                int t = todayCounts.getOrDefault(b, 0);
                int y = yesterdayCounts.getOrDefault(b, 0);
                double change = y > 0 ? ((double)(t - y) / y * 100) : (t > 0 ? 100.0 : 0.0);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("today", t);
                item.put("yesterday", y);
                item.put("change", Math.round(change * 10.0) / 10.0);
                compare.put(b, item);
            }

            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("behaviorCounts", behaviorCounts);
            summary.put("total", total);
            summary.put("compare", compare);

            return ResponseEntity.ok(ApiResponse.success(summary));
        } catch (Exception e) {
            log.error("Error getting stats summary", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取统计摘要失败: " + e.getMessage()));
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<StatsResponse>> getStats() {
        try {
            StatsResponse stats = detectionService.getStats();
            return ResponseEntity.ok(ApiResponse.success(stats));
        } catch (Exception e) {
            log.error("Error getting stats", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取统计数据失败: " + e.getMessage()));
        }
    }

    @GetMapping("/stats/trend")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTrendStats(@RequestParam(defaultValue = "day") String range) {
        int dataPoints = "week".equals(range) ? 7 : "month".equals(range) ? 30 : 24;
        String labelFormat = "day".equals(range) ? "HH:00" : "MM-dd";
        java.time.format.DateTimeFormatter labelFmt = java.time.format.DateTimeFormatter.ofPattern(labelFormat);
        java.time.format.DateTimeFormatter parseFmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

        java.time.LocalDateTime now = java.time.LocalDateTime.now();

        List<String> labels = new ArrayList<>();
        String[] behaviorTypes = {"打架", "跌倒", "离岗", "人员聚集"};
        java.util.Map<String, java.util.Map<String, Integer>> behaviorBuckets = new java.util.LinkedHashMap<>();
        for (String type : behaviorTypes) {
            java.util.Map<String, Integer> bucket = new java.util.LinkedHashMap<>();
            for (int i = dataPoints - 1; i >= 0; i--) {
                java.time.LocalDateTime point = now.minusHours("day".equals(range) ? i : i * 24L);
                String label = point.format(labelFmt);
                bucket.put(label, 0);
            }
            behaviorBuckets.put(type, bucket);
        }
        labels.addAll(behaviorBuckets.get(behaviorTypes[0]).keySet());

        try {
            List<Alert> alerts = alertService.getAllAlerts();
            for (Alert alert : alerts) {
                try {
                    java.time.LocalDateTime alertTime = java.time.LocalDateTime.parse(alert.getTime(), parseFmt);
                    String bucket = alertTime.format(labelFmt);
                    if (alertTime.isAfter(now.minusHours("day".equals(range) ? dataPoints : dataPoints * 24L))) {
                        String type = alert.getType();
                        java.util.Map<String, Integer> behBucket = behaviorBuckets.get(type);
                        if (behBucket != null && behBucket.containsKey(bucket)) {
                            behBucket.merge(bucket, 1, Integer::sum);
                        }
                    }
                } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate trend data from alerts", e);
        }

        java.util.Map<String, List<Integer>> dataByBehavior = new java.util.LinkedHashMap<>();
        for (String type : behaviorTypes) {
            dataByBehavior.put(type, new ArrayList<>(behaviorBuckets.get(type).values()));
        }

        return ResponseEntity.ok(ApiResponse.success(Map.of("labels", labels, "data", dataByBehavior)));
    }

    @GetMapping("/stats/regional")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getRegionalStats() {
        try {
            List<Alert> alerts = alertService.getAllAlerts();
            Map<String, Long> counts = new LinkedHashMap<>();
            for (Alert a : alerts) {
                String name = a.getCameraName() != null ? a.getCameraName() : "未知";
                counts.merge(name, 1L, Long::sum);
            }
            List<Map<String, Object>> result = new ArrayList<>();
            String[] colors = {"#0051ae", "#0058be", "#bf8700", "#7c4dff", "#c2c6d6"};
            int i = 0;
            for (var entry : counts.entrySet()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("name", entry.getKey());
                item.put("value", entry.getValue());
                item.put("color", colors[i % colors.length]);
                result.add(item);
                i++;
            }
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("Error getting regional stats", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取区域统计失败: " + e.getMessage()));
        }
    }

    @GetMapping("/stats/compare")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatsCompare() {
        try {
            Map<String, Object> compare = detectionService.getCompareData();
            return ResponseEntity.ok(ApiResponse.success(compare));
        } catch (Exception e) {
            log.error("Error getting compare data", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取对比数据失败: " + e.getMessage()));
        }
    }

    @GetMapping("/stats/fps")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getFpsStats() {
        try {
            Map<String, Object> fps = detectionService.getFpsStats();
            return ResponseEntity.ok(ApiResponse.success(fps));
        } catch (Exception e) {
            log.error("Error getting FPS stats", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取 FPS 统计失败: " + e.getMessage()));
        }
    }

    @GetMapping("/system_info")
    public ResponseEntity<ApiResponse<SystemInfoDTO>> getSystemInfo() {
        try {
            SystemInfoDTO info = detectionService.getSystemInfo();
            return ResponseEntity.ok(ApiResponse.success(info));
        } catch (Exception e) {
            log.error("Error getting system info", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("获取系统信息失败: " + e.getMessage()));
        }
    }
}
