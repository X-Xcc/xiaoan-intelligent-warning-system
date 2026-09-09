package com.yolov8.security.config;

import com.yolov8.security.service.DetectionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.File;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Periodically deletes old detection_*.json and frame_*.jpg files from the data directory.
 * Runs once per hour, deleting files older than {@code app.cleanup.retention-days} (default 7).
 */
@Component
public class DataCleanupTask {

    private static final Logger log = LoggerFactory.getLogger(DataCleanupTask.class);
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final AppConfig appConfig;
    private final DetectionService detectionService;

    public DataCleanupTask(AppConfig appConfig, DetectionService detectionService) {
        this.appConfig = appConfig;
        this.detectionService = detectionService;
    }

    /**
     * Hourly cleanup. Deletes detection JSON and frame JPG files past retention.
     */
    @Scheduled(fixedRate = 3_600_000) // 1 hour
    public void cleanOldFiles() {
        int retentionDays = appConfig.getCleanup().getRetentionDays();
        if (retentionDays <= 0) {
            log.debug("Cleanup disabled (retention-days={})", retentionDays);
            return;
        }

        File dataDir = new File(appConfig.getFile().getUploadDir());
        if (!dataDir.exists() || !dataDir.isDirectory()) return;

        LocalDate cutoff = LocalDate.now().minusDays(retentionDays);
        File[] files = dataDir.listFiles();
        if (files == null) return;

        AtomicInteger deleted = new AtomicInteger();
        for (File entry : files) {
            if (entry.isDirectory()) {
                File[] subFiles = entry.listFiles();
                if (subFiles != null) {
                    for (File f : subFiles) {
                        deleteIfOld(f, cutoff, deleted);
                    }
                }
            } else {
                deleteIfOld(entry, cutoff, deleted);
            }
        }

        if (deleted.get() > 0) {
            log.info("Cleanup: deleted {} old files (retention={} days, cutoff={})",
                    deleted.get(), retentionDays, cutoff);
            detectionService.invalidateScanCache();
        }
    }

    private void deleteIfOld(File f, LocalDate cutoff, AtomicInteger deleted) {
        String name = f.getName();
        if (!f.isFile() || (!name.startsWith("detection_") && !name.startsWith("frame_"))) return;
        try {
            LocalDate fileDate = parseDateFromName(name);
            if (fileDate.isBefore(cutoff)) {
                if (f.delete()) deleted.incrementAndGet();
            }
        } catch (DateTimeParseException ignored) {}
    }

    /**
     * Parse yyyyMMdd date from filename like "detection_20260426_171011_573.json".
     */
    static LocalDate parseDateFromName(String name) throws DateTimeParseException {
        // Expect format: prefix_yyyyMMdd_HHmmss_SSS.ext
        int first = name.indexOf('_');
        if (first < 0) throw new DateTimeParseException("no underscore", name, 0);
        int second = name.indexOf('_', first + 1);
        if (second < 0) throw new DateTimeParseException("no second underscore", name, 0);
        String datePart = name.substring(first + 1, second);
        if (datePart.length() < 8) throw new DateTimeParseException("too short for date", name, 0);
        return LocalDate.parse(datePart.substring(0, 8), DATE_FMT);
    }
}
