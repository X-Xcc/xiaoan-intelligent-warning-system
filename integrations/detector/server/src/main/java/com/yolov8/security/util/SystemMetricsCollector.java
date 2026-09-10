package com.yolov8.security.util;

import com.sun.management.OperatingSystemMXBean;
import java.lang.management.ManagementFactory;
import java.util.LinkedHashMap;
import java.util.Map;

/** 收集系统指标（CPU / 内存 / 磁盘 / 运行时间）。 */
public class SystemMetricsCollector {

    public static String formatUptime() {
        long uptimeMs = ManagementFactory.getRuntimeMXBean().getUptime();
        long days = uptimeMs / 86400000;
        long hours = (uptimeMs % 86400000) / 3600000;
        long minutes = (uptimeMs % 3600000) / 60000;
        return days + "d " + hours + "h " + minutes + "m";
    }

    public static Map<String, Object> collectSystemMetrics() {
        Map<String, Object> m = new LinkedHashMap<>();
        try {
            OperatingSystemMXBean os = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
            m.put("cpuPercent", Math.round(os.getSystemCpuLoad() * 100));
            long total = os.getTotalPhysicalMemorySize();
            long free = os.getFreePhysicalMemorySize();
            m.put("memoryPercent", Math.round((double) (total - free) / total * 100));
            java.io.File root = new java.io.File(".");
            long totalD = root.getTotalSpace();
            m.put("diskPercent", Math.round((double) (totalD - root.getUsableSpace()) / totalD * 100));
        } catch (Exception e) {
            m.put("cpuPercent", 0);
            m.put("memoryPercent", 0);
            m.put("diskPercent", 0);
        }
        m.put("uptime", formatUptime());
        return m;
    }
}
