package com.yolov8.security.repository;

import com.yolov8.security.service.CameraConfigService.Camera;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

@Repository
public class CameraRepository {

    private final JdbcTemplate jdbc;

    public CameraRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private final RowMapper<Camera> mapper = (ResultSet rs, int rowNum) -> {
        Camera c = new Camera();
        c.setId(rs.getString("id"));
        c.setName(rs.getString("name"));
        c.setType(rs.getString("type"));
        c.setBrand(rs.getString("brand"));
        c.setModel(rs.getString("model"));
        c.setIp(rs.getString("ip"));
        c.setPort(rs.getInt("port"));
        String camType = rs.getString("type");
        if ("usb".equals(camType)) {
            String ipVal = rs.getString("ip");
            c.setAddress(ipVal != null && !ipVal.isEmpty() ? Integer.parseInt(ipVal) : 0);
        } else {
            c.setAddress(rs.getString("rtsp_url") != null ? rs.getString("rtsp_url") : rs.getString("http_url"));
        }
        c.setChannel(rs.getInt("channel"));
        c.setStatus(rs.getString("status"));
        c.setEnabled(rs.getBoolean("enabled"));
        c.setUsername(rs.getString("username"));
        c.setPassword(rs.getString("password"));
        c.setGo2rtcId(rs.getString("go2rtc_id"));
        c.setHttpMjpegUrl(rs.getString("http_mjpeg_url"));
        return c;
    };

    public List<Camera> findAll() {
        return jdbc.query("SELECT * FROM cameras ORDER BY created_at", mapper);
    }

    public Camera findById(String id) {
        List<Camera> results = jdbc.query("SELECT * FROM cameras WHERE id = ?", mapper, id);
        return results.isEmpty() ? null : results.get(0);
    }

    public void insert(Camera c, String go2rtcId) {
        jdbc.update(
            "INSERT INTO cameras (id, name, type, brand, model, ip, port, rtsp_url, http_url, username, password, channel, status, enabled, go2rtc_id, http_mjpeg_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            c.getId(), c.getName(), c.getType(), c.getBrand(), c.getModel(),
            "usb".equals(c.getType()) ? (c.getAddress() != null ? String.valueOf(c.getAddress()) : "0") : c.getIp(),
            c.getPort() > 0 ? c.getPort() : 554,
            "http_snapshot".equals(c.getType()) ? null : String.valueOf(c.getAddress()),
            "http_snapshot".equals(c.getType()) ? String.valueOf(c.getAddress()) : null,
            c.getUsername(), c.getPassword(),
            c.getChannel(), c.getStatus(), c.isEnabled(), go2rtcId,
            c.getHttpMjpegUrl()
        );
    }

    public void update(Camera c) {
        jdbc.update(
            "UPDATE cameras SET name=?, type=?, brand=?, model=?, ip=?, port=?, rtsp_url=?, http_url=?, username=?, password=?, channel=?, status=?, enabled=?, go2rtc_id=?, http_mjpeg_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            c.getName(), c.getType(), c.getBrand(), c.getModel(),
            "usb".equals(c.getType()) ? (c.getAddress() != null ? String.valueOf(c.getAddress()) : "0") : c.getIp(),
            c.getPort() > 0 ? c.getPort() : 554,
            "http_snapshot".equals(c.getType()) ? null : String.valueOf(c.getAddress()),
            "http_snapshot".equals(c.getType()) ? String.valueOf(c.getAddress()) : null,
            c.getUsername(), c.getPassword(),
            c.getChannel(), c.getStatus(), c.isEnabled(), c.getGo2rtcId(), c.getHttpMjpegUrl(), c.getId()
        );
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM cameras WHERE id = ?", id);
    }

    public void updateStatus(String id, String status) {
        jdbc.update("UPDATE cameras SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", status, id);
    }

    public void deleteAll() {
        jdbc.update("DELETE FROM cameras");
    }

    public boolean existsById(String id) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM cameras WHERE id = ?", Integer.class, id);
        return count != null && count > 0;
    }

    public String findGo2rtcIdById(String id) {
        return jdbc.queryForObject("SELECT go2rtc_id FROM cameras WHERE id = ?", String.class, id);
    }
}
