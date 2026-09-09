package com.yolov8.security.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Service
public class Go2rtcService {

    private static final Logger log = LoggerFactory.getLogger(Go2rtcService.class);

    private final AppConfig.Go2rtcConfig config;
    private final ObjectMapper objectMapper;
    private Process go2rtcProcess;

    public Go2rtcService(AppConfig appConfig, ObjectMapper objectMapper) {
        this.config = appConfig.getGo2rtc();
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void init() {
        if (config.isAutoStart()) startGo2rtc();
    }

    @PreDestroy
    public void destroy() {
        stopGo2rtc();
    }

    public void startGo2rtc() {
        Path binPath = Paths.get(config.getBinaryPath()).toAbsolutePath();
        if (!Files.exists(binPath)) {
            log.warn("go2rtc 不存在: {}，跳过自动启动。请从 https://github.com/AlexxIT/go2rtc/releases 下载放到 server/bin/", binPath);
            return;
        }
        try {
            Path configPath = binPath.getParent().resolve("go2rtc.yaml");
            if (!Files.exists(configPath)) {
                String yaml = String.format(
                    "api:\n  listen: \":%d\"\nrtsp:\n  listen: \":%d\"\nwebrtc:\n  listen: \":%d\"\n",
                    config.getApiPort(), config.getRtspPort(), config.getWebrtcPort()
                );
                Files.writeString(configPath, yaml);
            }

            ProcessBuilder pb = new ProcessBuilder(binPath.toString(), "-config", configPath.toString());
            pb.directory(binPath.getParent().toFile());
            pb.redirectErrorStream(true);
            go2rtcProcess = pb.start();

            Thread outputReader = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(go2rtcProcess.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        log.info("[go2rtc] {}", line);
                    }
                } catch (IOException e) {
                    if (go2rtcProcess.isAlive()) log.error("读取 go2rtc 输出失败", e);
                }
            }, "go2rtc-output");
            outputReader.setDaemon(true);
            outputReader.start();

            log.info("go2rtc 已启动, API: {}", config.getApiHost());
        } catch (IOException e) {
            log.error("启动 go2rtc 失败", e);
        }
    }

    public void stopGo2rtc() {
        if (go2rtcProcess != null && go2rtcProcess.isAlive()) {
            go2rtcProcess.destroy();
            try {
                if (!go2rtcProcess.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) {
                    go2rtcProcess.destroyForcibly();
                }
            } catch (InterruptedException e) {
                go2rtcProcess.destroyForcibly();
                Thread.currentThread().interrupt();
            }
            log.info("go2rtc 已停止");
        }
    }

    public boolean isRunning() {
        return config.isAutoStart()
            ? go2rtcProcess != null && go2rtcProcess.isAlive() : isApiAvailable();
    }

    public boolean isApiAvailable() {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(config.getApiHost() + "/api").openConnection();
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);
            return conn.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    public void addStream(String streamId, String rtspUrl) throws IOException {
        apiRequest("PUT", "/api/streams?dst=" + encode(streamId) + "&src=" + encode(rtspUrl), null);
        log.info("go2rtc stream registered: {}", streamId);
    }

    public void removeStream(String streamId) throws IOException {
        apiRequest("DELETE", "/api/streams?src=" + encode(streamId), null);
        log.info("go2rtc 删除流: {}", streamId);
    }

    public JsonNode getStreamInfo(String streamId) throws IOException {
        String response = apiRequest("GET", "/api/streams?src=" + encode(streamId), null);
        return objectMapper.readTree(response);
    }

    public JsonNode getAllStreams() throws IOException {
        String response = apiRequest("GET", "/api/streams", null);
        return objectMapper.readTree(response);
    }

    public String getRtspUrl(String streamId) {
        return config.getRtspHost() + "/" + streamId;
    }

    public String getWebrtcUrl(String streamId) {
        return config.getApiHost() + "/api/ws?src=" + encode(streamId);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String apiRequest(String method, String path, String body) throws IOException {
        URL url = new URL(config.getApiHost() + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setRequestProperty("Content-Type", "application/json");

            if (body != null) {
                conn.setDoOutput(true);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }

            int code = conn.getResponseCode();
            if (code >= 400) {
                throw new IOException("go2rtc API " + method + " failed with HTTP " + code);
            }

            try (InputStream is = conn.getInputStream()) {
                return new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
        } finally {
            conn.disconnect();
        }
    }
}
