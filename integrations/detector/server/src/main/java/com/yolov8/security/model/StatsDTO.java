package com.yolov8.security.model;

import java.util.Map;

/**
 * /api/stats/summary 返回值 DTO
 */
public record StatsDTO(
    Map<String, Integer> behaviorCounts,
    int total,
    Map<String, Object> compare
) {}
