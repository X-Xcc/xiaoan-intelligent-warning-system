package com.yolov8.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.service.UserService;
import com.yolov8.security.service.UserService.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class UserServiceTest {

    @TempDir
    java.nio.file.Path tempDir;

    private UserService service;

    @BeforeEach
    void setUp() {
        AppConfig appConfig = new AppConfig();
        AppConfig.FileConfig fileConfig = new AppConfig.FileConfig();
        fileConfig.setUploadDir(tempDir.toString());
        appConfig.setFile(fileConfig);
        service = new UserService(appConfig, new ObjectMapper(), 4);
    }

    @Test
    void addUser_validUser_hashesPassword() {
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("password123");
        user.setRole("operator");

        User result = service.addUser(user);
        assertNotNull(result.getId());
        assertEquals("testuser", result.getUsername());
        assertNotEquals("password123", result.getPassword());
        assertTrue(result.getPassword().startsWith("$2a$") || result.getPassword().startsWith("$2b$"));
    }

    @Test
    void validatePassword_correctPassword_returnsTrue() {
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("password123");
        user.setRole("operator");
        service.addUser(user);

        assertTrue(service.validatePassword("testuser", "password123"));
    }

    @Test
    void validatePassword_wrongPassword_returnsFalse() {
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("password123");
        user.setRole("operator");
        service.addUser(user);

        assertFalse(service.validatePassword("testuser", "wrongpassword"));
    }

    @Test
    void getAllUsers_masksPassword() {
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("password123");
        user.setRole("operator");
        service.addUser(user);

        List<User> users = service.getAllUsers();
        assertEquals(1, users.size());
        assertNull(users.get(0).getPassword());
    }

    @Test
    void deleteUser_adminUser_throws() {
        User admin = new User();
        admin.setUsername("admin");
        admin.setPassword("admin123");
        admin.setRole("admin");
        service.addUser(admin);

        assertThrows(IllegalArgumentException.class, () -> service.deleteUser("admin"));
    }

    @Test
    void deleteUser_nonAdmin_succeeds() {
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("password123");
        user.setRole("operator");
        User added = service.addUser(user);

        boolean result = service.deleteUser("testuser");
        assertTrue(result);
        assertEquals(0, service.getAllUsers().size());
    }

    @Test
    void addUser_duplicateUsername_throws() {
        User user1 = new User();
        user1.setUsername("testuser");
        user1.setPassword("password123");
        user1.setRole("operator");
        service.addUser(user1);

        User user2 = new User();
        user2.setUsername("testuser");
        user2.setPassword("other123");
        user2.setRole("operator");
        assertThrows(IllegalArgumentException.class, () -> service.addUser(user2));
    }

    @Test
    void addUser_shortPassword_throws() {
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("12345");
        user.setRole("operator");
        assertThrows(IllegalArgumentException.class, () -> service.addUser(user));
    }

    @Test
    void addUser_shortUsername_throws() {
        User user = new User();
        user.setUsername("ab");
        user.setPassword("password123");
        user.setRole("operator");
        assertThrows(IllegalArgumentException.class, () -> service.addUser(user));
    }

    @Test
    void getSettings_missingFile_returnsEmpty() {
        List<User> users = service.getAllUsers();
        assertNotNull(users);
        assertTrue(users.isEmpty());
    }

    @Test
    void updateUser_existingUser_updatesRole() {
        User user = new User();
        user.setUsername("testuser");
        user.setPassword("password123");
        user.setRole("operator");
        service.addUser(user);

        User update = new User();
        update.setUsername("testuser");
        update.setRole("admin");
        User result = service.updateUser("testuser", update);

        assertEquals("admin", result.getRole());
    }

    @Test
    void updateUser_nonExisting_throws() {
        User update = new User();
        update.setUsername("nobody");
        update.setRole("admin");
        assertThrows(IllegalArgumentException.class, () -> service.updateUser("nobody", update));
    }

    @Test
    void deleteUser_nonExisting_returnsFalse() {
        boolean result = service.deleteUser("nobody");
        assertFalse(result);
    }
}
