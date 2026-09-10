package com.yolov8.security.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 签发与验证 — 统一 AuthFilter 和 AuthController 的 JWT 逻辑
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    @Value("${app.jwt.secret:}")
    private String jwtSecret;

    @Value("${app.jwt.expiration:86400000}")
    private long jwtExpiration;

    private SecretKey jwtKey;

    @PostConstruct
    public void init() {
        if (jwtSecret != null && !jwtSecret.isBlank()) {
            this.jwtKey = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
            log.info("JWT auth enabled");

            if (jwtSecret.contains("change-this")) {
                log.warn("========== SECURITY WARNING ==========");
                log.warn("JWT_SECRET is using a default placeholder value!");
                log.warn("Set a random 32+ char string via: JWT_SECRET (env var)");
                log.warn("=======================================");
            }
        } else {
            this.jwtKey = null;
            log.warn("JWT secret is not configured, JWT auth will be disabled");
        }
    }

    /** 签发 JWT */
    public String generateToken(String username) {
        checkSecretConfigured();
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(username)
                .issuedAt(new Date(now))
                .expiration(new Date(now + jwtExpiration))
                .signWith(jwtKey)
                .compact();
    }

    /** 获取过期时间（秒） */
    public long getExpirationSeconds() {
        return jwtExpiration / 1000;
    }

    /** 验证 JWT，返回 Claims；失败抛异常 */
    public Claims parseToken(String token) {
        checkSecretConfigured();
        return Jwts.parser()
                .verifyWith(jwtKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /** 验证 JWT 是否有效 */
    public boolean isValid(String token) {
        try {
            parseToken(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 获取 subject (username) */
    public String getUsername(String token) {
        checkSecretConfigured();
        return parseToken(token).getSubject();
    }

    /** JWT 是否已配置 */
    public boolean isConfigured() {
        return jwtKey != null;
    }

    private void checkSecretConfigured() {
        if (jwtSecret == null || jwtSecret.isBlank() || jwtSecret.contains("change-this")) {
            throw new IllegalStateException("JWT secret not configured");
        }
    }
}
