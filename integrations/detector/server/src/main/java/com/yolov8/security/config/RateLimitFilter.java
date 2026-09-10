package com.yolov8.security.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final int MAX_REQUESTS = 60;
    private static final long WINDOW_MS = 60_000L;

    private static final List<String> PUBLIC_PATHS = List.of(
        "/", "/index", "/static", "/error",
        "/api/monitor_status", "/video_feed", "/api/sse"
    );

    private final ConcurrentHashMap<String, RateBucket> buckets = new ConcurrentHashMap<>();
    private final AtomicInteger requestCount = new AtomicInteger(0);

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String cp = request.getContextPath();
        if (cp != null && !cp.isEmpty() && uri.startsWith(cp)) {
            uri = uri.substring(cp.length());
        }
        if (uri.isEmpty()) uri = "/";
        return PUBLIC_PATHS.stream().anyMatch(uri::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws IOException, ServletException {
        String ip = request.getRemoteAddr();
        long now = System.currentTimeMillis();

        RateBucket b = buckets.computeIfAbsent(ip, k -> new RateBucket(now));
        b.lastAccess = now;

        // Probabilistic cleanup: every 100 requests, evict buckets idle > 5 min
        if (requestCount.incrementAndGet() % 100 == 0) {
            long cutoff = System.currentTimeMillis() - 300_000;
            buckets.entrySet().removeIf(e -> e.getValue().lastAccess < cutoff);
        }

        synchronized (b) {
            if (now - b.startMs > WINDOW_MS) {
                b.startMs = now;
                b.count = 0;
            }
            if (++b.count > MAX_REQUESTS) {
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"status\":\"error\",\"message\":\"Rate limit exceeded\"}");
                return;
            }
        }

        chain.doFilter(request, response);
    }

    private static class RateBucket {
        long startMs;
        int count;
        volatile long lastAccess;
        RateBucket(long startMs) {
            this.startMs = startMs;
            this.lastAccess = startMs;
        }
    }
}
