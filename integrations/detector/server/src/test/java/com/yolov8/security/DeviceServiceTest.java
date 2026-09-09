package com.yolov8.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.service.DeviceService;
import com.yolov8.security.service.DeviceService.Device;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DeviceServiceTest {

    @TempDir
    Path tempDir;

    private DeviceService service;

    @BeforeEach
    void setUp() {
        AppConfig appConfig = new AppConfig();
        AppConfig.FileConfig fileConfig = new AppConfig.FileConfig();
        fileConfig.setUploadDir(tempDir.toString());
        appConfig.setFile(fileConfig);
        service = new DeviceService(appConfig, new ObjectMapper());
    }

    @Test
    void addDevice_validDevice_succeeds() {
        Device d = new Device();
        d.setName("前门摄像头");
        d.setType("camera");
        d.setAddress("192.0.2.7");
        d.setLocation("前门");

        Device result = service.addDevice(d);
        assertNotNull(result.getId());
        assertEquals("前门摄像头", result.getName());
    }

    @Test
    void addDevice_invalidType_throws() {
        Device d = new Device();
        d.setName("测试");
        d.setType("invalid");
        d.setAddress("192.0.2.7");
        assertThrows(IllegalArgumentException.class, () -> service.addDevice(d));
    }

    @Test
    void addDevice_emptyName_throws() {
        Device d = new Device();
        d.setName("");
        d.setType("camera");
        d.setAddress("192.0.2.7");
        assertThrows(IllegalArgumentException.class, () -> service.addDevice(d));
    }

    @Test
    void getAllDevices_missingFile_returnsEmpty() {
        List<Device> devices = service.getAllDevices();
        assertNotNull(devices);
        assertTrue(devices.isEmpty());
    }

    @Test
    void deleteDevice_existingId_succeeds() {
        Device d = new Device();
        d.setName("测试设备");
        d.setType("camera");
        d.setAddress("192.0.2.7");
        Device added = service.addDevice(d);

        boolean result = service.deleteDevice(added.getId());
        assertTrue(result);
        assertEquals(0, service.getAllDevices().size());
    }

    @Test
    void deleteDevice_nonExisting_returnsFalse() {
        boolean result = service.deleteDevice("nonexistent");
        assertFalse(result);
    }

    @Test
    void updateDevice_existingId_updates() {
        Device d = new Device();
        d.setName("旧名称");
        d.setType("camera");
        d.setAddress("192.0.2.7");
        Device added = service.addDevice(d);

        Device update = new Device();
        update.setName("新名称");
        update.setType("camera");
        update.setAddress("192.0.2.7");
        Device result = service.updateDevice(added.getId(), update);

        assertEquals("新名称", result.getName());
        assertEquals(added.getId(), result.getId());
    }

    @Test
    void updateDevice_nonExisting_throws() {
        Device update = new Device();
        update.setName("测试");
        update.setType("camera");
        update.setAddress("192.0.2.7");
        assertThrows(IllegalArgumentException.class, () -> service.updateDevice("nonexistent", update));
    }

    @Test
    void addDevice_duplicateId_throws() {
        Device d1 = new Device();
        d1.setId("dev0"); d1.setName("A"); d1.setType("camera"); d1.setAddress("192.0.2.6");
        service.addDevice(d1);

        Device d2 = new Device();
        d2.setId("dev0"); d2.setName("B"); d2.setType("sensor"); d2.setAddress("192.0.2.13");
        assertThrows(IllegalArgumentException.class, () -> service.addDevice(d2));
    }
}
