package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.SettingsService;
import com.yolov8.security.service.SettingsService.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 系统设置管理
 */
@RestController
@RequestMapping("/api")
public class SettingsController {

    private static final Logger log = LoggerFactory.getLogger(SettingsController.class);

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping("/settings")
    public ResponseEntity<ApiResponse<SettingsService.Settings>> getSettings() {
        try {
            SettingsService.Settings settings = settingsService.getSettings();
            return ResponseEntity.ok(ApiResponse.success(settings));
        } catch (Exception e) {
            log.error("Error getting settings", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("读取设置失败: " + e.getMessage()));
        }
    }

    @PostMapping("/settings")
    @SuppressWarnings("unchecked")
    public ResponseEntity<ApiResponse<SettingsService.Settings>> updateSettings(@RequestBody Map<String, Object> body) {
        try {
            Settings current = settingsService.getSettings();
            Settings merged = mergeMapIntoSettings(body, current);
            settingsService.updateSettings(merged);
            return ResponseEntity.ok(ApiResponse.success("设置已保存", settingsService.getSettings()));
        } catch (Exception e) {
            log.error("Error updating settings", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("保存设置失败: " + e.getMessage()));
        }
    }

    @SuppressWarnings("unchecked")
    private Settings mergeMapIntoSettings(Map<String, Object> map, Settings current) {
        Double confidence = map.containsKey("confidence") ? toDouble(map.get("confidence")) : current.getConfidence();
        Double iou = map.containsKey("iou") ? toDouble(map.get("iou")) : current.getIou();
        Integer interval = map.containsKey("interval") ? toInteger(map.get("interval")) : current.getInterval();
        Integer maxPeople = map.containsKey("maxPeople") ? toInteger(map.get("maxPeople")) : current.getMaxPeople();
        Integer cooldown = map.containsKey("cooldown") ? toInteger(map.get("cooldown")) : current.getCooldown();
        Integer fatigueThreshold = map.containsKey("fatigueThreshold") ? toInteger(map.get("fatigueThreshold")) : current.getFatigueThreshold();

        AiSensitivity aiSens = current.getAiSensitivity();
        if (map.containsKey("aiSensitivity") && map.get("aiSensitivity") instanceof Map<?, ?> aiMap) {
            AiSensitivity incoming = mapToAiSensitivity((Map<String, Object>) aiMap);
            aiSens = aiSens != null ? aiSens.merge(incoming) : incoming;
        }

        AppNotifications notifs = current.getNotifications();
        if (map.containsKey("notifications") && map.get("notifications") instanceof Map<?, ?> nMap) {
            AppNotifications incoming = mapToNotifications((Map<String, Object>) nMap);
            notifs = notifs != null ? notifs.merge(incoming) : incoming;
        }

        StorageSettings stor = current.getStorage();
        if (map.containsKey("storage") && map.get("storage") instanceof Map<?, ?> sMap) {
            StorageSettings incoming = mapToStorage((Map<String, Object>) sMap);
            stor = stor != null ? stor.merge(incoming) : incoming;
        }

        return new Settings(confidence, iou, interval, maxPeople, cooldown, fatigueThreshold,
                aiSens, notifs, stor);
    }

    private AiSensitivity mapToAiSensitivity(Map<String, Object> map) {
        return new AiSensitivity(
                map.containsKey("fightDetection") ? toInteger(map.get("fightDetection")) : null,
                map.containsKey("fallDetection") ? toInteger(map.get("fallDetection")) : null,
                map.containsKey("climbingDetection") ? toInteger(map.get("climbingDetection")) : null,
                map.containsKey("crowdGathering") ? toInteger(map.get("crowdGathering")) : null
        );
    }

    private AppNotifications mapToNotifications(Map<String, Object> map) {
        return new AppNotifications(
                map.containsKey("email") ? toBoolean(map.get("email")) : null,
                map.containsKey("sms") ? toBoolean(map.get("sms")) : null,
                map.containsKey("centralAlarm") ? toBoolean(map.get("centralAlarm")) : null
        );
    }

    private StorageSettings mapToStorage(Map<String, Object> map) {
        return new StorageSettings(
                map.containsKey("autoOverwrite") ? toBoolean(map.get("autoOverwrite")) : null
        );
    }

    private static Double toDouble(Object val) {
        if (val == null) return null;
        if (val instanceof Number n) return n.doubleValue();
        return Double.parseDouble(val.toString());
    }

    private static Integer toInteger(Object val) {
        if (val == null) return null;
        if (val instanceof Number n) return n.intValue();
        return Integer.parseInt(val.toString());
    }

    private static Boolean toBoolean(Object val) {
        if (val == null) return null;
        if (val instanceof Boolean b) return b;
        return Boolean.parseBoolean(val.toString());
    }
}
