package com.yolov8.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.service.SettingsService;
import com.yolov8.security.service.SettingsService.Settings;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class SettingsServiceTest {

    @TempDir
    Path tempDir;

    private SettingsService service;

    @BeforeEach
    void setUp() {
        AppConfig appConfig = new AppConfig();
        AppConfig.FileConfig fileConfig = new AppConfig.FileConfig();
        fileConfig.setUploadDir(tempDir.toString());
        appConfig.setFile(fileConfig);
        service = new SettingsService(appConfig, new ObjectMapper());
    }

    @Test
    void getSettings_missingFile_returnsDefaults() {
        Settings settings = service.getSettings();
        assertNotNull(settings);
        assertEquals(0.5, settings.getConfidence());
        assertEquals(0.45, settings.getIou());
        assertEquals(100, settings.getInterval());
        assertEquals(50, settings.getMaxPeople());
        assertEquals(30, settings.getCooldown());
        assertEquals(60, settings.getFatigueThreshold());
    }

    @Test
    void updateSettings_partialUpdate_mergesExisting() {
        Settings initial = new Settings();
        initial.setConfidence(0.7);
        initial.setIou(0.5);
        service.updateSettings(initial);

        Settings update = new Settings();
        update.setConfidence(0.8);
        service.updateSettings(update);

        Settings settings = service.getSettings();
        assertEquals(0.8, settings.getConfidence());
        assertEquals(0.5, settings.getIou()); // preserved
    }

    @Test
    void updateSettings_allFields_persists() {
        Settings update = new Settings(0.6, 0.5, 200, 100, 60, 120);
        service.updateSettings(update);

        Settings settings = service.getSettings();
        assertEquals(0.6, settings.getConfidence());
        assertEquals(200, settings.getInterval());
    }

    @Test
    void getSettings_invalidJson_returnsDefaults() throws IOException {
        Files.writeString(tempDir.resolve("settings.json"), "not json{{{");
        Settings settings = service.getSettings();
        assertEquals(0.5, settings.getConfidence());
    }

    @Test
    void updateSettings_nullFields_preserveExisting() {
        Settings initial = new Settings(0.7, 0.5, 200, 100, 60, 120);
        service.updateSettings(initial);

        Settings partial = new Settings();
        partial.setConfidence(0.9);
        service.updateSettings(partial);

        Settings settings = service.getSettings();
        assertEquals(0.9, settings.getConfidence());
        assertEquals(0.5, settings.getIou()); // preserved
        assertEquals(200, settings.getInterval()); // preserved
    }
}
