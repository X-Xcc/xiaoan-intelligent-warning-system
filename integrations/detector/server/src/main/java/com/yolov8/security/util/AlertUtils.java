package com.yolov8.security.util;

/**
 * 报警相关工具方法
 */
public final class AlertUtils {

    private AlertUtils() {}

    /**
     * 将行为类型映射为严重级别
     */
    public static String mapSeverity(String action) {
        return switch (action) {
            case "跌倒", "打架" -> "critical";
            case "离岗" -> "high";
            case "人员聚集" -> "low";
            default -> "medium";
        };
    }
}
