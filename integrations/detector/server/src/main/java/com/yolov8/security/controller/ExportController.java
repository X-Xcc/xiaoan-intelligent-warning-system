package com.yolov8.security.controller;

import com.yolov8.security.model.DetectionData;
import com.yolov8.security.service.DetectionService;
import com.yolov8.security.util.CsvEscaper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * CSV 导出
 */
@RestController
@RequestMapping("/api")
public class ExportController {

    private static final Logger log = LoggerFactory.getLogger(ExportController.class);

    private final DetectionService detectionService;

    public ExportController(DetectionService detectionService) {
        this.detectionService = detectionService;
    }

    @GetMapping("/export/csv")
    public ResponseEntity<byte[]> exportCsv() {
        try {
            List<DetectionData> detections = detectionService.getDetections();
            StringBuilder csv = new StringBuilder();
            csv.append("timestamp,person_count,actions,fps,image_filename\n");
            for (DetectionData det : detections) {
                csv.append(CsvEscaper.field(det.getTimestamp()))
                   .append(',').append(det.getPersonCount())
                   .append(',').append(CsvEscaper.field(
                       det.getActions() != null ? String.join(";", det.getActions()) : ""))
                   .append(',').append(String.format("%.1f", det.getFps()))
                   .append(',').append(CsvEscaper.field(
                       det.getImageFilename() != null ? det.getImageFilename() : ""))
                   .append('\n');
            }
            byte[] bytes = csv.toString().getBytes(StandardCharsets.UTF_8);
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=detections.csv")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
        } catch (Exception e) {
            log.error("导出CSV失败", e);
            return ResponseEntity.status(500)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(("{\"status\":\"error\",\"message\":\"导出 CSV 失败\"}").getBytes(StandardCharsets.UTF_8));
        }
    }
}
