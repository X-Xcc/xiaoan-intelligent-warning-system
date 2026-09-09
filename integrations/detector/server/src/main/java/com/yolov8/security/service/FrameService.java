package com.yolov8.security.service;

import com.yolov8.security.config.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.imageio.ImageIO;

/**
 * Manages in-memory frame storage for multi-camera MJPEG streaming.
 * <p>
 * Extracted from VideoStreamController to break the controller-service layering violation
 * where other controllers injected a controller directly.
 * <p>
 * Responsibilities:
 * - Store latest JPEG frame bytes per camera (with OOM guard)
 * - TTL-based frame expiry
 * - Camera stats for SSE broadcasting
 */
@Service
public class FrameService {

    private static final Logger log = LoggerFactory.getLogger(FrameService.class);

    /** Default camera ID */
    private static final String DEFAULT_CAM = "0";

    /** OOM guard: max camera entries in memory */
    private static final int MAX_FRAME_ENTRIES = 32;

    @Value("${app.video.frame-ttl-ms:30000}")
    private long frameTtlMs;

    /** Multi-camera frame storage: camId -> latest frame bytes (JPEG) */
    private final Map<String, byte[]> latestFrameBytes = new ConcurrentHashMap<>();
    private final Map<String, Long> lastFrameIds = new ConcurrentHashMap<>();

    private final AppConfig appConfig;
    private final DemoService demoService;

    public FrameService(AppConfig appConfig, DemoService demoService) {
        this.appConfig = appConfig;
        this.demoService = demoService;
    }

    /**
     * Update frame bytes for a specific camera.
     * The incoming payload is already JPEG, so keep it as-is to avoid extra decode/re-encode work.
     */
    public void updateFrame(byte[] frameBytes, String camId) {
        String id = (camId != null && !camId.isEmpty()) ? camId : DEFAULT_CAM;
        if (frameBytes == null || frameBytes.length == 0) {
            return;
        }
        // OOM guard: evict oldest entry when at capacity
        if (latestFrameBytes.size() >= MAX_FRAME_ENTRIES && !latestFrameBytes.containsKey(id)) {
            String oldest = null;
            long oldestTs = Long.MAX_VALUE;
            for (Map.Entry<String, Long> e : lastFrameIds.entrySet()) {
                if (e.getValue() < oldestTs) {
                    oldestTs = e.getValue();
                    oldest = e.getKey();
                }
            }
            if (oldest != null) {
                latestFrameBytes.remove(oldest);
                lastFrameIds.remove(oldest);
            }
        }
        latestFrameBytes.put(id, frameBytes);
        lastFrameIds.put(id, System.currentTimeMillis());
    }

    /**
     * Update frame for a specific camera. Converts to JPEG bytes immediately.
     */
    public void updateFrame(BufferedImage frame, String camId) {
        String id = (camId != null && !camId.isEmpty()) ? camId : DEFAULT_CAM;
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(frame, "jpg", baos);
            updateFrame(baos.toByteArray(), id);
        } catch (IOException e) {
            log.error("Error encoding frame for cam={}", id, e);
        }
    }

    /**
     * Get latest JPEG bytes for a camera, or null if expired / not present.
     * Expired frames are evicted on read.
     */
    public byte[] getFrameBytes(String cam) {
        Long ts = lastFrameIds.get(cam);
        if (ts != null && System.currentTimeMillis() - ts > frameTtlMs) {
            latestFrameBytes.remove(cam);
            lastFrameIds.remove(cam);
            return null;
        }
        return latestFrameBytes.get(cam);
    }

    /**
     * Camera stats for SSE broadcasting.
     * Returns a map with "cameras" list and "activeCount".
     */
    public Map<String, Object> getCameraStats() {
        // Demo mode: return virtual camera stats
        if (appConfig != null && appConfig.isDemoMode() && demoService != null) {
            Map<String, Object> stats = new LinkedHashMap<>();
            java.util.List<Map<String, Object>> camList = new java.util.ArrayList<>();
            java.util.Random rand = new java.util.Random();
            for (String[] def : DemoService.CAMERA_DEFS) {
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("id", def[0]);
                info.put("name", def[1]);
                boolean online = rand.nextDouble() > 0.2;
                info.put("online", online);
                info.put("personCount", online ? rand.nextInt(5) + 1 : 0);
                camList.add(info);
            }
            stats.put("cameras", camList);
            stats.put("activeCount", DemoService.CAMERA_DEFS.length);
            return stats;
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        long now = System.currentTimeMillis();
        java.util.List<Map<String, Object>> camList = new java.util.ArrayList<>();
        for (Map.Entry<String, byte[]> entry : latestFrameBytes.entrySet()) {
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("id", entry.getKey());
            Long ts = lastFrameIds.get(entry.getKey());
            info.put("online", ts != null && (now - ts) < frameTtlMs);
            camList.add(info);
        }
        stats.put("cameras", camList);
        stats.put("activeCount", latestFrameBytes.size());
        return stats;
    }

    /**
     * Get the set of camera IDs that currently have frames in memory.
     */
    public java.util.Set<String> getActiveCameraIds() {
        return latestFrameBytes.keySet();
    }
}
