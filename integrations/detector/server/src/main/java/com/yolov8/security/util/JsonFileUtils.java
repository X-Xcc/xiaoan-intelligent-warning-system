package com.yolov8.security.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/** JSON 文件读写工具类，替代 AbstractJsonFileService 继承模式。 */
public class JsonFileUtils {

    private static final Logger log = LoggerFactory.getLogger(JsonFileUtils.class);

    public static <T> List<T> readList(Path filePath, ObjectMapper mapper, TypeReference<List<T>> ref) {
        if (!Files.exists(filePath)) {
            return new ArrayList<>();
        }
        try {
            return mapper.readValue(filePath.toFile(), ref);
        } catch (IOException e) {
            log.error("Failed to read {}", filePath.getFileName(), e);
            return new ArrayList<>();
        }
    }

    public static <T> void writeList(Path filePath, List<T> data, ObjectMapper mapper) {
        Path tmp = filePath.getParent().resolve(filePath.getFileName() + ".tmp");
        try {
            Files.createDirectories(filePath.getParent());
            mapper.writerWithDefaultPrettyPrinter().writeValue(tmp.toFile(), data);
            try {
                Files.move(tmp, filePath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                log.debug("Atomic move not supported, falling back: {}", e.getMessage());
                Files.move(tmp, filePath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            log.error("Failed to write {}", filePath.getFileName(), e);
            try { Files.deleteIfExists(tmp); } catch (IOException ignored) {}
            throw new RuntimeException("写入配置失败: " + e.getMessage());
        }
    }

    public static void cleanupTmp(Path filePath) {
        Path tmp = filePath.getParent().resolve(filePath.getFileName() + ".tmp");
        try {
            Files.deleteIfExists(tmp);
        } catch (IOException e) {
            log.warn("Failed to clean up tmp {}", tmp.getFileName(), e);
        }
    }

    /** 返回一个与 JsonFileUtils 配合使用的带锁读写器。 */
    public static ReadWriteLock newLock() {
        return new ReentrantReadWriteLock();
    }
}
