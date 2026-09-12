package com.yolov8.security.controller;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.config.AuthFilter;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.CameraConfigService.Camera;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.AutowiredAnnotationBeanPostProcessor;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.context.annotation.ContextAnnotationAutowireCandidateResolver;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CameraConfigInternalTest {
    private static final String KEY = "fixture-service-key";
    private static final String ENDPOINT = "/api/internal/camera_config";
    private static final String ADDRESS =
            "rtsp://fixture-user:fixture-url-secret@camera.example.invalid/live?token=fixture-token";
    private static final String MJPEG =
            "https://fixture-user:fixture-mjpeg-secret@camera.example.invalid/mjpeg?auth=fixture-auth";

    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper();
    private CameraConfigService service;
    private MockMvc mvc;
    private int reads;
    private boolean failRead;

    @BeforeEach
    void setUp() throws Exception {
        Camera camera = new Camera();
        camera.setId("fixture");
        camera.setType("rtsp");
        camera.setName("Fixture camera");
        camera.setUsername("fixture-user");
        camera.setPassword("fixture-password");
        camera.setAddress(ADDRESS);
        camera.setHttpMjpegUrl(MJPEG);
        CameraConfigService.CamerasWrapper wrapper = new CameraConfigService.CamerasWrapper();
        wrapper.setCameras(List.of(camera));
        Path saved = directory.resolve("saved-cameras.json");
        mapper.writeValue(saved.toFile(), wrapper);
        List<Camera> persisted = mapper.readValue(saved.toFile(),
                CameraConfigService.CamerasWrapper.class).getCameras();

        AppConfig config = new AppConfig();
        config.getPython().setScriptPath(directory.resolve("unused.py").toString());
        service = new CameraConfigService(null, mapper, null, config, null) {
            @Override public List<Camera> getAllCameras() {
                reads++;
                if (failRead) throw new IllegalStateException(ADDRESS);
                return persisted;
            }
        };
        mvc = configuredMvc(KEY);
    }

    @Test
    void serviceKeyReceivesPersistedPrivateCredentialsWithNoStoreHeaders() throws Exception {
        String json = mvc.perform(get(ENDPOINT).header("X-API-Key", KEY))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("private")))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andReturn().getResponse().getContentAsString();
        JsonNode camera = mapper.readTree(json).path("data").get(0);
        assertEquals("fixture-user", camera.path("username").asText());
        assertEquals("fixture-password", camera.path("password").asText());
        assertEquals(ADDRESS, camera.path("address").asText());
        assertEquals(MJPEG, camera.path("httpMjpegUrl").asText());
        assertEquals(1, reads);
    }

    @Test
    void missingKeyAllowsAnonymousSourceAccess() throws Exception {
        mvc.perform(get(ENDPOINT)).andExpect(status().isOk());
        assertEquals(1, reads);
    }

    @Test
    void obsoleteKeyIsIgnored() throws Exception {
        mvc.perform(get(ENDPOINT).header("X-API-Key", "wrong-fixture-key"))
                .andExpect(status().isOk());
        assertEquals(1, reads);
    }

    @Test
    void legacyBearerHeaderIsIgnored() throws Exception {
        mvc.perform(get(ENDPOINT).header("Authorization", bearer()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
        assertEquals(1, reads);
    }

    @Test
    void legacyHeadersDoNotRestrictSourceAccess() throws Exception {
        mvc.perform(get(ENDPOINT).header("Authorization", bearer()).header("X-API-Key", "wrong-fixture-key"))
                .andExpect(status().isOk());
        assertEquals(1, reads);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void missingOrBlankConfiguredKeyDoesNotRestrictAccess(String configuredKey) throws Exception {
        configuredMvc(configuredKey).perform(get(ENDPOINT).header("Authorization", bearer())
                        .header("X-API-Key", KEY))
                .andExpect(status().isOk());
        assertEquals(1, reads);
    }

    @Test
    void regularBrowserEndpointRemainsSanitizedEvenForServiceKey() throws Exception {
        String json = mvc.perform(get("/api/camera_config").header("X-API-Key", KEY))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode camera = mapper.readTree(json).path("data").get(0);
        assertFalse(camera.has("password"));
        assertFalse(camera.has("username"));
        assertEquals("rtsp://camera.example.invalid/live", camera.path("address").asText());
        assertEquals("https://camera.example.invalid/mjpeg", camera.path("httpMjpegUrl").asText());
    }

    @Test
    void privateReadFailureDoesNotExposeOrLogCredentials() throws Exception {
        failRead = true;
        Logger logger = (Logger) LoggerFactory.getLogger(CameraConfigController.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        try {
            String json = mvc.perform(get(ENDPOINT).header("X-API-Key", KEY))
                    .andExpect(status().isInternalServerError())
                    .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                    .andReturn().getResponse().getContentAsString();
            assertFalse(json.contains("fixture-url-secret"));
            for (ILoggingEvent event : logs.list) {
                assertFalse(event.getFormattedMessage().contains("fixture-url-secret"));
                assertFalse(event.getFormattedMessage().contains(KEY));
                assertNull(event.getThrowableProxy());
            }
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    private String bearer() {
        return "Bearer legacy-token";
    }

    private MockMvc configuredMvc(String configuredKey) {
        MockEnvironment environment = new MockEnvironment();
        if (configuredKey != null) environment.setProperty("app.api-key", configuredKey);
        DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
        beans.setAutowireCandidateResolver(new ContextAnnotationAutowireCandidateResolver());
        beans.addEmbeddedValueResolver(environment::resolveRequiredPlaceholders);
        AutowiredAnnotationBeanPostProcessor injector = new AutowiredAnnotationBeanPostProcessor();
        injector.setBeanFactory(beans);
        CameraConfigController controller = new CameraConfigController(service);
        AuthFilter filter = new AuthFilter();
        injector.processInjection(controller);
        injector.processInjection(filter);
        return MockMvcBuilders.standaloneSetup(controller).addFilters(filter).build();
    }
}
