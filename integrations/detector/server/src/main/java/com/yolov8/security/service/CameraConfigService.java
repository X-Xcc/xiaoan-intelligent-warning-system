package com.yolov8.security.service;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.model.CameraConfigDTO;
import com.yolov8.security.repository.CameraRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

// 环境变量占位符替换
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;

// 摄像头配置服务 — CRUD + go2rtc 联动，添加/删除摄像头时自动同步go2rtc的流配置
@Service
public class CameraConfigService {

    private static final Logger log = LoggerFactory.getLogger(CameraConfigService.class);
    private final CameraRepository repository;
    private final ObjectMapper objectMapper;
    private final Go2rtcService go2rtcService;
    private final Path camerasJsonPath;
    private final AtomicBoolean migrated = new AtomicBoolean(false);
    private final Environment environment;

    // getAllCameras() 内存缓存，TTL 30 秒
    private volatile List<Camera> camerasCache;
    private volatile long camerasCacheTimeMs;
    private static final long CAMERAS_CACHE_TTL_MS = 30_000L;

    public CameraConfigService(CameraRepository repository, ObjectMapper objectMapper,
                               Go2rtcService go2rtcService, AppConfig appConfig, Environment environment) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.go2rtcService = go2rtcService;
        String defaultCameraPath = Paths.get(appConfig.getPython().getScriptPath()).getParent().resolve("cameras.json").toString();
        this.camerasJsonPath = Paths.get(environment == null ? defaultCameraPath
            : environment.getProperty("app.camera-config-path", defaultCameraPath));
        this.environment = environment;
    }

    /**
     * 替换字符串中的 ${CAM_PASSWORD} 等环境变量占位符
     */
    private String resolveEnvPlaceholders(String value) {
        if (value == null || !value.contains("${")) return value;
        String camPassword = environment.getProperty("CAM_PASSWORD", "");
        if (camPassword.isEmpty()) {
            log.warn("环境变量 CAM_PASSWORD 未设置，摄像头密码为空");
        }
        return value.replace("${CAM_PASSWORD}", camPassword);
    }

    @PostConstruct
    public void init() {
        migrateFromJson();
    }

    @Scheduled(initialDelay = 5000, fixedDelay = 30000)
    public void syncGo2rtcStreams() {
        if (environment != null && !environment.getProperty("app.go2rtc.sync-enabled", Boolean.class, true)) return;
        List<Camera> rtspCameras = getAllCameras().stream()
                .filter(camera -> camera.isEnabled() && "rtsp".equals(camera.getType()))
                .toList();
        if (rtspCameras.isEmpty() || !go2rtcService.isApiAvailable()) return;
        try {
            var streams = go2rtcService.getAllStreams();
            for (Camera camera : rtspCameras) {
                String id = camera.getGo2rtcId() != null ? camera.getGo2rtcId() : "cam_" + camera.getId();
                if (!streams.has(id)) {
                    go2rtcService.addStream(id, String.valueOf(camera.getAddress()));
                }
            }
        } catch (IOException exception) {
            log.warn("go2rtc stream synchronization failed; it will retry");
        }
    }

    public Path getCamerasJsonPath() {
        return camerasJsonPath;
    }

    public List<Camera> getAllCameras() {
        // Fast path: check volatile (no lock needed if cache is valid)
        long now = System.currentTimeMillis();
        var cached = camerasCache;
        if (cached != null && (now - camerasCacheTimeMs) < CAMERAS_CACHE_TTL_MS) {
            return cached;
        }
        // Slow path: synchronize to avoid duplicate DB + filesystem I/O
        synchronized (this) {
            now = System.currentTimeMillis();
            cached = camerasCache;
            if (cached != null && (now - camerasCacheTimeMs) < CAMERAS_CACHE_TTL_MS) {
                return cached;
            }

            List<Camera> cameras = repository.findAll();
            // 从 cameras.json 读取 httpMjpegUrl 并合并（使用 JsonNode 树模型，绕开 Camera 反序列化问题）
            try {
                if (Files.exists(camerasJsonPath)) {
                    com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(camerasJsonPath.toFile());
                    com.fasterxml.jackson.databind.JsonNode arr = root.get("cameras");
                    if (arr != null && arr.isArray()) {
                        for (com.fasterxml.jackson.databind.JsonNode node : arr) {
                            String id = node.has("id") ? node.get("id").asText() : null;
                            String url = node.has("httpMjpegUrl") ? node.get("httpMjpegUrl").asText() : null;
                            if (id != null && url != null) {
                                String resolvedUrl = resolveEnvPlaceholders(url);
                                cameras.stream()
                                    .filter(c -> id.equals(c.getId()))
                                    .findFirst()
                                    .ifPresent(c -> c.setHttpMjpegUrl(resolvedUrl));
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("合并 httpMjpegUrl 失败");
            }

            List<Camera> immutableCameras = Collections.unmodifiableList(cameras);
            camerasCache = immutableCameras;
            camerasCacheTimeMs = now;
            return immutableCameras;
        }
    }

    /** 缓存失效 — 添加/更新/删除摄像头后调用 */
    private void invalidateCamerasCache() {
        camerasCache = null;
        camerasCacheTimeMs = 0L;
    }

    public Camera getCameraById(String id) {
        return repository.findById(id);
    }

    public Camera addCamera(Camera camera) {
        String validationError = validateCamera(camera, false);
        if (validationError != null) {
            throw new IllegalArgumentException(validationError);
        }
        if (camera.getId() == null || camera.getId().isEmpty()) {
            camera.setId("cam" + System.currentTimeMillis());
        }
        if (repository.existsById(camera.getId())) {
            throw new IllegalArgumentException("摄像头ID已存在: " + camera.getId());
        }
        String go2rtcId = "rtsp".equals(camera.getType()) ? "cam_" + camera.getId() : null;
        repository.insert(camera, go2rtcId);
        invalidateCamerasCache();
        // 联动 go2rtc: rtsp 类型摄像头自动添加流
        if (go2rtcId != null && go2rtcService.isApiAvailable()) {
            try {
                go2rtcService.addStream(go2rtcId, String.valueOf(camera.getAddress()));
            } catch (Exception e) {
                log.warn("go2rtc 添加流失败 (摄像头已保存)");
            }
        }
        return camera;
    }

    public Camera updateCamera(String id, Camera camera) {
        Camera existing = repository.findById(id);
        if (existing == null) {
            throw new IllegalArgumentException("摄像头不存在: " + id);
        }
        preserveCredentials(camera, existing);
        String validationError = validateCamera(camera, true);
        if (validationError != null) {
            throw new IllegalArgumentException(validationError);
        }
        camera.setId(id);
        repository.update(camera);
        invalidateCamerasCache();
        // 同步 go2rtc 流
        if ("rtsp".equals(camera.getType()) && go2rtcService.isApiAvailable()) {
            String go2rtcId = repository.findGo2rtcIdById(id);
            if (go2rtcId != null) {
                try {
                    go2rtcService.removeStream(go2rtcId);
                    go2rtcService.addStream(go2rtcId, String.valueOf(camera.getAddress()));
                } catch (Exception e) {
                    log.warn("更新 go2rtc 流失败 (摄像头已保存)");
                }
            }
        }
        return camera;
    }

    private void preserveCredentials(Camera camera, Camera existing) {
        if (camera.getType() == null || camera.getType().isBlank()) camera.setType(existing.getType());
        boolean sameTarget = Objects.equals(camera.getType(), existing.getType())
                && sameCredentialTarget(camera.getAddress(), existing.getAddress())
                && sameCredentialTarget(camera.getHttpMjpegUrl(), existing.getHttpMjpegUrl());
        if (camera.getUsername() == null || camera.getUsername().isBlank()) {
            camera.setUsername(sameTarget ? existing.getUsername() : null);
        }
        if (camera.getPassword() == null || camera.getPassword().isBlank()) {
            camera.setPassword(sameTarget ? existing.getPassword() : null);
        }
        // Browser DTOs contain display URLs, never the private stream source.
        camera.setAddress(preserveAddress(camera.getAddress(), existing.getAddress()));
        camera.setHttpMjpegUrl((String) preserveAddress(camera.getHttpMjpegUrl(), existing.getHttpMjpegUrl()));
        if (camera.getGo2rtcId() == null || camera.getGo2rtcId().isBlank()) camera.setGo2rtcId(existing.getGo2rtcId());
    }

    private boolean sameCredentialTarget(Object submitted, Object existing) {
        if (submitted == null || (submitted instanceof String value && value.isBlank())
                || Objects.equals(submitted, existing)) return true;
        if (!(submitted instanceof String value) || !(existing instanceof String previous)) return false;
        try {
            URI next = new URI(value);
            URI old = new URI(previous);
            return next.getScheme() != null && next.getHost() != null && old.getHost() != null
                    && next.getScheme().equalsIgnoreCase(old.getScheme())
                    && next.getHost().equalsIgnoreCase(old.getHost()) && next.getPort() == old.getPort();
        } catch (URISyntaxException e) {
            return false;
        }
    }

    private Object preserveAddress(Object submitted, Object existing) {
        if (submitted == null || (submitted instanceof String value && value.isBlank())
                || Objects.equals(submitted, CameraConfigDTO.sanitizeAddress(existing))) {
            return existing;
        }
        if (submitted instanceof String value && existing instanceof String previous
                && value.equals(CameraConfigDTO.sanitizeAddress(value))) {
            try {
                URI next = new URI(value);
                URI old = new URI(previous);
                if (next.getHost() != null && old.getHost() != null
                        && next.getScheme().equalsIgnoreCase(old.getScheme())
                        && next.getHost().equalsIgnoreCase(old.getHost()) && next.getPort() == old.getPort()) {
                    // Keep raw escapes intact; never transfer hidden credentials to another origin.
                    return next.getScheme() + "://" + old.getRawAuthority() + next.getRawPath()
                            + (old.getRawQuery() == null ? "" : "?" + old.getRawQuery())
                            + (old.getRawFragment() == null ? "" : "#" + old.getRawFragment());
                }
            } catch (URISyntaxException e) {
                // Explicit replacement of an unparseable stored URL remains possible.
            }
        }
        return submitted;
    }

    public void deleteAllCameras() {
        repository.deleteAll();
        invalidateCamerasCache();
    }

    public boolean deleteCamera(String id) {
        boolean exists = repository.existsById(id);
        if (exists) {
            // 删除前先获取 go2rtcId 用于清理流
            String go2rtcId = repository.findGo2rtcIdById(id);
            repository.deleteById(id);
            invalidateCamerasCache();
            // 联动 go2rtc 删除流
            if (go2rtcId != null && go2rtcService.isApiAvailable()) {
                try {
                    go2rtcService.removeStream(go2rtcId);
                } catch (Exception e) {
                    log.warn("go2rtc 删除流失败 (摄像头已删除)");
                }
            }
        }
        return exists;
    }

    private void migrateFromJson() {
        if (!migrated.compareAndSet(false, true)) return;
        if (!Files.exists(camerasJsonPath)) return;
        try {
            CamerasWrapper wrapper = objectMapper.readValue(camerasJsonPath.toFile(), CamerasWrapper.class);
            for (Camera c : wrapper.getCameras()) {
                try {
                    // 解析环境变量占位符
                    if (c.getAddress() instanceof String) {
                        c.setAddress(resolveEnvPlaceholders((String) c.getAddress()));
                    }
                    c.setHttpMjpegUrl(resolveEnvPlaceholders(c.getHttpMjpegUrl()));

                    if (repository.existsById(c.getId())) {
                        // 更新已有摄像头（同步 cameras.json 中变化的字段）
                        Camera existing = repository.findById(c.getId());
                        if (c.getHttpMjpegUrl() != null) existing.setHttpMjpegUrl(c.getHttpMjpegUrl());
                        if (c.getName() != null) existing.setName(c.getName());
                        if (c.getType() != null) existing.setType(c.getType());
                        if (c.getAddress() != null) existing.setAddress(c.getAddress());
                        // 非 RTSP 摄像头清除 go2rtcId
                        if (!"rtsp".equals(existing.getType())) existing.setGo2rtcId(null);
                        repository.update(existing);
                    } else {
                        addCamera(c);
                    }
                } catch (Exception e) {
                    log.warn("迁移/更新摄像头失败: {}", c.getId(), e);
                }
            }
            log.info("从 cameras.json 同步了 {} 个摄像头", wrapper.getCameras().size());
        } catch (IOException e) {
            log.error("迁移 cameras.json 失败", e);
        }
    }

    private String validateCamera(Camera camera, boolean isUpdate) {
        // 校验已禁用 — 任意输入均可添加
        if (camera.getType() == null || camera.getType().isEmpty()) {
            camera.setType("rtsp");
        }
        if (camera.getName() == null || camera.getName().isEmpty()) {
            camera.setName("未命名设备");
        }
        if (camera.getAddress() == null) {
            camera.setAddress("");
        }
        if (camera.getStatus() == null || camera.getStatus().isEmpty()) {
            camera.setStatus("offline");
        }
        if (camera.getPort() <= 0) {
            camera.setPort(554);
        }
        if (camera.getChannel() <= 0) {
            camera.setChannel(1);
        }
        if (!camera.isEnabled()) {
            camera.setEnabled(true);
        }
        return null;
    }

    // --- Inner classes ---

    public static class CamerasWrapper {
        private List<Camera> cameras = new ArrayList<>();

        public List<Camera> getCameras() { return cameras; }
        public void setCameras(List<Camera> cameras) { this.cameras = cameras; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Camera {
        private String id;
        private String type;
        private Object address;
        private String name;
        @JsonAlias("user")
        private String username;
        private String password;
        private String brand;
        private String model;
        private String ip;
        private int port = 554;
        private int channel = 1;
        private String status = "offline";
        private boolean enabled = true;
        private String go2rtcId;
        private String httpMjpegUrl;

        public Camera() {}

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public Object getAddress() { return address; }
        public void setAddress(Object address) { this.address = address; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getBrand() { return brand; }
        public void setBrand(String brand) { this.brand = brand; }
        public String getModel() { return model; }
        public void setModel(String model) { this.model = model; }
        public String getIp() { return ip; }
        public void setIp(String ip) { this.ip = ip; }
        public int getPort() { return port; }
        public void setPort(int port) { this.port = port; }
        public int getChannel() { return channel; }
        public void setChannel(int channel) { this.channel = channel; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getGo2rtcId() { return go2rtcId; }
        public void setGo2rtcId(String go2rtcId) { this.go2rtcId = go2rtcId; }
        public String getHttpMjpegUrl() { return httpMjpegUrl; }
        public void setHttpMjpegUrl(String httpMjpegUrl) { this.httpMjpegUrl = httpMjpegUrl; }
    }
}
