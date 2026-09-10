package com.yolov8.security.controller;

import com.yolov8.security.config.AppConfig;
import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.model.LoginRequest;
import com.yolov8.security.model.LoginResponse;
import com.yolov8.security.service.JwtService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    private final JwtService jwtService;
    private final AppConfig appConfig;

    public AuthController(JwtService jwtService, AppConfig appConfig) {
        this.jwtService = jwtService;
        this.appConfig = appConfig;
    }

    @PostConstruct
    public void init() {
        String pwd = appConfig.getAdminPassword();
        if ("123".equals(pwd) || "admin123".equals(pwd)) {
            log.warn("========== SECURITY WARNING ==========");
            log.warn("Admin password is using a weak default value!");
            log.warn("Set a strong password via: ADMIN_PASSWORD (env var)");
            log.warn("=======================================");
        }
        if (jwtSecret != null && jwtSecret.contains("change-this")) {
            log.warn("========== SECURITY WARNING ==========");
            log.warn("JWT_SECRET is using a default placeholder value!");
            log.warn("Set a random 32+ char string via: JWT_SECRET (env var)");
            log.warn("=======================================");
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        if (request.getUsername() == null || request.getUsername().isBlank() ||
            request.getPassword() == null || request.getPassword().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("用户名和密码不能为空"));
        }

        if (constantTimeEquals(appConfig.getAdminUsername(), request.getUsername()) &&
            constantTimeEquals(appConfig.getAdminPassword(), request.getPassword())) {

            String pwd = appConfig.getAdminPassword();
            if ("123".equals(pwd) || "admin123".equals(pwd)) {
                log.warn("SECURITY: Login succeeded with default admin password! Change ADMIN_PASSWORD env var immediately.");
            }

            String token = jwtService.generateToken(request.getUsername());
            return ResponseEntity.ok(new LoginResponse(token, jwtService.getExpirationSeconds()));
        }

        return ResponseEntity.status(401).body(ApiResponse.error("用户名或密码错误"));
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(401).body(ApiResponse.error("未登录"));
        }
        try {
            String token = authHeader.substring(7);
            String username = jwtService.getUsername(token);
            return ResponseEntity.ok(Map.of(
                "username", username,
                "name", username,
                "role", "超级管理员"
            ));
        } catch (Exception e) {
            return ResponseEntity.status(401).body(ApiResponse.error("令牌无效"));
        }
    }
}
