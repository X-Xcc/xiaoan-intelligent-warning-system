package com.yolov8.security.config;

import jakarta.annotation.PostConstruct;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "app")
public class AppConfig {

    private FileConfig file = new FileConfig();
    private MonitorConfig monitor = new MonitorConfig();
    private PythonConfig python = new PythonConfig();
    private CleanupConfig cleanup = new CleanupConfig();
    private QwenVLConfig qwenVl = new QwenVLConfig();
    private Go2rtcConfig go2rtc = new Go2rtcConfig();
    private boolean demoMode = false;
    private String apiKey;
    private String jwtSecret;
    private String adminUsername;
    private String adminPassword;

    @PostConstruct
    public void validate() {
        // .env 通过 System.setProperty 加载，但 @ConfigurationProperties 在 WAR 嵌套 ClassLoader 下绑定不到系统属性
        fallbackFromSystemProperty("JWT_SECRET", v -> this.jwtSecret = v,
                () -> jwtSecret == null || jwtSecret.isBlank());
        fallbackFromSystemProperty("ADMIN_USERNAME", v -> this.adminUsername = v,
                () -> adminUsername == null || adminUsername.isBlank());
        fallbackFromSystemProperty("ADMIN_PASSWORD", v -> this.adminPassword = v,
                () -> adminPassword == null || adminPassword.isBlank());

        if (jwtSecret == null || jwtSecret.isBlank() || jwtSecret.contains("change-this")) {
            throw new IllegalStateException(
                "JWT_SECRET 未配置或使用了默认值！请在 .env 文件或环境变量中设置 JWT_SECRET（至少32字符）");
        }
        if (adminPassword == null || adminPassword.isBlank()) {
            throw new IllegalStateException(
                "ADMIN_PASSWORD 未配置！请在 .env 文件或环境变量中设置管理员密码");
        }
    }

    private void fallbackFromSystemProperty(String key, java.util.function.Consumer<String> setter,
                                            java.util.function.BooleanSupplier needsFallback) {
        if (needsFallback.getAsBoolean()) {
            String val = System.getProperty(key);
            if (val != null && !val.isBlank()) {
                setter.accept(val);
            }
        }
    }

    @Data
    public static class FileConfig {
        private String uploadDir;
        private String videoDir;
        private String modelDir;
        private String resultDir;
    }

    @Data
    public static class MonitorConfig {
        private int timeout = 300;
        private int maxRecentDetections = 20;
        private int maxRecentFrames = 5;
    }

    @Data
    public static class PythonConfig {
        private String scriptPath;
        private String executable;
        private boolean autoStart = false;
    }

    @Data
    public static class QwenVLConfig {
        private String serviceUrl = "http://127.0.0.1:5002";
        private String modelPath = "./models/Qwen2.5-VL-7B-Instruct";
        private int timeout = 30000;
        private int maxRetries = 3;
    }

    @Data
    public static class CleanupConfig {
        private int retentionDays = 0;
    }

    @Data
    public static class Go2rtcConfig {
        private boolean autoStart = false;
        private String binaryPath = "go2rtc";
        private String apiHost = "http://127.0.0.1:1984";
        private String rtspHost = "rtsp://127.0.0.1:8554";
        private int apiPort = 1984;
        private int rtspPort = 8554;
        private int webrtcPort = 8555;
    }
}
