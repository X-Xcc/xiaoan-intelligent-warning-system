package com.yolov8.security.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.demo")
public class DemoProperties {

    private boolean enabled = false;
    private long detectionIntervalMs = 6000;
    private int cameraCount = 16;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public long getDetectionIntervalMs() {
        return detectionIntervalMs;
    }

    public void setDetectionIntervalMs(long detectionIntervalMs) {
        this.detectionIntervalMs = detectionIntervalMs;
    }

    public int getCameraCount() {
        return cameraCount;
    }

    public void setCameraCount(int cameraCount) {
        this.cameraCount = cameraCount;
    }
}
