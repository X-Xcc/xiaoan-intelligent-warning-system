package com.yolov8.security.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

@Service
public class SettingsService {

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);
    private final Path settingsPath;
    private final ObjectMapper objectMapper;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    private static final Settings DEFAULTS = new Settings(0.5, 0.45, 100, 50, 30, 60,
            new AiSensitivity(), new AppNotifications(), new StorageSettings());

    public SettingsService(AppConfig appConfig, ObjectMapper objectMapper) {
        this.settingsPath = Paths.get(appConfig.getFile().getUploadDir(), "settings.json");
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        Path tmpPath = settingsPath.getParent().resolve("settings.json.tmp");
        try { Files.deleteIfExists(tmpPath); } catch (IOException e) {
            log.warn("Failed to clean up settings.json.tmp", e);
        }
    }

    public Settings getSettings() {
        lock.readLock().lock();
        try {
            if (!Files.exists(settingsPath)) {
                return new Settings(DEFAULTS.getConfidence(), DEFAULTS.getIou(),
                        DEFAULTS.getInterval(), DEFAULTS.getMaxPeople(),
                        DEFAULTS.getCooldown(), DEFAULTS.getFatigueThreshold());
            }
            Settings stored = objectMapper.readValue(settingsPath.toFile(), Settings.class);
            return stored.withDefaults(DEFAULTS);
        } catch (IOException e) {
            log.error("Failed to read settings.json, returning defaults", e);
            return new Settings(DEFAULTS.getConfidence(), DEFAULTS.getIou(),
                    DEFAULTS.getInterval(), DEFAULTS.getMaxPeople(),
                    DEFAULTS.getCooldown(), DEFAULTS.getFatigueThreshold());
        } finally {
            lock.readLock().unlock();
        }
    }

    public void updateSettings(Settings updates) {
        lock.writeLock().lock();
        try {
            Settings current = getSettings();
            Settings merged = current.merge(updates);
            writeConfig(merged);
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void writeConfig(Settings settings) {
        Path tmpPath = settingsPath.getParent().resolve("settings.json.tmp");
        try {
            Files.createDirectories(settingsPath.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(tmpPath.toFile(), settings);
            Files.move(tmpPath, settingsPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.error("Failed to write settings.json", e);
            try { Files.deleteIfExists(tmpPath); } catch (IOException ignored) {}
            throw new RuntimeException("写入配置失败: " + e.getMessage());
        }
    }

    public static class AiSensitivity {
        private Integer fightDetection = 85;
        private Integer fallDetection = 60;
        private Integer climbingDetection = 92;
        private Integer crowdGathering = 75;

        public AiSensitivity() {}
        public AiSensitivity(Integer fightDetection, Integer fallDetection, Integer climbingDetection, Integer crowdGathering) {
            this.fightDetection = fightDetection;
            this.fallDetection = fallDetection;
            this.climbingDetection = climbingDetection;
            this.crowdGathering = crowdGathering;
        }

        public AiSensitivity merge(AiSensitivity u) {
            return new AiSensitivity(
                u.fightDetection != null ? u.fightDetection : this.fightDetection,
                u.fallDetection != null ? u.fallDetection : this.fallDetection,
                u.climbingDetection != null ? u.climbingDetection : this.climbingDetection,
                u.crowdGathering != null ? u.crowdGathering : this.crowdGathering
            );
        }

        public Integer getFightDetection() { return fightDetection; }
        public void setFightDetection(Integer v) { this.fightDetection = v; }
        public Integer getFallDetection() { return fallDetection; }
        public void setFallDetection(Integer v) { this.fallDetection = v; }
        public Integer getClimbingDetection() { return climbingDetection; }
        public void setClimbingDetection(Integer v) { this.climbingDetection = v; }
        public Integer getCrowdGathering() { return crowdGathering; }
        public void setCrowdGathering(Integer v) { this.crowdGathering = v; }
    }

    public static class AppNotifications {
        private Boolean email = true;
        private Boolean sms = false;
        private Boolean centralAlarm = true;

        public AppNotifications() {}
        public AppNotifications(Boolean email, Boolean sms, Boolean centralAlarm) {
            this.email = email;
            this.sms = sms;
            this.centralAlarm = centralAlarm;
        }

        public AppNotifications merge(AppNotifications u) {
            return new AppNotifications(
                u.email != null ? u.email : this.email,
                u.sms != null ? u.sms : this.sms,
                u.centralAlarm != null ? u.centralAlarm : this.centralAlarm
            );
        }

        public Boolean getEmail() { return email; }
        public void setEmail(Boolean v) { this.email = v; }
        public Boolean getSms() { return sms; }
        public void setSms(Boolean v) { this.sms = v; }
        public Boolean getCentralAlarm() { return centralAlarm; }
        public void setCentralAlarm(Boolean v) { this.centralAlarm = v; }
    }

    public static class StorageSettings {
        private Boolean autoOverwrite = true;

        public StorageSettings() {}
        public StorageSettings(Boolean autoOverwrite) { this.autoOverwrite = autoOverwrite; }

        public StorageSettings merge(StorageSettings u) {
            return new StorageSettings(u.autoOverwrite != null ? u.autoOverwrite : this.autoOverwrite);
        }

        public Boolean getAutoOverwrite() { return autoOverwrite; }
        public void setAutoOverwrite(Boolean v) { this.autoOverwrite = v; }
    }

    public static class Settings {
        private Double confidence;
        private Double iou;
        private Integer interval;
        private Integer maxPeople;
        private Integer cooldown;
        private Integer fatigueThreshold;
        private AiSensitivity aiSensitivity;
        private AppNotifications notifications;
        private StorageSettings storage;

        public Settings() {}

        public Settings(Double confidence, Double iou, Integer interval,
                        Integer maxPeople, Integer cooldown, Integer fatigueThreshold) {
            this(confidence, iou, interval, maxPeople, cooldown, fatigueThreshold, null, null, null);
        }

        public Settings(Double confidence, Double iou, Integer interval,
                        Integer maxPeople, Integer cooldown, Integer fatigueThreshold,
                        AiSensitivity aiSensitivity, AppNotifications notifications, StorageSettings storage) {
            this.confidence = confidence;
            this.iou = iou;
            this.interval = interval;
            this.maxPeople = maxPeople;
            this.cooldown = cooldown;
            this.fatigueThreshold = fatigueThreshold;
            this.aiSensitivity = aiSensitivity;
            this.notifications = notifications;
            this.storage = storage;
        }

        public Settings merge(Settings update) {
            return new Settings(
                update.confidence != null ? update.confidence : this.confidence,
                update.iou != null ? update.iou : this.iou,
                update.interval != null ? update.interval : this.interval,
                update.maxPeople != null ? update.maxPeople : this.maxPeople,
                update.cooldown != null ? update.cooldown : this.cooldown,
                update.fatigueThreshold != null ? update.fatigueThreshold : this.fatigueThreshold,
                update.aiSensitivity != null
                    ? (this.aiSensitivity != null ? this.aiSensitivity.merge(update.aiSensitivity) : update.aiSensitivity)
                    : this.aiSensitivity,
                update.notifications != null
                    ? (this.notifications != null ? this.notifications.merge(update.notifications) : update.notifications)
                    : this.notifications,
                update.storage != null
                    ? (this.storage != null ? this.storage.merge(update.storage) : update.storage)
                    : this.storage
            );
        }

        public Settings withDefaults(Settings defaults) {
            return new Settings(
                this.confidence != null ? this.confidence : defaults.confidence,
                this.iou != null ? this.iou : defaults.iou,
                this.interval != null ? this.interval : defaults.interval,
                this.maxPeople != null ? this.maxPeople : defaults.maxPeople,
                this.cooldown != null ? this.cooldown : defaults.cooldown,
                this.fatigueThreshold != null ? this.fatigueThreshold : defaults.fatigueThreshold,
                this.aiSensitivity != null ? this.aiSensitivity : defaults.aiSensitivity,
                this.notifications != null ? this.notifications : defaults.notifications,
                this.storage != null ? this.storage : defaults.storage
            );
        }

        public Double getConfidence() { return confidence; }
        public void setConfidence(Double v) { this.confidence = v; }
        public Double getIou() { return iou; }
        public void setIou(Double v) { this.iou = v; }
        public Integer getInterval() { return interval; }
        public void setInterval(Integer v) { this.interval = v; }
        public Integer getMaxPeople() { return maxPeople; }
        public void setMaxPeople(Integer v) { this.maxPeople = v; }
        public Integer getCooldown() { return cooldown; }
        public void setCooldown(Integer v) { this.cooldown = v; }
        public Integer getFatigueThreshold() { return fatigueThreshold; }
        public void setFatigueThreshold(Integer v) { this.fatigueThreshold = v; }
        public AiSensitivity getAiSensitivity() { return aiSensitivity; }
        public void setAiSensitivity(AiSensitivity v) { this.aiSensitivity = v; }
        public AppNotifications getNotifications() { return notifications; }
        public void setNotifications(AppNotifications v) { this.notifications = v; }
        public StorageSettings getStorage() { return storage; }
        public void setStorage(StorageSettings v) { this.storage = v; }
    }
}
