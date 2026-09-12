package com.yolov8.security.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class AuthFilterPrivacyTest {
    private AuthFilter filter;

    @BeforeEach
    void setUp() {
        filter = new AuthFilter();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/camera_config", "/api/camera_config/",
            "/api/camera_config/fixture", "/api/camera_config/fixture/details", "/api/sse/stream"})
    void cameraConfigurationAllowsAnonymousAccess(String path) throws Exception {
        assertAllowed(new MockHttpServletRequest("GET", path));
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT", "DELETE", "HEAD"})
    void cameraWritesAllowAnonymousAccess(String method) throws Exception {
        assertAllowed(new MockHttpServletRequest(method, "/api/camera_config"));
    }

    @Test
    void contextPathAllowsAnonymousAccess() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/detector/api/camera_config");
        request.setContextPath("/detector");
        assertAllowed(request);
    }

    @Test
    void validApiKeyStillWorks() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/camera_config");
        request.addHeader("X-API-Key", "fixture-api-key");
        assertAllowed(request);
    }

    @Test
    void legacyBearerHeaderIsIgnored() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/camera_config");
        request.addHeader("Authorization", "Bearer legacy-token");
        assertAllowed(request);
    }

    @Test
    void invalidCredentialsAreIgnored() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/camera_config");
        request.addHeader("X-API-Key", "incorrect-key");
        request.addHeader("Authorization", "Bearer invalid-token");
        assertAllowed(request);
    }

    @Test
    void noAuthenticationConfigurationIsRequired() throws Exception {
        filter = new AuthFilter();
        assertAllowed(new MockHttpServletRequest("GET", "/api/camera_config"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/cameras", "/api/stats", "/api/streams/status", "/login"})
    void unrelatedPublicReadEndpointsRemainPublic(String path) throws Exception {
        assertAllowed(new MockHttpServletRequest("GET", path));
    }

    private void assertAllowed(MockHttpServletRequest request) throws Exception {
        AtomicBoolean called = new AtomicBoolean();
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> called.set(true));
        assertTrue(called.get(), "Anonymous request must reach the handler");
        assertEquals(200, response.getStatus());
    }

}
