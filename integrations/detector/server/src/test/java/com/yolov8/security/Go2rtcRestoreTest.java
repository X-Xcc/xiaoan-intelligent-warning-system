package com.yolov8.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.repository.CameraRepository;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.Go2rtcService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

import java.nio.file.Path;
import java.util.List;
import java.util.ArrayList;

import static org.junit.jupiter.api.Assertions.*;

class Go2rtcRestoreTest {
    @TempDir Path directory;

    @Test
    void restoresMissingStreamsAfterSidecarRestartWithoutOverwritingExistingStreams() throws Exception {
        CameraConfigService.Camera camera = new CameraConfigService.Camera();
        camera.setId("fixture");
        camera.setType("rtsp");
        camera.setEnabled(true);
        camera.setAddress("rtsp://camera.example.invalid/live");
        camera.setGo2rtcId("cam_fixture");
        CameraRepository repository = new CameraRepository(null) {
            @Override public List<CameraConfigService.Camera> findAll() { return List.of(camera); }
        };
        List<String> registrations = new ArrayList<>();
        Go2rtcService go2rtc = new Go2rtcService(new AppConfig(), new ObjectMapper()) {
            private final com.fasterxml.jackson.databind.node.ObjectNode streams = new ObjectMapper().createObjectNode();
            @Override public boolean isApiAvailable() { return true; }
            @Override public JsonNode getAllStreams() { return streams; }
            @Override public void addStream(String id, String source) {
                registrations.add(id);
                assertEquals("rtsp://camera.example.invalid/live", source);
                streams.putObject(id);
            }
        };
        AppConfig config = new AppConfig();
        config.getPython().setScriptPath(directory.resolve("monitor.py").toString());
        CameraConfigService service = new CameraConfigService(
                repository, new ObjectMapper(), go2rtc, config, new MockEnvironment());
        service.syncGo2rtcStreams();
        service.syncGo2rtcStreams();
        assertEquals(List.of("cam_fixture"), registrations);
    }
}
