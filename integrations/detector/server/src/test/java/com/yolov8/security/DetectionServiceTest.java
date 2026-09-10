package com.yolov8.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.model.DetectionData;
import com.yolov8.security.model.StatsResponse;
import com.yolov8.security.service.DetectionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DetectionServiceTest {

    @TempDir
    Path tempDir;

    private DetectionService service;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        AppConfig config = new AppConfig();
        AppConfig.FileConfig fileConfig = new AppConfig.FileConfig();
        fileConfig.setUploadDir(tempDir.toString());
        config.setFile(fileConfig);

        AppConfig.MonitorConfig monitorConfig = new AppConfig.MonitorConfig();
        monitorConfig.setMaxRecentFrames(10);
        config.setMonitor(monitorConfig);

        service = new DetectionService(config, objectMapper, null);
    }

    // --- getDetections() tests ---

    @Test
    void getDetections_returnsEmptyList_whenNoJsonFilesExist() {
        List<DetectionData> detections = service.getDetections();

        assertNotNull(detections);
        assertTrue(detections.isEmpty());
    }

    @Test
    void getDetections_returnsEmptyList_whenDirectoryDoesNotExist() {
        // Point config to a non-existent directory
        Path nonExistent = tempDir.resolve("nonexistent_subdir");
        AppConfig config = new AppConfig();
        AppConfig.FileConfig fileConfig = new AppConfig.FileConfig();
        fileConfig.setUploadDir(nonExistent.toString());
        config.setFile(fileConfig);
        config.setMonitor(new AppConfig.MonitorConfig());

        DetectionService svc = new DetectionService(config, objectMapper, null);
        List<DetectionData> detections = svc.getDetections();

        assertNotNull(detections);
        assertTrue(detections.isEmpty());
    }

    @Test
    void getDetections_returnsParsedData_whenJsonFilesExist() throws Exception {
        // Create a valid detection JSON file
        String json = "{\"id\":\"det-001\",\"timestamp\":\"2026-04-26T10:00:00\","
                + "\"actions\":[\"跌倒\",\"打架\"],\"person_count\":3,"
                + "\"filename\":\"detection_001.json\",\"image_filename\":\"frame_001.jpg\"}";
        Path jsonFile = tempDir.resolve("detection_001.json");
        Files.writeString(jsonFile, json, StandardCharsets.UTF_8);

        List<DetectionData> detections = service.getDetections();

        assertEquals(1, detections.size());
        DetectionData dd = detections.get(0);
        assertEquals("det-001", dd.getId());
        assertEquals(3, dd.getPersonCount());
        assertEquals(2, dd.getActions().size());
        assertTrue(dd.getActions().contains("跌倒"));
        assertTrue(dd.getActions().contains("打架"));
    }

    @Test
    void getDetections_returnsMultipleFiles_sortedByMtimeDescending() throws Exception {
        // Create first file, then sleep briefly, then create second file
        Path file1 = tempDir.resolve("detection_001.json");
        Files.writeString(file1, getValidJson("det-001"), StandardCharsets.UTF_8);

        Thread.sleep(50); // small delay to ensure different mtime

        Path file2 = tempDir.resolve("detection_002.json");
        Files.writeString(file2, getValidJson("det-002"), StandardCharsets.UTF_8);

        List<DetectionData> detections = service.getDetections();

        assertEquals(2, detections.size());
        // Newest first (by mtime)
        assertEquals("det-002", detections.get(0).getId());
        assertEquals("det-001", detections.get(1).getId());
    }

    @Test
    void getDetections_skipsMalformedJson() throws Exception {
        Path goodFile = tempDir.resolve("detection_good.json");
        Files.writeString(goodFile, getValidJson("good-det"), StandardCharsets.UTF_8);

        Path badFile = tempDir.resolve("detection_bad.json");
        Files.writeString(badFile, "{this is not valid json", StandardCharsets.UTF_8);

        List<DetectionData> detections = service.getDetections();

        assertEquals(1, detections.size());
        assertEquals("good-det", detections.get(0).getId());
    }

    @Test
    void getDetections_ignoresNonDetectionJsonFiles() throws Exception {
        // A JSON file that does NOT start with "detection_"
        Path otherJson = tempDir.resolve("other_data.json");
        Files.writeString(otherJson, "{}", StandardCharsets.UTF_8);

        Path detectionFile = tempDir.resolve("detection_valid.json");
        Files.writeString(detectionFile, getValidJson("valid-det"), StandardCharsets.UTF_8);

        List<DetectionData> detections = service.getDetections();

        assertEquals(1, detections.size());
        assertEquals("valid-det", detections.get(0).getId());
    }

    // --- getStats() tests ---

    @Test
    void getStats_returnsCorrectPersonCount_andActionCounts() throws Exception {
        // File with fall + fight
        Files.writeString(tempDir.resolve("detection_001.json"),
                "{\"id\":\"d1\",\"actions\":[\"跌倒\",\"打架\"],\"person_count\":2}",
                StandardCharsets.UTF_8);

        Thread.sleep(50);

        // File with absent
        Files.writeString(tempDir.resolve("detection_002.json"),
                "{\"id\":\"d2\",\"actions\":[\"离岗\"],\"person_count\":1}",
                StandardCharsets.UTF_8);

        StatsResponse stats = service.getStats();

        assertNotNull(stats);
        assertEquals(2, stats.getTotalDetections());
        // Behavior counts
        assertEquals(1, stats.getBehaviorCounts().getFall());
        assertEquals(1, stats.getBehaviorCounts().getFight());
        assertEquals(1, stats.getBehaviorCounts().getAbsent());

        // Recent detections (limit 50, so all 2 should appear)
        assertEquals(2, stats.getRecentDetections().size());
        // All detections (limit 200, so all 2 should appear)
        assertEquals(2, stats.getAllDetections().size());
    }

    @Test
    void getStats_handlesMalformedJsonGracefully() throws Exception {
        Files.writeString(tempDir.resolve("detection_broken.json"),
                "{{{{invalid json}}}}", StandardCharsets.UTF_8);

        // Should not throw
        StatsResponse stats = service.getStats();

        assertNotNull(stats);
        // Malformed JSON is skipped in parsed list, but file is still counted
        assertEquals(1, stats.getTotalDetections());
        assertEquals(0, stats.getRecentDetections().size());
    }

    @Test
    void getStats_returnsEmptyStats_whenNoDetections() {
        StatsResponse stats = service.getStats();

        assertNotNull(stats);
        assertEquals(0, stats.getTotalDetections());
        assertEquals(0, stats.getTotalImages());
    }

    @Test
    void getStats_countsImagesCorrectly() throws Exception {
        Files.writeString(tempDir.resolve("detection_001.json"),
                getValidJson("d1"), StandardCharsets.UTF_8);

        // Create some jpg files (empty is fine)
        Files.writeString(tempDir.resolve("frame_001.jpg"), "fake-jpg");
        Files.writeString(tempDir.resolve("frame_002.jpg"), "fake-jpg");

        StatsResponse stats = service.getStats();

        assertEquals(1, stats.getTotalDetections());
        assertEquals(2, stats.getTotalImages());
    }

    @Test
    void getStats_limitsRecentDetectionsTo50() throws Exception {
        for (int i = 0; i < 55; i++) {
            String name = String.format("detection_%03d.json", i);
            Files.writeString(tempDir.resolve(name), getValidJson("d-" + i), StandardCharsets.UTF_8);
            Thread.sleep(1); // ensure different mtimes
        }

        StatsResponse stats = service.getStats();

        // All detections up to 200
        assertEquals(55, stats.getAllDetections().size());
        // Recent detections capped at 50
        assertEquals(50, stats.getRecentDetections().size());
    }

    @Test
    void getStats_limitsAllDetectionsTo200() throws Exception {
        for (int i = 0; i < 210; i++) {
            String name = String.format("detection_%03d.json", i);
            Files.writeString(tempDir.resolve(name), getValidJson("d-" + i), StandardCharsets.UTF_8);
        }

        StatsResponse stats = service.getStats();

        // All detections capped at 200
        assertEquals(200, stats.getAllDetections().size());
    }

    // --- getRecentFrames() / getAllFrames() tests ---

    @Test
    void getRecentFrames_returnsEmpty_whenNoImages() {
        List<String> frames = service.getRecentFrames();
        assertNotNull(frames);
        assertTrue(frames.isEmpty());
    }

    @Test
    void getAllFrames_returnsFilenames_whenImagesExist() throws Exception {
        Files.writeString(tempDir.resolve("frame_001.jpg"), "fake");
        Files.writeString(tempDir.resolve("frame_002.jpg"), "fake");

        List<String> frames = service.getAllFrames();

        assertEquals(2, frames.size());
        assertTrue(frames.contains("frame_001.jpg"));
        assertTrue(frames.contains("frame_002.jpg"));
    }

    // --- invalidateScanCache() test ---

    @Test
    void invalidateScanCache_causesFreshRead() throws Exception {
        // First read: empty
        List<DetectionData> before = service.getDetections();
        assertEquals(0, before.size());

        // Add a file after initial scan
        Files.writeString(tempDir.resolve("detection_new.json"),
                getValidJson("new-det"), StandardCharsets.UTF_8);

        // Invalidate cache
        service.invalidateScanCache();

        // Second read should see the new file
        List<DetectionData> after = service.getDetections();
        assertEquals(1, after.size());
        assertEquals("new-det", after.get(0).getId());
    }

    // --- getMonitorStatus() test ---

    @Test
    void getMonitorStatus_returnsOnline() {
        Map<String, Object> status = service.getMonitorStatus();
        assertEquals("online", status.get("status"));
        assertNotNull(status.get("update_time"));
    }

    // --- Helper ---

    private String getValidJson(String id) {
        return "{\"id\":\"" + id + "\",\"timestamp\":\"2026-04-26T10:00:00\","
                + "\"actions\":[\"跌倒\"],\"person_count\":1}";
    }
}
