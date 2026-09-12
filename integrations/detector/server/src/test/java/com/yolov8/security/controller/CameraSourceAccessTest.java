package com.yolov8.security.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.config.AuthFilter;
import com.yolov8.security.service.CameraConfigService;
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
        token = "legacy-token";
        AuthFilter filter = new AuthFilter();
        mvc = MockMvcBuilders.standaloneSetup(controller).addFilters(filter).build();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"wrong-fixture-key"})
    void sourceCredentialsRemainAvailableWithoutAServiceKey(String key) throws Exception {
        var request = get("/api/internal/camera_config");
        if (key != null) request.header("X-API-Key", key);
        var response = mvc.perform(request).andReturn().getResponse();
        assertEquals(200, response.getStatus());
        assertTrue(response.getContentAsString().contains(SECRET));
    }

    @Test
    void legacyBearerHeaderDoesNotRestrictSourceAccess() throws Exception {
        var response = mvc.perform(get("/api/internal/camera_config")
                .header("Authorization", "Bearer " + token)).andReturn().getResponse();
        assertEquals(200, response.getStatus());
        assertTrue(response.getContentAsString().contains(SECRET));
    }

    @Test
    void obsoleteHeadersDoNotRestrictSourceAccess() throws Exception {
        var response = mvc.perform(get("/api/internal/camera_config")
                .header("Authorization", "Bearer " + token).header("X-API-Key", "wrong"))
                .andReturn().getResponse();
        assertEquals(200, response.getStatus());
        assertTrue(response.getContentAsString().contains(SECRET));
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
    void anonymousSourcesDoNotRequireConfiguration(String configured) throws Exception {
        var response = mvc.perform(get("/api/internal/camera_config"))
                .andReturn().getResponse();
        assertEquals(200, response.getStatus());
        assertTrue(response.getContentAsString().contains(SECRET));
    }

    @Test
    void browserCameraInventoryRemainsSanitized() throws Exception {
        var response = mvc.perform(get("/api/camera_config"))
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
