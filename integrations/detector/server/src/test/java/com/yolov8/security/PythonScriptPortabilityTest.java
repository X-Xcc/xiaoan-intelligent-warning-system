package com.yolov8.security;

import com.yolov8.security.config.AppConfig;
import com.yolov8.security.service.PythonScriptService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PythonScriptPortabilityTest {
    @TempDir Path directory;

    @Test
    @EnabledOnOs(OS.LINUX)
    void usesConfiguredExecutableAndAbsoluteScriptPath() throws Exception {
        Path script = directory.resolve("test-script.py");
        Files.writeString(script, "sleep 30\n");
        AppConfig config = new AppConfig();
        config.getPython().setScriptPath(script.toString());
        config.getPython().setExecutable("/bin/sh");
        PythonScriptService service = new PythonScriptService(config);
        try {
            Map<String, Object> started = service.startMonitoring();
            assertEquals("started", started.get("status"));
            Thread.sleep(200);
            assertTrue(service.isRunning(), "Configured shell must execute the fixture, not Python");
            assertTimeoutPreemptively(Duration.ofSeconds(8), service::stopMonitoring);
            assertFalse(service.isRunning());
        } finally {
            service.stopMonitoring();
        }
    }

    @Test
    void rejectsMissingScript() {
        AppConfig config = new AppConfig();
        config.getPython().setScriptPath(directory.resolve("missing.py").toString());
        config.getPython().setExecutable("python");
        assertEquals("error", new PythonScriptService(config).startMonitoring().get("status"));
    }
}
