package com.yolov8.security.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.config.AuthFilter;
import com.yolov8.security.service.AlertService;
import com.yolov8.security.service.AuditLogService;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.CameraConfigService.Camera;
import com.yolov8.security.service.DetectionService;
import com.yolov8.security.service.FrameService;
import com.yolov8.security.service.KanbanEventBus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.BiConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SsePrivacyTest {
    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper();
    private SseController controller;
    private MockMvc mvc;
    private Camera camera;
    private Set<BiConsumer<String, Object>> previousSubscribers;

    @BeforeEach
    void setUp() {
        previousSubscribers = new HashSet<>(busSubscribers());
        camera = new Camera();
        camera.setId("fixture");
        camera.setType("rtsp");
        camera.setName("Fixture camera");
        camera.setUsername("fixture-user");
        camera.setPassword("fixture-password");
        camera.setAddress("rtsp://fixture-user:fixture-url-secret@camera.example.invalid/live?token=fixture-token");
        camera.setHttpMjpegUrl("https://fixture-user:fixture-mjpeg-secret@camera.example.invalid/mjpeg?auth=fixture-auth");
        AppConfig config = new AppConfig();
        config.getPython().setScriptPath(directory.resolve("unused.py").toString());
        config.getFile().setUploadDir(directory.toString());
        CameraConfigService cameras = new CameraConfigService(null, mapper, null, config, null) {
            @Override public List<Camera> getAllCameras() { return List.of(camera); }
        };
        AlertService alerts = new AlertService(config, mapper);
        AuditLogService audit = new AuditLogService(config, mapper);
        controller = new SseController(mapper, cameras, alerts, audit,
                null, new FrameService(config, null), config);
        ((ScheduledExecutorService) ReflectionTestUtils.getField(controller, "scheduler")).shutdownNow();
        AuthFilter filter = new AuthFilter();
        mvc = MockMvcBuilders.standaloneSetup(controller).addFilters(filter).build();
    }

    @AfterEach
    void tearDown() {
        if (controller != null) controller.destroy();
        // Preserve other tests' subscriptions even when testing the pre-fix implementation.
        busSubscribers().removeIf(subscriber -> !previousSubscribers.contains(subscriber));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "Bearer invalid-fixture-token"})
    void acceptsMissingOrInvalidLegacyAuthentication(String authorization) throws Exception {
        mvc.perform(get("/api/sse/stream").header("Authorization", authorization))
                .andExpect(status().isOk()).andExpect(request().asyncStarted());
    }

    @Test
    void validApiKeyReceivesSanitizedInitialSnapshot() throws Exception {
        MvcResult result = mvc.perform(get("/api/sse/stream").header("X-API-Key", "fixture-api-key"))
                .andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
        assertSafe(cameraEvents(result).get(0));
    }

    @Test
    void anonymousClientReceivesSanitizedInitialSnapshotWithoutChangingPersistence() throws Exception {
        MvcResult result = connect();
        assertSafe(cameraEvents(result).get(0));
        JsonNode persisted = mapper.valueToTree(camera);
        assertEquals("fixture-password", persisted.path("password").asText());
        assertTrue(persisted.path("address").asText().contains("fixture-url-secret"));
        assertTrue(persisted.path("httpMjpegUrl").asText().contains("fixture-mjpeg-secret"));
    }

    @Test
    void cameraBroadcastUsesTheSameSanitizedDtoAsTheInitialSnapshot() throws Exception {
        MvcResult result = connect();
        KanbanEventBus.publish("cameras", List.of(camera));
        List<JsonNode> events = cameraEvents(result);
        assertEquals(2, events.size());
        assertSafe(events.get(1));
        assertEquals(events.get(0), events.get(1));
    }

    @Test
    void mapAndJsonTreeCameraBroadcastsCannotBypassSanitization() throws Exception {
        MvcResult result = connect();
        Map<String, Object> value = mapper.convertValue(camera, new TypeReference<>() {});
        value.remove("username");
        value.put("user", "fixture-user");
        KanbanEventBus.publish("cameras", List.of(value));
        KanbanEventBus.publish("cameras", mapper.valueToTree(List.of(camera)));
        List<JsonNode> events = cameraEvents(result);
        assertEquals(3, events.size());
        events.forEach(this::assertSafe);
    }

    @Test
    void unsupportedCameraPayloadIsNotBroadcastVerbatim() throws Exception {
        MvcResult result = connect();
        KanbanEventBus.publish("cameras", Map.of("password", "fixture-unexpected-secret"));
        assertEquals(1, cameraEvents(result).size());
        assertFalse(result.getResponse().getContentAsString().contains("fixture-unexpected-secret"));
    }

    @Test
    void unrelatedBroadcastPayloadsAreUnchanged() throws Exception {
        MvcResult result = connect();
        KanbanEventBus.publish("camera_stats", Map.of("online", 2));
        assertTrue(result.getResponse().getContentAsString().contains("event:camera_stats"));
        assertTrue(result.getResponse().getContentAsString().contains("\"online\":2"));
    }

    @Test
    void destroyUnsubscribesFromEventBus() {
        assertEquals(previousSubscribers.size() + 1, busSubscribers().size());
        controller.destroy();
        assertEquals(previousSubscribers, busSubscribers());
    }

    private MvcResult connect() throws Exception {
        return mvc.perform(get("/api/sse/stream"))
                .andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
    }

    private List<JsonNode> cameraEvents(MvcResult result) throws Exception {
        Matcher matcher = Pattern.compile("(?m)^event:cameras\\r?\\ndata:(.+)$")
                .matcher(result.getResponse().getContentAsString());
        List<JsonNode> events = new ArrayList<>();
        while (matcher.find()) events.add(mapper.readTree(matcher.group(1)));
        assertFalse(events.isEmpty(), "Missing camera snapshot");
        return events;
    }

    private void assertSafe(JsonNode cameras) {
        JsonNode value = cameras.get(0);
        assertNotNull(value);
        assertEquals("fixture", value.path("id").asText());
        assertEquals("Fixture camera", value.path("name").asText());
        assertFalse(value.has("password"));
        assertFalse(value.has("username"));
        assertFalse(value.has("user"));
        assertEquals("rtsp://camera.example.invalid/live", value.path("address").asText());
        assertEquals("https://camera.example.invalid/mjpeg", value.path("httpMjpegUrl").asText());
        assertFalse(cameras.toString().contains("fixture-password"));
        assertFalse(cameras.toString().contains("fixture-token"));
    }

    @SuppressWarnings("unchecked")
    private Set<BiConsumer<String, Object>> busSubscribers() {
        return (Set<BiConsumer<String, Object>>) ReflectionTestUtils.getField(KanbanEventBus.class, "subscribers");
    }
}
