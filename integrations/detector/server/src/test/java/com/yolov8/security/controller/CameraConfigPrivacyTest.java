package com.yolov8.security.controller;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.config.AuthFilter;
import com.yolov8.security.config.GlobalExceptionHandler;
import com.yolov8.security.repository.CameraRepository;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.CameraConfigService.Camera;
import com.yolov8.security.service.Go2rtcService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CameraConfigPrivacyTest {
    private static final String PASSWORD = "fixture-password";
    private static final String ADDRESS =
            "rtsp://fixture-user:fixture-url-secret@camera.example.invalid:554/live?token=fixture-token#fixture-fragment";
    private static final String PUBLIC_ADDRESS = "rtsp://camera.example.invalid:554/live";
    private static final String MJPEG =
            "https://fixture-user:fixture-mjpeg-secret@camera.example.invalid/mjpeg?auth=fixture-auth";

    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper();
    private EmbeddedDatabase database;
    private CameraConfigService service;
    private CameraRepository repository;
    private StubGo2rtc go2rtc;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder().generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2).build();
        JdbcTemplate jdbc = new JdbcTemplate(database);
        jdbc.execute("""
                CREATE TABLE cameras (
                    id VARCHAR(64) PRIMARY KEY, name VARCHAR(128), type VARCHAR(32),
                    brand VARCHAR(64), model VARCHAR(128), ip VARCHAR(64), port INT,
                    rtsp_url VARCHAR(2048), http_url VARCHAR(2048), username VARCHAR(128),
                    password VARCHAR(128), channel INT, status VARCHAR(32), enabled BOOLEAN,
                    go2rtc_id VARCHAR(64), http_mjpeg_url VARCHAR(2048),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """);
        repository = new CameraRepository(jdbc);
        AppConfig config = new AppConfig();
        config.getPython().setScriptPath(directory.resolve("unused.py").toString());
        go2rtc = new StubGo2rtc();
        service = new CameraConfigService(repository, mapper, go2rtc, config, null);
        AuthFilter filter = new AuthFilter();
        mvc = MockMvcBuilders.standaloneSetup(new CameraConfigController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).addFilters(filter).build();
    }

    @AfterEach
    void tearDown() {
        database.shutdown();
    }

    @Test
    void anonymousListReceivesSanitizedConfiguration() throws Exception {
        repository.insert(camera(), "cam_fixture");
        String json = mvc.perform(get("/api/camera_config")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertFalse(json.contains(PASSWORD));
        assertFalse(json.contains("fixture-url-secret"));
    }

    @Test
    void listReturnsSanitizedDtoWithoutMutatingInternalOrPersistedCameras() throws Exception {
        repository.insert(camera(), "cam_fixture");
        JsonNode data = response(get("/api/camera_config")).path("data").get(0);
        assertSanitized(data);
        assertEquals("fixture", data.path("id").asText());
        assertEquals("Fixture camera", data.path("name").asText());
        assertEquals("cam_fixture", data.path("go2rtcId").asText());
        assertPrivateCamera(service.getAllCameras().get(0));
        assertPrivateCamera(service.getCameraById("fixture"));
        Camera restored = mapper.readValue(mapper.writeValueAsBytes(camera()), Camera.class);
        assertPrivateCamera(restored);
    }

    @Test
    void createReturnsSanitizedDtoAndKeepsInternalStreamSource() throws Exception {
        assertSanitized(response(post("/api/camera_config").content(mapper.writeValueAsBytes(camera()))).path("data"));
        assertPrivateCamera(service.getCameraById("fixture"));
        assertEquals(List.of(ADDRESS), go2rtc.sources);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" "})
    void browserUpdatePreservesOmittedOrBlankCredentials(String password) throws Exception {
        repository.insert(camera(), "cam_fixture");
        ObjectNode update = mapper.createObjectNode();
        update.put("name", "Renamed camera");
        update.put("type", "rtsp");
        update.put("address", PUBLIC_ADDRESS);
        update.put("username", "");
        if (password != null) update.put("password", password);
        assertSanitized(response(put("/api/camera_config/fixture")
                .content(mapper.writeValueAsBytes(update))).path("data"));
        Camera stored = service.getCameraById("fixture");
        assertPrivateCamera(stored);
        assertEquals("Renamed camera", stored.getName());
        assertEquals("cam_fixture", stored.getGo2rtcId());
        assertEquals(List.of(ADDRESS), go2rtc.sources);
    }

    @Test
    void sanitizedGetResponseCanBeSavedWithoutLosingCredentials() throws Exception {
        repository.insert(camera(), "cam_fixture");
        ObjectNode update = (ObjectNode) response(get("/api/camera_config")).path("data").get(0);
        update.put("name", "Round trip");
        assertSanitized(response(put("/api/camera_config/fixture")
                .content(mapper.writeValueAsBytes(update))).path("data"));
        assertPrivateCamera(service.getCameraById("fixture"));
        assertEquals(List.of(ADDRESS), go2rtc.sources);
    }

    @Test
    void savedWrapperRetainsCredentialsThroughJsonFileSerialization() throws Exception {
        repository.insert(camera(), "cam_fixture");
        ObjectNode update = (ObjectNode) response(get("/api/camera_config")).path("data").get(0);
        update.put("name", "Saved camera");
        response(put("/api/camera_config/fixture").content(mapper.writeValueAsBytes(update)));

        CameraConfigService.CamerasWrapper saved = new CameraConfigService.CamerasWrapper();
        saved.setCameras(service.getAllCameras());
        Path file = directory.resolve("saved-cameras.json");
        mapper.writeValue(file.toFile(), saved);
        CameraConfigService.CamerasWrapper restored =
                new ObjectMapper().readValue(file.toFile(), CameraConfigService.CamerasWrapper.class);
        assertEquals(1, restored.getCameras().size());
        assertPrivateCamera(restored.getCameras().get(0));
        assertEquals("Saved camera", restored.getCameras().get(0).getName());
    }

    @Test
    void nameOnlyUpdatePreservesAllPrivateConnectionFields() throws Exception {
        repository.insert(camera(), "cam_fixture");
        response(put("/api/camera_config/fixture").content("{\"name\":\"Renamed camera\"}"));
        assertPrivateCamera(service.getCameraById("fixture"));
        assertEquals(List.of(ADDRESS), go2rtc.sources);
    }

    @Test
    void editingSameCameraPathKeepsHiddenUrlCredentials() throws Exception {
        repository.insert(camera(), "cam_fixture");
        response(put("/api/camera_config/fixture").content("""
                {"name":"Other channel","type":"rtsp","address":"rtsp://camera.example.invalid:554/other",
                 "httpMjpegUrl":"https://camera.example.invalid/other"}
                """));
        Camera stored = service.getCameraById("fixture");
        assertEquals(ADDRESS.replace("/live?", "/other?"), stored.getAddress());
        assertEquals(MJPEG.replace("/mjpeg?", "/other?"), stored.getHttpMjpegUrl());
        assertEquals(List.of(stored.getAddress()), go2rtc.sources);
    }

    @ParameterizedTest
    @ValueSource(strings = {"rtsp://other.example.invalid:554/live",
            "rtsp://camera.example.invalid:8554/live", "https://camera.example.invalid:554/live"})
    void differentCameraOriginDoesNotInheritPrivateUrlComponents(String address) throws Exception {
        repository.insert(camera(), "cam_fixture");
        response(put("/api/camera_config/fixture").content(mapper.writeValueAsBytes(
                Map.of("name", "Other camera", "type", "rtsp", "address", address))));
        assertEquals(address, service.getCameraById("fixture").getAddress());
        assertEquals(List.of(address), go2rtc.sources);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"httpMjpegUrl\":\"https://other.example.invalid/mjpeg\"}",
            "{\"httpMjpegUrl\":\"http://camera.example.invalid/mjpeg\"}",
            "{\"httpMjpegUrl\":\"https://camera.example.invalid:8443/mjpeg\"}",
            "{\"address\":\"rtsp://other.example.invalid/live\"}",
            "{\"type\":\"http_snapshot\"}"
    })
    void changedTargetOrTypeDoesNotInheritBlankCredentials(String json) throws Exception {
        repository.insert(camera(), "cam_fixture");
        ObjectNode update = (ObjectNode) mapper.readTree(json);
        update.put("name", "Changed target");
        update.put("username", "");
        update.put("password", "");
        response(put("/api/camera_config/fixture").content(mapper.writeValueAsBytes(update)));
        Camera stored = service.getCameraById("fixture");
        assertNull(stored.getUsername());
        assertNull(stored.getPassword());
    }

    @Test
    void changedMjpegOriginKeepsOnlyExplicitNewCredentials() throws Exception {
        repository.insert(camera(), "cam_fixture");
        response(put("/api/camera_config/fixture").content("""
                {"name":"New target","httpMjpegUrl":"https://other.example.invalid/mjpeg",
                 "username":"replacement-user"}
                """));
        Camera stored = service.getCameraById("fixture");
        assertEquals("replacement-user", stored.getUsername());
        assertNull(stored.getPassword());
    }

    @Test
    void explicitReplacementCredentialsAreStoredButNotReturned() throws Exception {
        repository.insert(camera(), "cam_fixture");
        Camera update = camera();
        update.setUsername("replacement-user");
        update.setPassword("replacement-password");
        update.setAddress("rtsp://replacement-user:replacement-url-secret@replacement.example.invalid/live");
        update.setHttpMjpegUrl("https://replacement-user:replacement-mjpeg-secret@replacement.example.invalid/mjpeg");
        String body = response(put("/api/camera_config/fixture")
                .content(mapper.writeValueAsBytes(update))).toString();
        assertFalse(body.contains("replacement-password"));
        assertFalse(body.contains("replacement-url-secret"));
        assertFalse(body.contains("replacement-mjpeg-secret"));
        Camera stored = service.getCameraById("fixture");
        assertEquals(update.getUsername(), stored.getUsername());
        assertEquals(update.getPassword(), stored.getPassword());
        assertEquals(update.getAddress(), stored.getAddress());
        assertEquals(update.getHttpMjpegUrl(), stored.getHttpMjpegUrl());
        assertEquals(List.of(update.getAddress()), go2rtc.sources);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "rtsp://fixture%2Duser:fixture%2Dsecret@[2001:db8::1]:554/live?X-Amz-Signature=fixture-token",
            "https://camera.example.invalid/snapshot?%70assword=fixture-token&opaque=fixture-secret#fixture-fragment",
            "rtsp://fixture-user:fixture-secret@camera.example.invalid/bad path",
            "//fixture-user:fixture-secret@camera.example.invalid/live",
            "not-a-url-fixture-secret"
    })
    void alternativeAndMalformedUrlsNeverReturnCredentials(String address) throws Exception {
        Camera camera = camera();
        camera.setAddress(address);
        camera.setHttpMjpegUrl(address);
        repository.insert(camera, "cam_fixture");
        JsonNode data = response(get("/api/camera_config")).path("data").get(0);
        assertFalse(data.path("address").asText().contains("fixture"));
        assertFalse(data.path("httpMjpegUrl").asText().contains("fixture"));
        assertFalse(data.has("password"));
        assertEquals(address, service.getCameraById("fixture").getAddress());
    }

    @Test
    void usbIndexAndOrdinaryMetadataRemainUsable() throws Exception {
        Camera usb = camera();
        usb.setType("usb");
        usb.setAddress(2);
        usb.setUsername(null);
        usb.setPassword(null);
        usb.setHttpMjpegUrl(null);
        repository.insert(usb, null);
        JsonNode data = response(get("/api/camera_config")).path("data").get(0);
        assertEquals(2, data.path("address").intValue());
        assertEquals("usb", data.path("type").asText());
        assertEquals("Fixture camera", data.path("name").asText());
        assertFalse(data.has("password"));
    }

    @Test
    void malformedJsonReturnsGenericBadRequestWithoutLoggingRequestContent() throws Exception {
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        root.addAppender(logs);
        try {
            String body = mvc.perform(post("/api/camera_config").header("X-API-Key", "fixture-api-key")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"password\":\"fixture-parse-secret\", invalid-json"))
                    .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
            assertFalse(body.contains("fixture-parse-secret"));
            for (ILoggingEvent event : logs.list) {
                assertFalse(event.getFormattedMessage().contains("fixture-parse-secret"));
                assertNull(event.getThrowableProxy());
            }
        } finally {
            root.detachAppender(logs);
            logs.stop();
        }
    }

    @Test
    void controllerErrorsDoNotExposeExceptionMessagesOrLogThrowableSecrets() throws Exception {
        CameraConfigService failing = new CameraConfigService(repository, mapper, go2rtc,
                config(), null) {
            @Override public List<Camera> getAllCameras() { throw new IllegalStateException(ADDRESS); }
            @Override public Camera addCamera(Camera camera) { throw new IllegalArgumentException(ADDRESS); }
            @Override public Camera updateCamera(String id, Camera camera) { throw new IllegalArgumentException(ADDRESS); }
            @Override public boolean deleteCamera(String id) { throw new IllegalStateException(ADDRESS); }
            @Override public void deleteAllCameras() { throw new IllegalStateException(ADDRESS); }
        };
        CameraConfigController controller = new CameraConfigController(failing);
        Logger logger = (Logger) LoggerFactory.getLogger(CameraConfigController.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        try {
            List<Object> bodies = List.of(controller.getCameraConfig().getBody(),
                    controller.addCamera(camera()).getBody(),
                    controller.updateCamera("fixture", camera()).getBody(),
                    controller.deleteCamera("fixture").getBody(),
                    controller.deleteAllCameras().getBody(),
                    controller.batchAddCameras(List.of(camera())).getBody(),
                    controller.testCameraConnection(Map.of("type", "http_snapshot",
                            "address", "malformed-fixture-secret")).getBody());
            String json = mapper.writeValueAsString(bodies);
            assertFalse(json.contains("fixture-url-secret"));
            assertFalse(json.contains("malformed-fixture-secret"));
            for (ILoggingEvent event : logs.list) {
                assertFalse(event.getFormattedMessage().contains("fixture-url-secret"));
                assertNull(event.getThrowableProxy(), "Raw exception can include a credential-bearing URL");
            }
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    @Test
    void streamUpdateFailuresDoNotLogCredentials() throws Exception {
        repository.insert(camera(), "cam_fixture");
        go2rtc.fail = true;
        Logger logger = (Logger) LoggerFactory.getLogger(CameraConfigService.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        try {
            response(put("/api/camera_config/fixture").content(mapper.writeValueAsBytes(camera())));
            for (ILoggingEvent event : logs.list) {
                assertFalse(event.getFormattedMessage().contains("fixture-url-secret"));
                assertNull(event.getThrowableProxy());
            }
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    private JsonNode response(MockHttpServletRequestBuilder request) throws Exception {
        String body = mvc.perform(request.header("X-API-Key", "fixture-api-key")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(body);
    }

    private void assertSanitized(JsonNode data) {
        assertFalse(data.has("password"), "Browser response contains a password field");
        assertFalse(data.has("username"), "Browser response contains a camera account");
        assertEquals(PUBLIC_ADDRESS, data.path("address").asText());
        assertEquals("https://camera.example.invalid/mjpeg", data.path("httpMjpegUrl").asText());
        assertFalse(data.toString().contains("fixture-user"));
        assertFalse(data.toString().contains(PASSWORD));
        assertFalse(data.toString().contains("fixture-token"));
    }

    private void assertPrivateCamera(Camera camera) {
        assertEquals("fixture-user", camera.getUsername());
        assertEquals(PASSWORD, camera.getPassword());
        assertEquals(ADDRESS, camera.getAddress());
        assertEquals(MJPEG, camera.getHttpMjpegUrl());
    }

    private Camera camera() {
        Camera camera = new Camera();
        camera.setId("fixture");
        camera.setName("Fixture camera");
        camera.setType("rtsp");
        camera.setAddress(ADDRESS);
        camera.setUsername("fixture-user");
        camera.setPassword(PASSWORD);
        camera.setHttpMjpegUrl(MJPEG);
        camera.setGo2rtcId("cam_fixture");
        return camera;
    }

    private AppConfig config() {
        AppConfig config = new AppConfig();
        config.getPython().setScriptPath(directory.resolve("unused.py").toString());
        return config;
    }

    private static class StubGo2rtc extends Go2rtcService {
        final List<String> sources = new ArrayList<>();
        boolean fail;

        StubGo2rtc() { super(new AppConfig(), new ObjectMapper()); }
        @Override public boolean isApiAvailable() { return true; }
        @Override public void removeStream(String id) {}
        @Override public void addStream(String id, String source) {
            if (fail) throw new IllegalStateException(source);
            sources.add(source);
        }
    }
}
