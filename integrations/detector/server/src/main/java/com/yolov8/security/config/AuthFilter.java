package com.yolov8.security.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class AuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(AuthFilter.class);
    private static final String HEADER = "X-API-Key";
    // NOTE: /api/update_frame, /api/model_info, /api/gpu_status, /api/cleanup
    // now require authentication (API key or JWT)
    private static final String[] PUBLIC_PATHS = {
        "/", "/index", "/index.html", "/login", "/annotation", "/annotation.html",
        "/training", "/training.html", "/model-training",
        "/static/**", "/error", "/api/login",
        "/video_feed", "/api/images/**",
        "/dashboard", "/monitor", "/alerts", "/devices",
        "/evidence", "/analysis", "/maintenance", "/audit",
        "/monitor/**", "/assets/**",
        "/api/detection/status",
        "/api/discover"
    };

    // GET-only public API paths (monitor dashboard data)
    private static final String[] PUBLIC_GET_API_PATHS = {
        "/api/stats", "/api/stats/summary", "/api/stats/trend",
        "/api/cameras",
        "/api/model_info", "/api/ai/status", "/api/system_metrics",
        "/api/system_info", "/api/devices", "/api/me",
        "/api/alerts", "/api/audit_logs", "/api/streams/status",
        "/api/annotations", "/api/annotations/**"
    };

    @Value("${app.api-key:}")
    private String apiKey;

    private final AntPathMatcher matcher = new AntPathMatcher();
    private final JwtService jwtService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        String cp = request.getContextPath();
        if (!cp.isEmpty() && path.startsWith(cp)) {
            path = path.substring(cp.length());
        }
        if (path.isEmpty()) {
            path = "/";
        }
        // Public paths (all methods)
        for (String p : PUBLIC_PATHS) {
            if (matcher.match(p, path)) return true;
        }
        // GET-only public API paths
        if ("GET".equalsIgnoreCase(request.getMethod())) {
            for (String p : PUBLIC_GET_API_PATHS) {
                if (matcher.match(p, path)) return true;
            }
        }
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (apiKey != null && !apiKey.isBlank()) {
            String key = request.getHeader(HEADER);
            if (key != null && MessageDigest.isEqual(
                    apiKey.getBytes(StandardCharsets.UTF_8),
                    key.getBytes(StandardCharsets.UTF_8))) {
                chain.doFilter(request, response);
                return;
            }
        }

        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ") && jwtService.isConfigured()) {
            String token = authHeader.substring(7);
            if (jwtService.isValid(token)) {
                chain.doFilter(request, response);
                return;
            }
            log.debug("JWT validation failed");
        }

        log.warn("Unauthorized access {} from {}", request.getRequestURI(), request.getRemoteAddr());

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(ApiResponse.error("Unauthorized")));
    }
}
