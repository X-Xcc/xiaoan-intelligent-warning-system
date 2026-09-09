package com.yolov8.security.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.config.AuthFilter;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

class CameraSourceAccessTest {
    private static final String KEY = "fixture-machine-key";
    private static final String SECRET = "fixture-camera-password";
    private CameraConfigController controller;
    private MockMvc mvc;
    private String token;
    private boolean fail;

    @BeforeEach
    void setUp() {
        AppConfig config = new AppConfig();
        config.getPython().setScriptPath("/unused/fixture.py");
        CameraConfigService.Camera camera = new CameraConfigService.Camera();
        camera.setId("fixture");
        camera.setType("rtsp");
        camera.setAddress("rtsp://fixture-user:" + SECRET + "@camera.invalid/live");
        camera.setUsername("fixture-user");
        camera.setPassword(SECRET);
        CameraConfigService service = new CameraConfigService(null, new ObjectMapper(), null, config, null) {
            @Override public List<Camera> getAllCameras() {
                if (fail) throw new IllegalStateException(SECRET);
                return List.of(camera);
            }
        };
        controller = new CameraConfigController(service);
        ReflectionTestUtils.setField(controller, "serviceApiKey", KEY);
        JwtService jwt = new JwtService();
        ReflectionTestUtils.setField(jwt, "jwtSecret", "fixture-jwt-signing-key-not-for-production-000000000000");
        ReflectionTestUtils.setField(jwt, "jwtExpiration", 60000L);
        jwt.init();
        token = jwt.generateToken("fixture-browser-user");
        AuthFilter filter = new AuthFilter(jwt);
        ReflectionTestUtils.setField(filter, "apiKey", KEY);
        mvc = MockMvcBuilders.standaloneSetup(controller).addFilters(filter).build();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"wrong-fixture-key"})
    void privateSourcesRejectMissingAndInvalidServiceKeys(String key) throws Exception {
        var request = get("/api/internal/camera_config");
        if (key != null) request.header("X-API-Key", key);
        var response = mvc.perform(request).andReturn().getResponse();
        assertEquals(401, response.getStatus());
        assertFalse(response.getContentAsString().contains(SECRET));
    }

    @Test
    void browserJwtCannotReadPrivateSourceCredentials() throws Exception {
        var response = mvc.perform(get("/api/internal/camera_config")
                .header("Authorization", "Bearer " + token)).andReturn().getResponse();
        assertEquals(403, response.getStatus());
        assertFalse(response.getContentAsString().contains(SECRET));
    }

    @Test
    void browserJwtDoesNotMakeAnInvalidMachineKeyValid() throws Exception {
        var response = mvc.perform(get("/api/internal/camera_config")
                .header("Authorization", "Bearer " + token).header("X-API-Key", "wrong"))
                .andReturn().getResponse();
        assertEquals(403, response.getStatus());
        assertFalse(response.getContentAsString().contains(SECRET));
    }

    @Test
    void configuredServiceKeyReadsThePrivateDetectionContractWithoutCaching() throws Exception {
        var response = mvc.perform(get("/api/internal/camera_config").header("X-API-Key", KEY))
                .andReturn().getResponse();
        assertEquals(200, response.getStatus());
        var data = new ObjectMapper().readTree(response.getContentAsString()).path("data").get(0);
        assertEquals(SECRET, data.path("password").asText());
        assertTrue(data.path("address").asText().contains(SECRET));
        assertEquals("private, no-store", response.getHeader("Cache-Control"));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" "})
    void unconfiguredServiceKeyFailsClosedEvenAfterGeneralAuthentication(String configured) throws Exception {
        ReflectionTestUtils.setField(controller, "serviceApiKey", configured);
        var response = mvc.perform(get("/api/internal/camera_config").header("X-API-Key", KEY))
                .andReturn().getResponse();
        assertEquals(403, response.getStatus());
        assertFalse(response.getContentAsString().contains(SECRET));
    }

    @Test
    void browserCameraInventoryRemainsSanitized() throws Exception {
        var response = mvc.perform(get("/api/camera_config").header("Authorization", "Bearer " + token))
                .andReturn().getResponse();
        assertEquals(200, response.getStatus());
        assertFalse(response.getContentAsString().contains(SECRET));
        assertFalse(new ObjectMapper().readTree(response.getContentAsString()).path("data").get(0).has("password"));
    }

    @Test
    void privateSourceFailuresNeverEchoConnectionCredentials() throws Exception {
        fail = true;
        var response = mvc.perform(get("/api/internal/camera_config").header("X-API-Key", KEY))
                .andReturn().getResponse();
        assertEquals(500, response.getStatus());
        assertFalse(response.getContentAsString().contains(SECRET));
        assertEquals("private, no-store", response.getHeader("Cache-Control"));
    }
}
