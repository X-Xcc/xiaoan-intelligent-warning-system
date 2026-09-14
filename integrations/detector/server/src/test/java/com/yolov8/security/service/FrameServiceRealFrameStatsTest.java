package com.yolov8.security.service;

import com.yolov8.security.config.AppConfig;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class FrameServiceRealFrameStatsTest {

    @Test
    void cameraStatsExposeFrameCountAndLastFrameAtForRealFrames() {
        FrameService service = new FrameService(null, null);
        ReflectionTestUtils.setField(service, "frameTtlMs", 30_000L);

        service.updateFrame(new byte[] {0x01, 0x02}, "cam-real");

        Map<String, Object> stats = service.getCameraStats();
        assertEquals(1, stats.get("activeCount"));
        Map<?, ?> camera = (Map<?, ?>) ((java.util.List<?>) stats.get("cameras")).get(0);
        assertEquals("cam-real", camera.get("id"));
        assertEquals(true, camera.get("online"));
        assertEquals(1L, camera.get("frameCount"));
        assertTrue(((Number) camera.get("lastFrameAt")).longValue() > 0);
    }
}
