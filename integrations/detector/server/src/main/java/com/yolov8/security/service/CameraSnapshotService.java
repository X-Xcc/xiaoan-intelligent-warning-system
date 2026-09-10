package com.yolov8.security.service;

import com.yolov8.security.repository.CameraRepository;
import com.yolov8.security.service.CameraConfigService.Camera;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * HTTP 快照轮询服务。
 *
 * 从配置的网络摄像头地址（如 http://192.0.2.3/）定时抓取 JPEG 快照，
 * 转换为 BufferedImage 后交给 FrameService 缓存，
 * 前端 /video_feed?cam=cam-192.0.2.3 即可实时获取该摄像头的 MJPEG 流。
 *
 * 架构流程：
 *   摄像头 HTTP → CameraSnapshotService (轮询) → FrameService (帧缓存)
 *                                                          ↓
 *   前端 /video_feed?cam=cam-192.0.2.3 ←── MJPEG 输出
 *
 * 使用 java.net.http.HttpClient（Java 17 内置），无需额外依赖。
 */
@Service
public class CameraSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(CameraSnapshotService.class);

    @Value("${app.camera.snapshot.enabled:false}")
    boolean enabled;

    @Value("${app.camera.snapshot.address:}")
    String cameraAddress;

    @Value("${app.camera.snapshot.interval-ms:1000}")
    int pollIntervalMs;

    @Value("${app.camera.snapshot.connect-timeout-ms:5000}")
    int connectTimeoutMs;

    @Value("${app.camera.snapshot.read-timeout-ms:5000}")
    int readTimeoutMs;

    @Value("${app.camera.snapshot.username:}")
    String cameraUsername;

    @Value("${app.camera.snapshot.password:}")
    String cameraPassword;

    @Value("${app.camera.snapshot.id:http-snapshot}")
    String cameraId;

    private final FrameService frameService;
    private final CameraRepository cameraRepository;
    private HttpClient httpClient;
    private ScheduledExecutorService scheduler;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public CameraSnapshotService(FrameService frameService,
                                 CameraRepository cameraRepository) {
        this.frameService = frameService;
        this.cameraRepository = cameraRepository;
    }

    @PostConstruct
    public void start() {
        if (!enabled) {
            log.info("CameraSnapshotService is disabled");
            return;
        }
        if (cameraAddress == null || cameraAddress.isBlank()) {
            log.info("CameraSnapshotService: no camera address configured, skipping");
            return;
        }

        // Auto-register camera if not already present
        registerCamera();

        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMs))
                .build();

        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "camera-snapshot-poller");
            t.setDaemon(true);
            return t;
        });

        log.info("CameraSnapshotService starting: address={}, interval={}ms", cameraAddress, pollIntervalMs);

        running.set(true);
        scheduler.execute(this::pollLoop);
    }

    private void registerCamera() {
        if (!cameraRepository.existsById(cameraId)) {
            Camera cam = new Camera();
            cam.setId(cameraId);
            cam.setName("IP摄像头");
            cam.setType("http_snapshot");
            cam.setAddress(cameraAddress);
            String host = cameraAddress.replace("http://", "").replace("https://", "").split("/")[0];
            cam.setIp(host);
            cam.setPort(80);
            cam.setStatus("online");
            cam.setEnabled(true);
            cam.setUsername(cameraUsername);
            cam.setPassword(cameraPassword);
            cameraRepository.insert(cam, null);
            log.info("Auto-registered HTTP snapshot camera: id={}, address={}", cameraId, cameraAddress);
        } else {
            log.info("Camera {} already exists in database, skipping registration", cameraId);
        }
    }

    @PreDestroy
    public void stop() {
        running.set(false);
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        log.info("CameraSnapshotService stopped");
    }

    private void pollLoop() {
        log.info("Snapshot poller loop started for {}", cameraAddress);

        while (running.get() && !Thread.currentThread().isInterrupted()) {
            try {
                fetchAndProcessFrame();
                Thread.sleep(pollIntervalMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.warn("Snapshot fetch error ({}): {}", cameraAddress, e.getMessage());
                try {
                    Thread.sleep(pollIntervalMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        log.info("Snapshot poller loop ended for {}", cameraAddress);
    }

    private void fetchAndProcessFrame() {
        if (httpClient == null) return;

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(cameraAddress))
                .timeout(Duration.ofMillis(readTimeoutMs))
                .header("User-Agent", "YOLOv8-Security/1.0");

        if (cameraUsername != null && !cameraUsername.isBlank()
                && cameraPassword != null && !cameraPassword.isBlank()) {
            String encoded = Base64.getEncoder().encodeToString(
                    (cameraUsername + ":" + cameraPassword).getBytes(StandardCharsets.UTF_8));
            builder.header("Authorization", "Basic " + encoded);
        }

        HttpRequest request = builder.build();

        HttpResponse<byte[]> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.debug("Connection failed to {}: {}", cameraAddress, e.getMessage());
            return;
        }

        if (response.statusCode() != 200) {
            log.debug("Camera {} returned HTTP {}", cameraAddress, response.statusCode());
            return;
        }

        byte[] body = response.body();
        if (body == null || body.length < 100) {
            log.debug("Camera {} returned empty/small response ({} bytes)",
                    cameraAddress, body != null ? body.length : 0);
            return;
        }

        BufferedImage image;
        try {
            image = ImageIO.read(new ByteArrayInputStream(body));
        } catch (Exception e) {
            log.debug("Failed to decode JPEG from {}: {}", cameraAddress, e.getMessage());
            return;
        }

        if (image == null) {
            log.debug("ImageIO could not decode frame from {}", cameraAddress);
            return;
        }

        // 推帧到 FrameService，前端 /video_feed?cam=cam-192.0.2.3 可消费
        frameService.updateFrame(image, cameraId);
        log.trace("Frame pushed: camId={}, {}x{}, {} bytes",
                cameraId, image.getWidth(), image.getHeight(), body.length);
    }
}
