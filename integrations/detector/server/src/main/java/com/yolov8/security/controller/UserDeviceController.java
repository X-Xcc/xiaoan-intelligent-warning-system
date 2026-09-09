package com.yolov8.security.controller;

import com.yolov8.security.model.ApiResponse;
import com.yolov8.security.service.DeviceService;
import com.yolov8.security.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class UserDeviceController {

    private static final Logger log = LoggerFactory.getLogger(UserDeviceController.class);
    private final UserService userService;
    private final DeviceService deviceService;

    public UserDeviceController(UserService userService, DeviceService deviceService) {
        this.userService = userService;
        this.deviceService = deviceService;
    }

    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<UserService.User>>> getUsers() {
        try {
            List<UserService.User> users = userService.getAllUsers();
            return ResponseEntity.ok(ApiResponse.success(users));
        } catch (Exception e) {
            log.error("Error getting users", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("读取用户列表失败: " + e.getMessage()));
        }
    }

    @PostMapping("/users")
    public ResponseEntity<ApiResponse<UserService.User>> addUser(@RequestBody UserService.User user) {
        try {
            UserService.User added = userService.addUser(user);
            return ResponseEntity.ok(ApiResponse.success("用户已创建", added));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error adding user", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("创建用户失败: " + e.getMessage()));
        }
    }

    @PutMapping("/users/{username}")
    public ResponseEntity<ApiResponse<UserService.User>> updateUser(
            @PathVariable String username, @RequestBody UserService.User user) {
        try {
            UserService.User updated = userService.updateUser(username, user);
            return ResponseEntity.ok(ApiResponse.success("用户已更新", updated));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error updating user", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("更新用户失败: " + e.getMessage()));
        }
    }

    @DeleteMapping("/users/{username}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteUser(@PathVariable String username) {
        try {
            boolean deleted = userService.deleteUser(username);
            if (deleted) {
                return ResponseEntity.ok(ApiResponse.success("用户已删除", Map.of("deleted", true)));
            } else {
                return ResponseEntity.badRequest().body(ApiResponse.error("用户不存在: " + username));
            }
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error deleting user", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("删除用户失败: " + e.getMessage()));
        }
    }

    @GetMapping("/devices")
    public ResponseEntity<ApiResponse<List<DeviceService.Device>>> getDevices() {
        try {
            List<DeviceService.Device> devices = deviceService.getAllDevices();
            return ResponseEntity.ok(ApiResponse.success(devices));
        } catch (Exception e) {
            log.error("Error getting devices", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("读取设备列表失败: " + e.getMessage()));
        }
    }

    @PostMapping("/devices")
    public ResponseEntity<ApiResponse<DeviceService.Device>> addDevice(@RequestBody DeviceService.Device device) {
        try {
            DeviceService.Device added = deviceService.addDevice(device);
            return ResponseEntity.ok(ApiResponse.success("设备已添加", added));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error adding device", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("添加设备失败: " + e.getMessage()));
        }
    }

    @PutMapping("/devices/{id}")
    public ResponseEntity<ApiResponse<DeviceService.Device>> updateDevice(
            @PathVariable String id, @RequestBody DeviceService.Device device) {
        try {
            DeviceService.Device updated = deviceService.updateDevice(id, device);
            return ResponseEntity.ok(ApiResponse.success("设备已更新", updated));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error updating device", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("更新设备失败: " + e.getMessage()));
        }
    }

    @DeleteMapping("/devices/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteDevice(@PathVariable String id) {
        try {
            boolean deleted = deviceService.deleteDevice(id);
            if (deleted) {
                return ResponseEntity.ok(ApiResponse.success("设备已删除", Map.of("deleted", true)));
            } else {
                return ResponseEntity.badRequest().body(ApiResponse.error("设备不存在: " + id));
            }
        } catch (Exception e) {
            log.error("Error deleting device", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("删除设备失败: " + e.getMessage()));
        }
    }
}
