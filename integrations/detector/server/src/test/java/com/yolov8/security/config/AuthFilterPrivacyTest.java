package com.yolov8.security.config;

import com.yolov8.security.service.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class AuthFilterPrivacyTest {
    private AuthFilter filter;
    private JwtService jwt;

    @BeforeEach
    void setUp() {
        jwt = new JwtService();
        ReflectionTestUtils.setField(jwt, "jwtSecret", "fixture-only-jwt-key-at-least-32-characters");
        ReflectionTestUtils.setField(jwt, "jwtExpiration", 60000L);
        jwt.init();
        filter = new AuthFilter(jwt);
        ReflectionTestUtils.setField(filter, "apiKey", "fixture-api-key");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/camera_config", "/api/camera_config/",
            "/api/camera_config/fixture", "/api/camera_config/fixture/details", "/api/sse/stream"})
    void cameraConfigurationRequiresAuthentication(String path) throws Exception {
        assertRejected(new MockHttpServletRequest("GET", path));
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT", "DELETE", "HEAD"})
    void otherCameraMethodsStillRequireAuthentication(String method) throws Exception {
        assertRejected(new MockHttpServletRequest(method, "/api/camera_config"));
    }

    @Test
    void contextPathDoesNotBypassAuthentication() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/detector/api/camera_config");
        request.setContextPath("/detector");
        assertRejected(request);
    }

    @Test
    void validApiKeyStillWorks() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/camera_config");
        request.addHeader("X-API-Key", "fixture-api-key");
        assertAllowed(request);
    }

    @Test
    void validJwtStillWorks() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/camera_config");
        request.addHeader("Authorization", "Bearer " + jwt.generateToken("fixture-user"));
        assertAllowed(request);
    }

    @Test
    void invalidCredentialsAreRejected() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/camera_config");
        request.addHeader("X-API-Key", "incorrect-key");
        request.addHeader("Authorization", "Bearer invalid-token");
        assertRejected(request);
    }

    @Test
    void missingAuthenticationConfigurationFailsClosed() throws Exception {
        filter = new AuthFilter(new JwtService());
        assertRejected(new MockHttpServletRequest("GET", "/api/camera_config"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/cameras", "/api/stats", "/api/streams/status", "/login"})
    void unrelatedPublicReadEndpointsRemainPublic(String path) throws Exception {
        assertAllowed(new MockHttpServletRequest("GET", path));
    }

    private void assertRejected(MockHttpServletRequest request) throws Exception {
        AtomicBoolean called = new AtomicBoolean();
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> called.set(true));
        assertFalse(called.get(), "Unauthenticated request reached the handler");
        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("Unauthorized"));
    }

    private void assertAllowed(MockHttpServletRequest request) throws Exception {
        AtomicBoolean called = new AtomicBoolean();
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> called.set(true));
        assertTrue(called.get());
    }
}
