package com.yolov8.security.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class SecurityHeadersFilter extends OncePerRequestFilter {

    private final String go2rtcHost;

    @Value("${app.security.csp.extra-img-src:}")
    private String extraImgSrc;

    public SecurityHeadersFilter(AppConfig appConfig) {
        this.go2rtcHost = appConfig.getGo2rtc().getApiHost();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String host = request.getServerName();
        String imgSrc = "img-src 'self' data: blob: " + go2rtcHost;
        if (extraImgSrc != null && !extraImgSrc.isBlank()) {
            imgSrc += " " + extraImgSrc;
        }
        String csp = "default-src 'self'; " +
            "script-src 'self' https://cdn.jsdelivr.net; " +
            "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
            imgSrc + "; " +
            "connect-src 'self' " + go2rtcHost + " ws://" + host + ":1984 wss://" + host + ":1984 http://" + host + ":5000 https://" + host + ":5000 http://" + host + ":5001 https://" + host + ":5001; " +
            "frame-src 'self' " + go2rtcHost + " http://" + host + ":1984 https://" + host + ":1984 http://" + host + ":5000 https://" + host + ":5000 http://" + host + ":5001 https://" + host + ":5001; " +
            "font-src 'self' https://fonts.gstatic.com;";
        response.setHeader("Content-Security-Policy", csp);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        chain.doFilter(request, response);
    }
}
