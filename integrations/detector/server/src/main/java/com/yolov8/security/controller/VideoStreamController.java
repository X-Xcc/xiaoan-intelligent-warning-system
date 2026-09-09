package com.yolov8.security.controller;

import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.FrameService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import jakarta.servlet.http.HttpServletResponse;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import javax.imageio.ImageIO;

@RestController
public class VideoStreamController {

    private static final Logger log = LoggerFactory.getLogger(VideoStreamController.class);

    @Value("${app.video.stream-poll-interval-ms:16}")
    private int streamPollIntervalMs;

    @Value("${app.video.no-frame-poll-interval-ms:200}")
    private int noFramePollIntervalMs;

    private static final long TEST_FRAME_CACHE_MS = 5000L; // 5s cache, avoid flicker

    // Test frame cache per camera
    private final Map<String, BufferedImage> cachedTestFrames = new ConcurrentHashMap<>();
    private final Map<String, Long> cachedTestFrameAtMs = new ConcurrentHashMap<>();

    /** Default camera ID */
    private static final String DEFAULT_CAM = "0";

    private final CameraConfigService cameraConfigService;
    private final FrameService frameService;

    public VideoStreamController(CameraConfigService cameraConfigService, FrameService frameService) {
        this.cameraConfigService = cameraConfigService;
        this.frameService = frameService;
    }

    // Python POST进来，MJPEG读出去
    /**
     * Update frame bytes for a specific camera.
     * Delegates to FrameService for storage.
     */
    public void updateFrame(byte[] frameBytes, String camId) {
        frameService.updateFrame(frameBytes, camId);
    }

    /**
     * Update frame for a specific camera. Converts to JPEG bytes immediately.
     */
    public void updateFrame(BufferedImage frame, String camId) {
        frameService.updateFrame(frame, camId);
    }

    /**
     * Update frame with person count (used by StatsController).
     */
    public void updateFrame(BufferedImage frame, String camId, int personCount) {
        updateFrame(frame, camId);
    }

    /**
     * Legacy single-camera update (backward compatible).
     */
    public void updateFrame(BufferedImage frame) {
        updateFrame(frame, DEFAULT_CAM);
    }

