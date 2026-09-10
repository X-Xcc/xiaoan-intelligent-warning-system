package com.yolov8.security;

import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@SpringBootApplication
@EnableScheduling
@EnableAsync
public class YoloV8SecurityApplication extends SpringBootServletInitializer {

    static {
        loadDotEnv();
    }

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(YoloV8SecurityApplication.class);
    }

    public static void main(String[] args) {
        SpringApplication.run(YoloV8SecurityApplication.class, args);
    }

    private static void loadDotEnv() {
        // Try current dir first, then parent (for running from server/)
        Path dotenvFile = null;
        for (String candidate : new String[]{".env", "../.env"}) {
            Path p = Paths.get(candidate).normalize();
            if (Files.exists(p) && Files.isRegularFile(p)) {
                dotenvFile = p.toAbsolutePath();
                break;
            }
        }
        if (dotenvFile == null) return;

        try {
            // 只读 .env 文件中实际定义的 key，不污染系统环境变量
            java.util.List<String> envKeys = java.nio.file.Files.readAllLines(dotenvFile).stream()
                .map(String::trim)
                .filter(l -> !l.isEmpty() && !l.startsWith("#") && l.contains("="))
                .map(l -> l.substring(0, l.indexOf("=")).trim())
                .toList();

            Dotenv dotenv = Dotenv.configure()
                    .directory(dotenvFile.getParent().toString())
                    .filename(".env")
                    .ignoreIfMissing()
                    .load();
            dotenv.entries().forEach(e -> {
                // 只处理 .env 文件中实际定义的 key
                if (!envKeys.contains(e.getKey())) return;
                if (System.getProperty(e.getKey()) == null && System.getenv(e.getKey()) == null) {
                    System.setProperty(e.getKey(), e.getValue());
                }
            });
            System.out.println("Loaded .env from " + dotenvFile + " (" + envKeys.size() + " keys)");
        } catch (Exception e) {
            System.out.println("Warning: failed to load .env: " + e.getMessage());
        }
    }
}
