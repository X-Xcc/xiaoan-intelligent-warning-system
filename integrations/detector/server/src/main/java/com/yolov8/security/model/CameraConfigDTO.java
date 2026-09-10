package com.yolov8.security.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.yolov8.security.service.CameraConfigService.Camera;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CameraConfigDTO(
        String id, String type, Object address, String name,
        String brand, String model, String ip, int port, int channel,
        String status, boolean enabled, String go2rtcId, String httpMjpegUrl) {

    private static final Set<String> URL_SCHEMES = Set.of("rtsp", "rtsps", "http", "https");

    public static CameraConfigDTO from(Camera camera) {
        return new CameraConfigDTO(
                camera.getId(), camera.getType(), sanitizeAddress(camera.getAddress()), camera.getName(),
                camera.getBrand(), camera.getModel(), camera.getIp(), camera.getPort(), camera.getChannel(),
                camera.getStatus(), camera.isEnabled(), camera.getGo2rtcId(),
                camera.getHttpMjpegUrl() == null ? null : (String) sanitizeAddress(camera.getHttpMjpegUrl()));
    }

    public static Object sanitizeAddress(Object address) {
        if (address == null || address instanceof Number) return address;
        if (!(address instanceof String value)) return "";
        try {
            URI uri = new URI(value);
            if (uri.getScheme() == null || !URL_SCHEMES.contains(uri.getScheme().toLowerCase(Locale.ROOT))
                    || uri.getHost() == null) return "";
            // Drop user-info and all query/fragment data, including unknown or encoded credential keys.
            String authority = uri.getHost() + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
            return uri.getScheme() + "://" + authority + uri.getRawPath();
        } catch (URISyntaxException e) {
            // A malformed URL must never fall back to the original credential-bearing input.
            return "";
        }
    }
}
