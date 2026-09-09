package com.yolov8.security.service;

import com.yolov8.security.config.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Path;
import java.util.Map;
import jakarta.annotation.PreDestroy;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;

@Service
public class PythonScriptService {

    private static final Logger log = LoggerFactory.getLogger(PythonScriptService.class);
    private final AppConfig appConfig;
    private volatile Process detectionProcess;

    public PythonScriptService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (appConfig.getPython().isAutoStart()) startMonitoring();
    }

    /**
     * Start Python detection in background. Returns immediately.
     */
    public synchronized Map<String, Object> startMonitoring() {
        if (detectionProcess != null && detectionProcess.isAlive()) {
            log.info("Detection already running (PID {})", detectionProcess.pid());
            return Map.of("status", "already_running", "pid", detectionProcess.pid());
        }

        String scriptPath = appConfig.getPython().getScriptPath();

        // Find project root — try current dir first, then parent
        File cwd = new File(System.getProperty("user.dir")).getAbsoluteFile();
        Path script = Path.of(scriptPath);
        if (!script.isAbsolute()) {
            script = cwd.toPath().resolve(script).normalize();
            if (!script.toFile().exists()) script = cwd.toPath().getParent().resolve(scriptPath).normalize();
        }
        File scriptFile = script.toFile();
        File projectRoot = scriptFile.getParentFile().getParentFile();
        if (!scriptFile.exists()) {
            log.error("Python script not found: {}", scriptPath);
            return Map.of("status", "error", "message", "Script not found: " + scriptPath);
        }

        // Find venv python in project root
        String pythonCmd = appConfig.getPython().getExecutable();
        if (pythonCmd == null || pythonCmd.isBlank()) pythonCmd = "python";

        try {
            ProcessBuilder pb = new ProcessBuilder(pythonCmd, scriptFile.getAbsolutePath());
            pb.redirectErrorStream(true);
            pb.directory(projectRoot);

            // dotenv-java uses system properties; pass only the detector's declared keys.
            for (String name : new String[]{"API_KEY", "CAM_PASSWORD", "DATA_DIR", "WEB_SERVER_URL",
                    "CAMERAS_CONFIG_PATH", "YOLOV8_MODEL_PATH", "YOLOV8_DEVICE", "GO2RTC_API",
                    "GO2RTC_RTSP_HOST", "CICSIC_REVIEW_URL", "CICSIC_REVIEW_API_KEY",
                    "CICSIC_REVIEW_ENABLED", "CICSIC_REVIEW_TIMEOUT", "THRESHOLDS_PATH"}) {
                String value = System.getProperty(name);
                if (value != null) pb.environment().putIfAbsent(name, value);
            }
            pb.redirectOutput(ProcessBuilder.Redirect.INHERIT);

            log.info("Starting Python detection: {} {} (workdir={})",
                    pythonCmd, scriptFile.getAbsolutePath(), projectRoot.getAbsolutePath());
            detectionProcess = pb.start();
            log.info("Detection started with PID {}", detectionProcess.pid());

            return Map.of("status", "started", "pid", detectionProcess.pid());
        } catch (Exception e) {
            log.error("Failed to start detection", e);
            return Map.of("status", "error", "message", e.getMessage());
        }
    }

    /**
     * Stop Python detection process.
     */
    @PreDestroy
    public synchronized Map<String, Object> stopMonitoring() {
        if (detectionProcess == null || !detectionProcess.isAlive()) {
            return Map.of("status", "not_running");
        }

        long pid = detectionProcess.pid();
        log.info("Stopping detection (PID {})", pid);
        detectionProcess.descendants().forEach(ProcessHandle::destroy);
        detectionProcess.destroy();
        try {
            boolean exited = detectionProcess.waitFor(5, java.util.concurrent.TimeUnit.SECONDS);
            if (!exited) {
                detectionProcess.destroyForcibly();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            detectionProcess.destroyForcibly();
        }
        return Map.of("status", "stopped", "pid", pid);
    }

    /**
     * Check if detection is currently running.
     */
    public synchronized boolean isRunning() {
        return detectionProcess != null && detectionProcess.isAlive();
    }
}
