package com.yolov8.security.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.model.AnnotationData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class AnnotationService {

    private static final Logger log = LoggerFactory.getLogger(AnnotationService.class);
    private static final String ANNOTATIONS_DIR = "annotations";
    private static final String UPLOADS_DIR = "uploads";
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(".jpg", ".jpeg", ".png");
    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    private static final String[] COCO_KEYPOINTS = {
        "nose", "left_eye", "right_eye", "left_ear", "right_ear",
        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
        "left_wrist", "right_wrist", "left_hip", "right_hip",
        "left_knee", "right_knee", "left_ankle", "right_ankle"
    };

    private static final int[][] COCO_SKELETON = {
        {1, 2}, {1, 3}, {2, 4}, {3, 5}, {6, 8}, {8, 10}, {7, 9}, {9, 11},
        {6, 7}, {6, 12}, {7, 13}, {12, 13}, {12, 14}, {13, 15}, {14, 16}, {15, 17}
    };

    private final AppConfig appConfig;
    private final ObjectMapper objectMapper;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    public AnnotationService(AppConfig appConfig, ObjectMapper objectMapper) {
        this.appConfig = appConfig;
        this.objectMapper = objectMapper;
    }

    private Path getAnnotationsDir() {
        return Paths.get(appConfig.getFile().getUploadDir()).toAbsolutePath().resolve(ANNOTATIONS_DIR);
    }

    private Path getUploadsDir() {
        return Paths.get(appConfig.getFile().getUploadDir()).toAbsolutePath().resolve(UPLOADS_DIR);
    }

    private Path getDataDir() {
        return Paths.get(appConfig.getFile().getUploadDir()).toAbsolutePath();
    }

    public List<AnnotationData> getAll() {
        lock.readLock().lock();
        try {
            return getAllInternal();
        } finally {
            lock.readLock().unlock();
        }
    }

    private List<AnnotationData> getAllInternal() {
        Path dir = getAnnotationsDir();
        if (!Files.exists(dir)) return new ArrayList<>();
        try (var stream = Files.list(dir)) {
            return stream
                .filter(p -> p.toString().endsWith(".json"))
                .map(this::readAnnotation)
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(AnnotationData::getAnnotatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());
        } catch (IOException e) {
            log.error("Failed to list annotations", e);
            return new ArrayList<>();
        }
    }

    public AnnotationData getByImageFilename(String imageFilename) {
        lock.readLock().lock();
        try {
            Path path = getAnnotationsDir().resolve(sanitizeFilename(imageFilename) + ".json");
            if (!Files.exists(path)) return null;
            return readAnnotation(path);
        } finally {
            lock.readLock().unlock();
        }
    }

    public AnnotationData save(AnnotationData data) {
        lock.writeLock().lock();
        try {
            Path dir = getAnnotationsDir();
            Files.createDirectories(dir);

            if (data.getAnnotatedAt() == null) {
                data.setAnnotatedAt(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            }

            Path path = dir.resolve(sanitizeFilename(data.getImageFilename()) + ".json");
            Path tmpPath = dir.resolve(sanitizeFilename(data.getImageFilename()) + ".json.tmp");

            // Infer labels from bboxes
            Set<String> allLabels = new LinkedHashSet<>();
            if (data.getBboxes() != null) {
                for (var bbox : data.getBboxes()) {
                    if (bbox.getLabels() != null) allLabels.addAll(bbox.getLabels());
                }
            }
            data.setLabels(new ArrayList<>(allLabels));

            // Update status
            if ("unlabeled".equals(data.getStatus()) && !data.getBboxes().isEmpty()) {
                data.setStatus("reviewed");
            }

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(tmpPath.toFile(), data);
            Files.move(tmpPath, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            return data;
        } catch (IOException e) {
            log.error("Failed to save annotation for {}", data.getImageFilename(), e);
            throw new RuntimeException("保存标注失败: " + e.getMessage());
        } finally {
            lock.writeLock().unlock();
        }
    }

    public boolean delete(String imageFilename) {
        lock.writeLock().lock();
        try {
            Path path = getAnnotationsDir().resolve(sanitizeFilename(imageFilename) + ".json");
            if (!Files.exists(path)) return false;
            Files.delete(path);
            return true;
        } catch (IOException e) {
            log.error("Failed to delete annotation for {}", imageFilename, e);
            return false;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public Map<String, Object> getStats() {
        lock.readLock().lock();
        try {
            List<AnnotationData> all = getAllInternal();
            int total = all.size();
            int unlabeled = 0, aiPending = 0, reviewed = 0;
            Map<String, Integer> labelCounts = new LinkedHashMap<>();

            for (AnnotationData a : all) {
                switch (a.getStatus()) {
                    case "unlabeled" -> unlabeled++;
                    case "ai_pending" -> aiPending++;
                    case "reviewed" -> reviewed++;
                }
                if (a.getLabels() != null) {
                    for (String label : a.getLabels()) {
                        labelCounts.merge(label, 1, Integer::sum);
                    }
                }
            }

            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("total", total);
            stats.put("unlabeled", unlabeled);
            stats.put("ai_pending", aiPending);
            stats.put("reviewed", reviewed);
            stats.put("labelCounts", labelCounts);
            return stats;
        } finally {
            lock.readLock().unlock();
        }
    }

    public byte[] exportYolo() {
        lock.readLock().lock();
        try {
            List<AnnotationData> all = getAllInternal();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                for (AnnotationData ann : all) {
                    if (ann.getBboxes() == null || ann.getBboxes().isEmpty()) continue;

                    String txtName = ann.getImageFilename().replaceAll("\\.[^.]+$", "") + ".txt";
                    StringBuilder sb = new StringBuilder();
                    for (var bbox : ann.getBboxes()) {
                        int classId = mapLabelToClassId(bbox.getLabels());
                        double cx = bbox.getX() + bbox.getWidth() / 2.0;
                        double cy = bbox.getY() + bbox.getHeight() / 2.0;
                        sb.append(String.format("%d %.6f %.6f %.6f %.6f", classId, cx, cy, bbox.getWidth(), bbox.getHeight()));

                        // Add keypoints if available
                        var kpGroup = ann.getKeypoints().stream()
                            .filter(kp -> kp.getPersonId() != null && kp.getPersonId().equals(bbox.getId()))
                            .findFirst().orElse(null);
                        if (kpGroup != null && kpGroup.getPoints() != null) {
                            for (String kpName : COCO_KEYPOINTS) {
                                var kp = kpGroup.getPoints().stream()
                                    .filter(p -> p.getName().equals(kpName))
                                    .findFirst().orElse(null);
                                if (kp != null) {
                                    sb.append(String.format(" %.6f %.6f %d", kp.getX(), kp.getY(), kp.getVisible()));
                                } else {
                                    sb.append(" 0.000000 0.000000 0");
                                }
                            }
                        }
                        sb.append("\n");
                    }
                    zos.putNextEntry(new ZipEntry(txtName));
                    zos.write(sb.toString().getBytes());
                    zos.closeEntry();
                }
            }
            return baos.toByteArray();
        } catch (IOException e) {
            log.error("Failed to export YOLO format", e);
            throw new RuntimeException("YOLO 导出失败: " + e.getMessage());
        } finally {
            lock.readLock().unlock();
        }
    }

    public byte[] exportCoco() {
        lock.readLock().lock();
        try {
            List<AnnotationData> all = getAll();

            Map<String, Object> coco = new LinkedHashMap<>();
            coco.put("info", Map.of(
                "description", "Prison Behavior Analysis Dataset",
                "version", "1.0",
                "year", 2026,
                "date_created", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            ));

            // Licenses
            coco.put("licenses", List.of(Map.of("id", 1, "name", "Unknown", "url", "")));

            // Categories
            String[] behaviorClasses = {"fall", "fight", "fatigue", "eye_fatigue", "absent", "crowd"};
            List<Map<String, Object>> categories = new ArrayList<>();
            for (int i = 0; i < behaviorClasses.length; i++) {
                Map<String, Object> cat = new LinkedHashMap<>();
                cat.put("id", i + 1);
                cat.put("name", behaviorClasses[i]);
                cat.put("supercategory", "behavior");
                cat.put("keypoints", List.of(COCO_KEYPOINTS));
                cat.put("skeleton", Arrays.stream(COCO_SKELETON).map(a -> List.of(a[0], a[1])).collect(Collectors.toList()));
                categories.add(cat);
            }
            coco.put("categories", categories);

            // Images + Annotations
            List<Map<String, Object>> images = new ArrayList<>();
            List<Map<String, Object>> annotations = new ArrayList<>();
            int annId = 1;

            for (int imgIdx = 0; imgIdx < all.size(); imgIdx++) {
                AnnotationData ann = all.get(imgIdx);
                Map<String, Object> img = new LinkedHashMap<>();
                img.put("id", imgIdx + 1);
                img.put("file_name", ann.getImageFilename());
                img.put("width", ann.getImageWidth());
                img.put("height", ann.getImageHeight());
                images.add(img);

                if (ann.getBboxes() != null) {
                    for (var bbox : ann.getBboxes()) {
                        Map<String, Object> annotation = new LinkedHashMap<>();
                        annotation.put("id", annId++);
                        annotation.put("image_id", imgIdx + 1);
                        int classId = mapLabelToClassId(bbox.getLabels());
                        annotation.put("category_id", classId + 1);
                        double absX = bbox.getX() * ann.getImageWidth();
                        double absY = bbox.getY() * ann.getImageHeight();
                        double absW = bbox.getWidth() * ann.getImageWidth();
                        double absH = bbox.getHeight() * ann.getImageHeight();
                        annotation.put("bbox", List.of(absX, absY, absW, absH));
                        annotation.put("area", absW * absH);
                        annotation.put("iscrowd", 0);

                        // Keypoints
                        var kpGroup = ann.getKeypoints().stream()
                            .filter(kp -> kp.getPersonId() != null && kp.getPersonId().equals(bbox.getId()))
                            .findFirst().orElse(null);

                        List<Object> kpList = new ArrayList<>();
                        int numKeypoints = 0;
                        if (kpGroup != null && kpGroup.getPoints() != null) {
                            for (String kpName : COCO_KEYPOINTS) {
                                var kp = kpGroup.getPoints().stream()
                                    .filter(p -> p.getName().equals(kpName))
                                    .findFirst().orElse(null);
                                if (kp != null) {
                                    kpList.add(kp.getX() * ann.getImageWidth());
                                    kpList.add(kp.getY() * ann.getImageHeight());
                                    kpList.add(kp.getVisible());
                                    if (kp.getVisible() > 0) numKeypoints++;
                                } else {
                                    kpList.add(0.0);
                                    kpList.add(0.0);
                                    kpList.add(0);
                                }
                            }
                        } else {
                            for (int i = 0; i < COCO_KEYPOINTS.length; i++) {
                                kpList.add(0.0);
                                kpList.add(0.0);
                                kpList.add(0);
                            }
                        }
                        annotation.put("keypoints", kpList);
                        annotation.put("num_keypoints", numKeypoints);
                        annotations.add(annotation);
                    }
                }
            }

            coco.put("images", images);
            coco.put("annotations", annotations);

            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(coco);
        } catch (IOException e) {
            log.error("Failed to export COCO format", e);
            throw new RuntimeException("COCO 导出失败: " + e.getMessage());
        } finally {
            lock.readLock().unlock();
        }
    }

    public String uploadImage(MultipartFile file) {
        if (file.isEmpty()) throw new IllegalArgumentException("文件为空");
        if (file.getSize() > MAX_FILE_SIZE) throw new IllegalArgumentException("文件大小超过 5MB 限制");

        String originalName = file.getOriginalFilename();
        if (originalName == null) throw new IllegalArgumentException("文件名为空");

        String ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_EXTENSIONS.contains(ext)) throw new IllegalArgumentException("仅支持 jpg/png 格式");

        // Generate unique filename
        String uniqueName = "upload_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8) + ext;

        lock.writeLock().lock();
        try {
            Path dir = getUploadsDir();
            Files.createDirectories(dir);
            Path target = dir.resolve(uniqueName);
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
            return uniqueName;
        } catch (IOException e) {
            log.error("Failed to upload image", e);
            throw new RuntimeException("上传失败: " + e.getMessage());
        } finally {
            lock.writeLock().unlock();
        }
    }

    public List<Map<String, Object>> getImageList() {
        lock.readLock().lock();
        try {
            List<Map<String, Object>> result = new ArrayList<>();
            Path annotationsDir = getAnnotationsDir();

            // Only scan uploaded images (detection frames excluded from annotation)
            Path uploadsDir = getUploadsDir();
            if (Files.exists(uploadsDir)) {
                try (var stream = Files.list(uploadsDir)) {
                    stream.filter(p -> {
                        String name = p.getFileName().toString().toLowerCase();
                        return name.endsWith(".jpg") || name.endsWith(".png") || name.endsWith(".jpeg");
                    }).sorted(Comparator.comparing(Path::getFileName).reversed())
                    .forEach(p -> {
                        String name = p.getFileName().toString();
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("filename", name);
                        item.put("source", "upload");
                        item.put("path", "/api/images/uploads/" + name);

                        // Check annotation status
                        Path annPath = annotationsDir.resolve(sanitizeFilename(name) + ".json");
                        if (Files.exists(annPath)) {
                            AnnotationData ann = readAnnotation(annPath);
                            item.put("hasAnnotation", ann != null && ann.getBboxes() != null && !ann.getBboxes().isEmpty());
                            item.put("annotationStatus", ann != null ? ann.getStatus() : "unlabeled");
                        } else {
                            item.put("hasAnnotation", false);
                            item.put("annotationStatus", "unlabeled");
                        }

                        result.add(item);
                    });
                }
            }

            return result;
        } catch (IOException e) {
            log.error("Failed to list images", e);
            return new ArrayList<>();
        } finally {
            lock.readLock().unlock();
        }
    }

    private int mapLabelToClassId(List<String> labels) {
        if (labels == null || labels.isEmpty()) return 0;
        String label = labels.get(0);
        return switch (label) {
            case "fight" -> 1;
            case "fatigue" -> 2;
            case "eye_fatigue" -> 3;
            case "absent" -> 4;
            case "crowd" -> 5;
            default -> 0; // fall
        };
    }

    private String sanitizeFilename(String filename) {
        if (filename == null) return "unknown";
        // Remove path separators and special chars, keep only safe characters
        return filename.replaceAll("[^a-zA-Z0-9._\\-]", "_");
    }

    private AnnotationData readAnnotation(Path path) {
        try {
            return objectMapper.readValue(path.toFile(), AnnotationData.class);
        } catch (IOException e) {
            log.error("Failed to read annotation: {}", path, e);
            return null;
        }
    }
}
