package com.yolov8.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.repository.CameraRepository;
import com.yolov8.security.service.CameraConfigService;
import com.yolov8.security.service.CameraConfigService.Camera;
import com.yolov8.security.service.Go2rtcService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;



import static org.junit.jupiter.api.Assertions.*;

class CameraConfigServiceTest {

    @TempDir
    Path tempDir;

    private CameraConfigService service;

    @BeforeEach
    void setUp() throws IOException {
        // In-memory H2 for testing
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.h2.Driver");
        ds.setUrl("jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1;MODE=MySQL");
        ds.setUsername("sa");
        ds.setPassword("");

        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.execute("""
            CREATE TABLE IF NOT EXISTS cameras (
                id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, type VARCHAR(32) NOT NULL,
                brand VARCHAR(64), model VARCHAR(128), ip VARCHAR(64), port INT DEFAULT 554,
                rtsp_url VARCHAR(512), http_url VARCHAR(512), username VARCHAR(128), password VARCHAR(128),
                channel INT DEFAULT 1, status VARCHAR(32) DEFAULT 'offline', enabled BOOLEAN DEFAULT TRUE,
                go2rtc_id VARCHAR(64), http_mjpeg_url VARCHAR(512), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """);

        CameraRepository repository = new CameraRepository(jdbc);
        ObjectMapper objectMapper = new ObjectMapper();

        // Dummy AppConfig
        Path scriptPath = tempDir.resolve("yolov8_security.py");
        Files.writeString(scriptPath, "# dummy");
        AppConfig appConfig = new AppConfig();
        AppConfig.PythonConfig pythonConfig = new AppConfig.PythonConfig();
        pythonConfig.setScriptPath(scriptPath.toString());
        appConfig.setPython(pythonConfig);

        service = new CameraConfigService(repository, objectMapper, null, appConfig, null);
    }

    // --- Read tests ---

