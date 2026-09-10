package com.yolov8.security.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.util.CsvEscaper;
import com.yolov8.security.util.JsonFileUtils;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.model.AuditLog;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class AuditLogService {

    private static final TypeReference<List<AuditLog>> TYPE_REF = new TypeReference<>() {};

    private final Path filePath;
    private final ObjectMapper objectMapper;
    private final ReadWriteLock lock = JsonFileUtils.newLock();

    @Autowired
    public AuditLogService(AppConfig appConfig, ObjectMapper objectMapper) {
        this.filePath = Paths.get(appConfig.getFile().getUploadDir()).resolve("audit_logs.json");
        this.objectMapper = objectMapper;
        JsonFileUtils.cleanupTmp(filePath);
    }

    private List<AuditLog> read() {
        return JsonFileUtils.readList(filePath, objectMapper, TYPE_REF);
    }

    private void write(List<AuditLog> data) {
        JsonFileUtils.writeList(filePath, data, objectMapper);
    }

    public List<AuditLog> getAllLogs() {
        lock.readLock().lock();
        try {
            return read().stream()
                    .sorted(Comparator.comparing(AuditLog::getTimestamp, Comparator.nullsLast(Comparator.reverseOrder())))
                    .collect(Collectors.toList());
        } finally {
            lock.readLock().unlock();
        }
    }

    public AuditLog addLog(AuditLog log) {
        lock.writeLock().lock();
        try {
            List<AuditLog> logs = read();
            log.setId("LOG_" + System.currentTimeMillis() + "_" + ThreadLocalRandom.current().nextInt(1000, 9999));
            if (log.getTimestamp() == null) {
                log.setTimestamp(Instant.now().toString());
            }
            if (log.getStatus() == null) {
                log.setStatus(true);
            }
            logs.add(log);
            write(logs);
            return log;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public ApiResponse.PageData<AuditLog> getLogsPage(int page, int size, String search, String category, String riskLevel) {
        lock.readLock().lock();
        try {
            List<AuditLog> all = read();
            if (all == null) all = List.of();

            Stream<AuditLog> stream = all.stream();

            if (search != null && !search.isEmpty()) {
                String lower = search.toLowerCase();
                stream = stream.filter(l ->
                    (l.getOperatorName() != null && l.getOperatorName().toLowerCase().contains(lower)) ||
                    (l.getAction() != null && l.getAction().toLowerCase().contains(lower)) ||
                    (l.getMessage() != null && l.getMessage().toLowerCase().contains(lower))
                );
            }
            if (category != null && !category.isEmpty()) {
                stream = stream.filter(l -> category.equals(l.getCategory()));
            }
            if (riskLevel != null && !riskLevel.isEmpty()) {
                stream = stream.filter(l -> riskLevel.equals(l.getRiskLevel()));
            }

            List<AuditLog> sorted = stream
                .sorted(Comparator.comparing(AuditLog::getTimestamp, Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());

            int total = sorted.size();
            int fromIndex = Math.min(page * size, total);
            int toIndex = Math.min(fromIndex + size, total);
            return new ApiResponse.PageData<>(sorted.subList(fromIndex, toIndex), total, page, size);
        } finally {
            lock.readLock().unlock();
        }
    }

    public Map<String, Object> getTrendData(String range) {
        lock.readLock().lock();
        try {
            List<AuditLog> all = read();
            if (all == null) all = List.of();

            int points = "week".equals(range) ? 7 : 24;
            String labelFormat = "day".equals(range) ? "HH:00" : "MM-dd";
            java.time.format.DateTimeFormatter labelFmt = java.time.format.DateTimeFormatter.ofPattern(labelFormat);

            java.time.LocalDateTime now = java.time.LocalDateTime.now();
            List<String> labels = new ArrayList<>();
            Map<String, Integer> buckets = new LinkedHashMap<>();

            for (int i = points - 1; i >= 0; i--) {
                java.time.LocalDateTime point = now.minusHours("day".equals(range) ? i : i * 24L);
                labels.add(point.format(labelFmt));
                buckets.put(point.format(labelFmt), 0);
            }

            java.time.LocalDateTime cutoff = now.minusHours("day".equals(range) ? points : points * 24L);

            for (AuditLog log : all) {
                try {
                    java.time.Instant instant = java.time.Instant.parse(log.getTimestamp());
                    java.time.LocalDateTime logTime = instant.atZone(java.time.ZoneId.systemDefault()).toLocalDateTime();
                    if (logTime.isAfter(cutoff)) {
                        String bucket = logTime.format(labelFmt);
                        buckets.merge(bucket, 1, Integer::sum);
                    }
                } catch (Exception ignored) {}
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("labels", labels);
            result.put("data", new ArrayList<>(buckets.values()));
            return result;
        } finally {
            lock.readLock().unlock();
        }
    }

    public String toCsv(String search, String category, String riskLevel) {
        ApiResponse.PageData<AuditLog> page = getLogsPage(0, Integer.MAX_VALUE, search, category, riskLevel);
        List<AuditLog> logs = page.getItems();
        StringBuilder sb = new StringBuilder();
        sb.append("\uFEFF\u65F6\u95F4\u6233,\u64CD\u4F5C\u5458ID,\u64CD\u4F5C\u5458,\u7C7B\u522B,\u64CD\u4F5C,\u98CE\u9669\u7EA7\u522B,\u72B6\u6001,\u6D88\u606F\n");
        for (AuditLog l : logs) {
            sb.append(CsvEscaper.field(l.getTimestamp())).append(',')
              .append(CsvEscaper.field(l.getOperatorId())).append(',')
              .append(CsvEscaper.field(l.getOperatorName())).append(',')
              .append(CsvEscaper.field(l.getCategory())).append(',')
              .append(CsvEscaper.field(l.getAction())).append(',')
              .append(CsvEscaper.field(l.getRiskLevel())).append(',')
              .append(l.getStatus()).append(',')
              .append(CsvEscaper.field(l.getMessage())).append('\n');
        }
        return sb.toString();
    }
}
