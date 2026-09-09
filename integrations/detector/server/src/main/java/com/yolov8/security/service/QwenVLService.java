package com.yolov8.security.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class QwenVLService {

    private static final Logger log = LoggerFactory.getLogger(QwenVLService.class);
    private final AppConfig appConfig;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    public QwenVLService(AppConfig appConfig, ObjectMapper objectMapper, RestTemplate restTemplate) {
        this.appConfig = appConfig;
        this.objectMapper = objectMapper;
        this.restTemplate = restTemplate;
    }

    /**
     * 检查 Qwen-VL 服务是否健康
     */
    public boolean isHealthy() {
        try {
            String url = appConfig.getQwenVl().getServiceUrl() + "/health";
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);

            if (response.getStatusCode() == HttpStatus.OK) {
                JsonNode jsonNode = objectMapper.readTree(response.getBody());
                return jsonNode.path("model_loaded").asBoolean(false);
            }
            return false;
        } catch (Exception e) {
            log.error("Qwen-VL 服务健康检查失败", e);
            return false;
        }
    }

    /**
     * 分析图片（Base64 编码）
     *
     * @param base64Image Base64 编码的图片
     * @param prompt      分析提示词
     * @return 分析结果
     */
    public String analyzeImage(String base64Image, String prompt) {
        try {
            String url = appConfig.getQwenVl().getServiceUrl() + "/analyze";

            Map<String, String> requestBody = new HashMap<>();
            requestBody.put("image", base64Image);
            requestBody.put("prompt", prompt);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, String>> request = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);

            if (response.getStatusCode() == HttpStatus.OK) {
                JsonNode jsonNode = objectMapper.readTree(response.getBody());
                if ("success".equals(jsonNode.path("status").asText())) {
                    return jsonNode.path("result").asText();
                } else {
                    return "分析失败: " + jsonNode.path("message").asText();
                }
            } else {
                return "服务错误: " + response.getStatusCode();
            }
        } catch (Exception e) {
            log.error("分析图片失败", e);
            return "分析失败: " + e.getMessage();
        }
    }

    /**
     * 分析图片文件
     *
     * @param imageFile 图片文件
     * @param prompt    分析提示词
     * @return 分析结果
     */
    public String analyzeImageFile(File imageFile, String prompt) {
        try {
            byte[] imageBytes = Files.readAllBytes(imageFile.toPath());
            String base64Image = Base64.getEncoder().encodeToString(imageBytes);
            return analyzeImage(base64Image, prompt);
        } catch (IOException e) {
            log.error("读取图片文件失败", e);
            return "读取图片失败: " + e.getMessage();
        }
    }

    /**
     * 批量分析图片
     *
     * @param base64Images Base64 编码的图片列表
     * @param prompt       分析提示词
     * @return 分析结果列表
     */
    public List<Map<String, Object>> batchAnalyzeImages(List<String> base64Images, String prompt) {
        try {
            String url = appConfig.getQwenVl().getServiceUrl() + "/batch_analyze";

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("images", base64Images);
            requestBody.put("prompt", prompt);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);

            if (response.getStatusCode() == HttpStatus.OK) {
                JsonNode jsonNode = objectMapper.readTree(response.getBody());
                if ("success".equals(jsonNode.path("status").asText())) {
                    return objectMapper.convertValue(
                            jsonNode.path("results"),
                            new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() {}
                    );
                }
            }
            return List.of();
        } catch (Exception e) {
            log.error("批量分析图片失败", e);
            return List.of();
        }
    }

    /**
     * 分析检测到的异常行为图片
     *
     * @param imagePath 图片路径
     * @param actions   检测到的行为列表
     * @return AI 分析结果
     */
    public String analyzeSecurityImage(String imagePath, List<String> actions) {
        try {
            File imageFile = new File(imagePath);
            // Path traversal protection: resolve and verify the path is within the data directory
            Path dataDir = Path.of(appConfig.getFile().getUploadDir()).toAbsolutePath().normalize();
            Path resolved = imageFile.toPath().toAbsolutePath().normalize();
            if (!resolved.startsWith(dataDir)) {
                log.warn("Path traversal attempt blocked: {}", imagePath);
                return "非法文件路径";
            }
            if (!imageFile.exists()) {
                return "图片文件不存在";
            }

            // 构建安全分析提示词
            StringBuilder promptBuilder = new StringBuilder();
            promptBuilder.append("你是一名监狱安全监控专家。请分析这张监控图片，重点关注以下方面：\n\n");

            if (actions != null && !actions.isEmpty()) {
                promptBuilder.append("系统检测到的异常行为：").append(String.join(", ", actions)).append("\n\n");
            }

            promptBuilder.append("请提供以下分析：\n");
            promptBuilder.append("1. 图片中的人数和位置\n");
            promptBuilder.append("2. 人员的行为和姿态\n");
            promptBuilder.append("3. 是否存在安全隐患\n");
            promptBuilder.append("4. 建议的处置措施\n\n");
            promptBuilder.append("请用中文回答，简洁明了。");

            return analyzeImageFile(imageFile, promptBuilder.toString());
        } catch (Exception e) {
            log.error("分析安全图片失败", e);
            return "分析失败: " + e.getMessage();
        }
    }
}
