package com.yolov8.security.service;

import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class ModelInfoService {

    private volatile String status = "online";
    private volatile String precision = "FP16";
    private volatile String device = "GPU";
    private volatile double modelSizeMb = 4096;
    private volatile int totalLayers = 128;
    private volatile int convLayers = 64;
    private volatile int quantizedLayers = 32;
    private volatile boolean gpuAvailable = true;
    private volatile boolean halfPrecision = true;
    private volatile long lastUpdate = System.currentTimeMillis();
    private static final long TIMEOUT = 300000; // 5分钟

    public void updateModelInfo(Map<String, Object> modelInfo) {
        if (modelInfo != null) {
            this.status = "online";
            this.precision = String.valueOf(modelInfo.getOrDefault("precision", "FP32"));
            this.device = String.valueOf(modelInfo.getOrDefault("device", "CPU"));
            Object sizeMb = modelInfo.getOrDefault("model_size_mb", 0);
            this.modelSizeMb = sizeMb instanceof Number ? ((Number) sizeMb).doubleValue() : 0;
            Object total = modelInfo.getOrDefault("total_layers", 0);
            this.totalLayers = total instanceof Number ? ((Number) total).intValue() : 0;
            Object conv = modelInfo.getOrDefault("conv_layers", 0);
            this.convLayers = conv instanceof Number ? ((Number) conv).intValue() : 0;
            Object quant = modelInfo.getOrDefault("quantized_layers", 0);
            this.quantizedLayers = quant instanceof Number ? ((Number) quant).intValue() : 0;
            Object gpu = modelInfo.getOrDefault("gpu_available", false);
            this.gpuAvailable = gpu instanceof Boolean ? (Boolean) gpu : false;
            Object half = modelInfo.getOrDefault("half_precision", false);
            this.halfPrecision = half instanceof Boolean ? (Boolean) half : false;
            this.lastUpdate = System.currentTimeMillis();
        }
    }

    public Map<String, Object> getModelInfo() {
        if (System.currentTimeMillis() - lastUpdate > TIMEOUT) {
            this.status = "offline";
        }

        return Map.of(
            "status", status,
            "precision", precision,
            "device", device,
            "model_size_mb", modelSizeMb,
            "total_layers", totalLayers,
            "conv_layers", convLayers,
            "quantized_layers", quantizedLayers,
            "gpu_available", gpuAvailable,
            "half_precision", halfPrecision,
            "last_update", lastUpdate
        );
    }

    public String getStatus() { return status; }
    public String getPrecision() { return precision; }
    public String getDevice() { return device; }
    public double getModelSizeMb() { return modelSizeMb; }
    public boolean isGpuAvailable() { return gpuAvailable; }
}
