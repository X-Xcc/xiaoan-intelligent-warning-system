package com.yolov8.security.model;

/**
 * /api/system_info 返回值 DTO
 */
public record SystemInfoDTO(
    String status,
    double dataDirSizeMb,
    int detectionCount,
    int imageCount,
    long jvmUsedMb,
    long jvmMaxMb,
    String message
) {
    public static SystemInfoDTO success(double dataDirSizeMb, int detectionCount,
                                        int imageCount, long jvmUsedMb, long jvmMaxMb) {
        return new SystemInfoDTO("success", dataDirSizeMb, detectionCount,
                imageCount, jvmUsedMb, jvmMaxMb, null);
    }

    public static SystemInfoDTO error(String message) {
        return new SystemInfoDTO("error", 0, 0, 0, 0, 0, message);
    }
}