    // ┌──────────────────────────────────────────────┐
    // │  摄像头 HTTP MJPEG 代理 — 绕过浏览器嵌入式凭证限制 │
    // └──────────────────────────────────────────────┘
    /**
     * Proxy camera MJPEG stream. Maps /proxy/cam-N/ to camera's HTTP MJPEG URL.
     */
    @GetMapping(value = "/proxy/{camId}/")
    public void proxyCameraMjpeg(@PathVariable String camId, HttpServletResponse response) {
        // 从 cameras.json 读取目标 URL
        String targetUrl = null;
        String username = null;
        String password = null;
        try {
            var cameras = cameraConfigService.getAllCameras();
            for (var cam : cameras) {
                if (camId.equals(cam.getId())) {
                    targetUrl = cam.getHttpMjpegUrl();
                    username = cam.getUsername();
                    password = cam.getPassword();
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("读取摄像头配置失败: {}", e.getMessage());
        }

        if (targetUrl == null || targetUrl.isEmpty()) {
            response.setStatus(404);
            return;
        }

        // SSRF 防护：验证目标地址，拒绝非已配置摄像头的内网地址
        try {
            java.net.URL url = new java.net.URL(targetUrl);
            java.net.InetAddress addr = java.net.InetAddress.getByName(url.getHost());
            if (CameraConfigController.isPrivateOrReservedIp(addr)) {
                // 内网 IP 仅允许已配置的摄像头地址（proxy 端点只通过 camId 查找，此处已是已配置地址）
                // 但如果有人篡改了 cameras.json 配置，这里仍然暴露风险
                // 额外校验：确认该 camId 确实对应这个 URL
                boolean isConfiguredCamera = false;
                for (var cam : cameraConfigService.getAllCameras()) {
                    if (camId.equals(cam.getId()) && targetUrl.equals(cam.getHttpMjpegUrl())) {
                        isConfiguredCamera = true;
                        break;
                    }
                }
                if (!isConfiguredCamera) {
                    response.setStatus(403);
                    log.warn("SSRF blocked: camId={} resolved to private IP but URL not in config", camId);
                    return;
                }
            }
        } catch (Exception e) {
            log.warn("SSRF check failed for camId={}: {}", camId, e.getMessage());
        }

        try {
            java.net.URL url = new java.net.URL(targetUrl);
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
            try {
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(30000); // 30s timeout, avoid infinite hang on dead cameras
                conn.setRequestProperty("Accept", "multipart/x-mixed-replace, image/jpeg, */*");

                // Basic auth
                if (username != null && !username.isEmpty() && password != null && !password.isEmpty()) {
                    String auth = username + ":" + password;
                    conn.setRequestProperty("Authorization",
                        "Basic " + java.util.Base64.getEncoder().encodeToString(auth.getBytes()));
                }

                int status = conn.getResponseCode();
                if (status >= 200 && status < 400) {
                    response.setContentType(conn.getContentType() != null ? conn.getContentType() : "multipart/x-mixed-replace;boundary=frame");
                    response.setHeader("Cache-Control", "no-cache");
                    response.setHeader("Connection", "keep-alive");

                    try (java.io.InputStream in = conn.getInputStream();
                         java.io.OutputStream out = response.getOutputStream()) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) != -1) {
                            out.write(buf, 0, n);
                            out.flush();
                        }
                    }
                } else {
                    response.setStatus(502);
                    log.warn("摄像头代理返回 HTTP {}: {}", status, targetUrl);
                }
            } finally {
                conn.disconnect();
            }
        } catch (java.io.IOException e) {
            log.debug("摄像头代理断开: {} - {}", camId, e.getMessage());
        }
    }

    /**
     * MJPEG video feed endpoint. Supports ?cam=0, ?cam=1, etc.
     * Returns a Callable so Spring runs the streaming loop on the async task executor,
     * freeing the servlet thread for other requests.
     */
    @GetMapping(value = "/video_feed")
    public Callable<ResponseEntity<StreamingResponseBody>> getVideoFeed(
            @RequestParam(required = false, defaultValue = DEFAULT_CAM) String cam) {
        return () -> {
            StreamingResponseBody stream = outputStream -> {
                try {
                    while (!Thread.currentThread().isInterrupted()) {
                        try {
                            byte[] frameBytes = getFrameBytes(cam);
                            if (frameBytes != null && frameBytes.length > 0) {
                                writeFrame(outputStream, frameBytes);
                                Thread.sleep(streamPollIntervalMs);
                            } else {
                                byte[] testFrame = getTestFrameBytes(cam);
                                if (testFrame.length > 0) {
                                    writeFrame(outputStream, testFrame);
                                }
                                Thread.sleep(noFramePollIntervalMs);
                            }
                        } catch (IOException e) {
                            log.debug("Client disconnected during frame write (cam={})", cam);
                            break;
                        }
                    }
                } catch (InterruptedException e) {
                    log.debug("Video feed interrupted (cam={})", cam);
                    Thread.currentThread().interrupt();
                }
            };
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType("multipart/x-mixed-replace;boundary=frame"))
                    .header("Cache-Control", "no-cache")
                    .header("Connection", "keep-alive")
                    .header("Pragma", "no-cache")
                    .body(stream);
        };
    }

    /**
     * Get list of active cameras (for API).
     * Returns both cameras with live frames AND configured cameras (so frontend can display them).
     */
    @GetMapping(value = "/api/cameras", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> getCameras() {
        // Merge live frame cameras with configured cameras
        java.util.Set<String> allCameraIds = new java.util.LinkedHashSet<>(frameService.getActiveCameraIds());
        try {
            cameraConfigService.getAllCameras().forEach(cam -> allCameraIds.add(cam.getId()));
        } catch (Exception e) {
            log.debug("Failed to load camera config: {}", e.getMessage());
        }
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("status", "success");
        result.put("cameras", allCameraIds);
        result.put("count", allCameraIds.size());
        return result;
    }

    /** Camera stats for SSE broadcasting — delegates to FrameService */
    public Map<String, Object> getCameraStats() {
        return frameService.getCameraStats();
    }

    private byte[] getFrameBytes(String cam) {
        return frameService.getFrameBytes(cam);
    }

    // 无真实帧时生成模拟帧（灰色+文字），用于前端占位显示
    private byte[] getTestFrameBytes(String cam) {
        BufferedImage testFrame = getOrCreateCachedTestFrame(cam);
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(testFrame, "jpg", baos);
            return baos.toByteArray();
        } catch (IOException e) {
            return new byte[0];
        }
    }

    private BufferedImage getOrCreateCachedTestFrame(String cam) {
        long now = System.currentTimeMillis();
        BufferedImage cached = cachedTestFrames.get(cam);
        Long cachedAt = cachedTestFrameAtMs.get(cam);
        if (cached != null && cachedAt != null && (now - cachedAt) < TEST_FRAME_CACHE_MS) {
            return cached;
        }
        BufferedImage fresh = generateTestFrame(cam);
        cachedTestFrames.put(cam, fresh);
        cachedTestFrameAtMs.put(cam, now);
        return fresh;
    }

    private BufferedImage generateTestFrame(String cam) {
        int width = 1280;
        int height = 720;
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = image.createGraphics();

        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // Background
        g2d.setColor(new Color(12, 18, 32));
        g2d.fillRect(0, 0, width, height);

        // Grid
        g2d.setColor(new Color(40, 60, 100));
        for (int i = 0; i < width; i += 50) g2d.drawLine(i, 0, i, height);
        for (int i = 0; i < height; i += 50) g2d.drawLine(0, i, width, i);

        // Camera label centered
        g2d.setColor(new Color(0, 0, 0, 150));
        g2d.fillRect(0, height / 2 - 40, width, 80);

        g2d.setColor(new Color(160, 180, 200));
        g2d.setFont(new Font("Microsoft YaHei", Font.BOLD, 24));
        String label = "等待视频信号 - " + getCameraLabel(cam);
        FontMetrics fm = g2d.getFontMetrics();
        g2d.drawString(label, (width - fm.stringWidth(label)) / 2, height / 2 + 8);

        g2d.dispose();
        return image;
    }

    private String getCameraLabel(String cam) {
        switch (cam) {
            case "0": return "A区-主监控";
            case "1": return "B区-走廊";
            case "2": return "C区-操场";
            default: return "摄像头 " + cam;
        }
    }

    // 写--frame\r\n + Content-Type + JPEG二进制，组成MJPEG multipart协议
    private void writeFrame(OutputStream out, byte[] frameBytes) throws IOException {
        out.write(("--frame\r\n").getBytes());
        out.write(("Content-Type: image/jpeg\r\n").getBytes());
        out.write(("Content-Length: " + frameBytes.length + "\r\n").getBytes());
        out.write(("\r\n").getBytes());
        out.write(frameBytes);
        out.write(("\r\n").getBytes());
        out.flush();
    }
}
