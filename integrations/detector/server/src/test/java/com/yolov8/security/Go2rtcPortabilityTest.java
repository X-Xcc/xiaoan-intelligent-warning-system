package com.yolov8.security;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.service.Go2rtcService;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class Go2rtcPortabilityTest {
    @Test
    void registersEncodedSourceAndDestinationWithoutLoggingCredentials() throws Exception {
        AtomicReference<URI> request = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/streams", exchange -> {
            request.set(exchange.getRequestURI());
            exchange.sendResponseHeaders(200, 2);
            exchange.getResponseBody().write("{}".getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });
        server.start();
        Logger logger = (Logger) LoggerFactory.getLogger(Go2rtcService.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        try {
            AppConfig config = new AppConfig();
            config.getGo2rtc().setApiHost("http://127.0.0.1:" + server.getAddress().getPort());
            Go2rtcService service = new Go2rtcService(config, new ObjectMapper());
            String id = "test / stream";
            String source = "rtsp://fixture-user:fixture-password@camera.example.invalid/live?x=1&y=2";
            service.addStream(id, source);
            Map<String, String> query = new HashMap<>();
            for (String pair : request.get().getRawQuery().split("&")) {
                String[] parts = pair.split("=", 2);
                query.put(URLDecoder.decode(parts[0], StandardCharsets.UTF_8),
                        URLDecoder.decode(parts[1], StandardCharsets.UTF_8));
            }
            assertEquals(id, query.get("dst"));
            assertEquals(source, query.get("src"));
            assertTrue(logs.list.stream().noneMatch(event ->
                    event.getFormattedMessage().contains("fixture-password")));
        } finally {
            logger.detachAppender(logs);
            logs.stop();
            server.stop(0);
        }
    }
}