    @Test
    void getAllCameras_missingFile_returnsEmpty() {
        List<Camera> result = service.getAllCameras();
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void getAllCameras_validFile_parses() {
        Camera cam1 = new Camera();
        cam1.setType("usb"); cam1.setAddress(0); cam1.setName("主摄像头");
        service.addCamera(cam1);

        Camera cam2 = new Camera();
        cam2.setType("rtsp"); cam2.setAddress("rtsp://192.0.2.2:554/s1"); cam2.setName("走廊");
        service.addCamera(cam2);

        List<Camera> result = service.getAllCameras();
        assertEquals(2, result.size());
        assertEquals("cam0", result.get(0).getId());
        assertEquals("usb", result.get(0).getType());
        assertEquals(0, result.get(0).getAddress());
        assertEquals("rtsp", result.get(1).getType());
        assertEquals("rtsp://192.0.2.2:554/s1", result.get(1).getAddress());
    }

    @Test
    void getCameraById_existingId_returnsCamera() {
        Camera cam = new Camera();
        cam.setType("usb"); cam.setAddress(0); cam.setName("主");
        service.addCamera(cam);

        Camera result = service.getCameraById("cam0");
        assertNotNull(result);
        assertEquals("cam0", result.getId());
    }

    @Test
    void getCameraById_nonExisting_returnsNull() {
        Camera cam = new Camera();
        cam.setType("usb"); cam.setAddress(0); cam.setName("主");
        service.addCamera(cam);

        Camera result = service.getCameraById("cam99");
        assertNull(result);
    }

    // --- Add tests ---

    @Test
    void addCamera_usbCamera_succeeds() {
        Camera cam = new Camera();
        cam.setType("usb");
        cam.setAddress(0);
        cam.setName("USB摄像头");

        Camera result = service.addCamera(cam);
        assertNotNull(result.getId());
        assertEquals("cam0", result.getId());
        assertEquals("usb", result.getType());

        // Verify persisted
        List<Camera> all = service.getAllCameras();
        assertEquals(1, all.size());
    }

    @Test
    void addCamera_rtspCamera_succeeds() {
        Camera cam = new Camera();
        cam.setType("rtsp");
        cam.setAddress("rtsp://192.0.2.6:554/stream1");
        cam.setName("RTSP摄像头");

        Camera result = service.addCamera(cam);
        assertEquals("cam0", result.getId());

        // Verify file content
        List<Camera> all = service.getAllCameras();
        assertEquals(1, all.size());
        assertEquals("rtsp://192.0.2.6:554/stream1", all.get(0).getAddress());
    }

    @Test
    void addCamera_autoGeneratesIncrementalId() {
        Camera cam1 = new Camera();
        cam1.setType("usb"); cam1.setAddress(0); cam1.setName("A");
        service.addCamera(cam1);

        Camera cam2 = new Camera();
        cam2.setType("usb"); cam2.setAddress(1); cam2.setName("B");
        Camera result = service.addCamera(cam2);

        assertEquals("cam1", result.getId());
    }

    @Test
    void addCamera_duplicateId_throws() {
        Camera cam1 = new Camera();
        cam1.setId("mycam"); cam1.setType("usb"); cam1.setAddress(0); cam1.setName("A");
        service.addCamera(cam1);

        Camera cam2 = new Camera();
        cam2.setId("mycam"); cam2.setType("usb"); cam2.setAddress(1); cam2.setName("B");
        assertThrows(IllegalArgumentException.class, () -> service.addCamera(cam2));
    }

    @Test
    void addCamera_invalidType_throws() {
        Camera cam = new Camera();
        cam.setType("invalid"); cam.setAddress(0); cam.setName("X");
        assertThrows(IllegalArgumentException.class, () -> service.addCamera(cam));
    }

    @Test
    void addCamera_missingName_throws() {
        Camera cam = new Camera();
        cam.setType("usb"); cam.setAddress(0);
        assertThrows(IllegalArgumentException.class, () -> service.addCamera(cam));
    }

    @Test
    void addCamera_usbWithStringAddress_throws() {
        Camera cam = new Camera();
        cam.setType("usb"); cam.setAddress("not_a_number"); cam.setName("X");
        assertThrows(IllegalArgumentException.class, () -> service.addCamera(cam));
    }

    // --- Update tests ---

    @Test
    void updateCamera_existingId_updates() {
        Camera cam = new Camera();
        cam.setType("usb"); cam.setAddress(0); cam.setName("旧名称");
        service.addCamera(cam);

        Camera update = new Camera();
        update.setType("usb"); update.setAddress(0); update.setName("新名称");
        Camera result = service.updateCamera("cam0", update);

        assertEquals("cam0", result.getId());
        assertEquals("新名称", result.getName());

        // Verify persisted
        assertEquals("新名称", service.getCameraById("cam0").getName());
    }

    @Test
    void updateCamera_nonExisting_throws() {
        Camera update = new Camera();
        update.setType("usb"); update.setAddress(0); update.setName("X");
        assertThrows(IllegalArgumentException.class, () -> service.updateCamera("cam99", update));
    }

    // --- Delete tests ---

    @Test
    void deleteCamera_existingId_deletes() {
        Camera cam1 = new Camera();
        cam1.setType("usb"); cam1.setAddress(0); cam1.setName("A");
        service.addCamera(cam1);

        Camera cam2 = new Camera();
        cam2.setType("usb"); cam2.setAddress(1); cam2.setName("B");
        service.addCamera(cam2);

        boolean result = service.deleteCamera("cam0");
        assertTrue(result);

        List<Camera> all = service.getAllCameras();
        assertEquals(1, all.size());
        assertEquals("cam1", all.get(0).getId());
    }

    @Test
    void deleteCamera_nonExisting_returnsFalse() {
        Camera cam = new Camera();
        cam.setType("usb"); cam.setAddress(0); cam.setName("A");
        service.addCamera(cam);

        boolean result = service.deleteCamera("cam99");
        assertFalse(result);
        assertEquals(1, service.getAllCameras().size());
    }

    @Test
    void deleteCamera_emptyDb_returnsFalse() {
        boolean result = service.deleteCamera("cam0");
        assertFalse(result);
    }
}
