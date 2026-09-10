package com.yolov8.security.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Bean
    public RestTemplate restTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(30000);
        return new RestTemplate(factory);
    }

    /** Resolve web asset root relative to working directory */
    private static String webDir() {
        // Try ../web/ first (running from server/ subdir), then ./web/ (running from project root)
        Path parent = Paths.get("../web").toAbsolutePath().normalize();
        if (java.nio.file.Files.isDirectory(parent)) {
            return parent.toUri().toString();
        }
        Path direct = Paths.get("web").toAbsolutePath().normalize();
        return direct.toUri().toString();
    }

    /** Resolve SPA dist directory */
    private static String distDir() {
        Path parent = Paths.get("../web/dist").toAbsolutePath().normalize();
        if (java.nio.file.Files.isDirectory(parent)) {
            return parent.toUri().toString();
        }
        Path direct = Paths.get("web/dist").toAbsolutePath().normalize();
        return direct.toUri().toString();
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String webRoot = webDir();
        String dist = distDir();
        // SPA compiled assets (React build output)
        registry.addResourceHandler("/assets/**")
                .addResourceLocations(dist + "assets/");
        // External web assets (dev CSS/JS)
        registry.addResourceHandler("/static/css/**")
                .addResourceLocations(webRoot + "css/");
        registry.addResourceHandler("/static/js/**")
                .addResourceLocations(webRoot + "js/");
        registry.addResourceHandler("/css/**")
                .addResourceLocations(webRoot + "css/");
        registry.addResourceHandler("/js/**")
                .addResourceLocations(webRoot + "js/");
        // Fallback: classpath static resources + SPA dist
        registry.addResourceHandler("/static/**")
                .addResourceLocations("classpath:/static/");
        // Catch-all for SPA (index.html fallback)
        registry.addResourceHandler("/**")
                .addResourceLocations(dist, "classpath:/static/");
    }

    @Override
    public void configureMessageConverters(List<HttpMessageConverter<?>> converters) {
        converters.removeIf(converter -> converter instanceof StringHttpMessageConverter);
        converters.add(new StringHttpMessageConverter(StandardCharsets.UTF_8));
    }

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer.defaultContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
    }
}
