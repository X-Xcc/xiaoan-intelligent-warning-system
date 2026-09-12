package com.yolov8.security.service;

import at.favre.lib.crypto.bcrypt.BCrypt;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yolov8.security.config.AppConfig;
import com.yolov8.security.util.JsonFileUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.stream.Collectors;

@Service
public class UserService {

    private static final TypeReference<List<User>> TYPE_REF = new TypeReference<>() {};

    private final Path filePath;
    private final ObjectMapper objectMapper;
    private final ReadWriteLock lock = JsonFileUtils.newLock();
    private final int bcryptCost;

    @Autowired
    public UserService(AppConfig appConfig, ObjectMapper objectMapper) {
        this(appConfig, objectMapper, 10);
    }

    public UserService(AppConfig appConfig, ObjectMapper objectMapper, int bcryptCost) {
        this.filePath = Paths.get(appConfig.getFile().getUploadDir()).resolve("users.json");
        this.objectMapper = objectMapper;
        this.bcryptCost = bcryptCost;
        JsonFileUtils.cleanupTmp(filePath);
    }

    private List<User> read() {
        return JsonFileUtils.readList(filePath, objectMapper, TYPE_REF);
    }

    private void write(List<User> data) {
        JsonFileUtils.writeList(filePath, data, objectMapper);
    }

    public List<User> getAllUsers() {
        lock.readLock().lock();
        try {
            return read().stream().map(u -> {
                User copy = new User();
                copy.setId(u.getId());
                copy.setUsername(u.getUsername());
                copy.setRole(u.getRole());
                copy.setPassword(null);
                return copy;
            }).collect(Collectors.toList());
        } finally {
            lock.readLock().unlock();
        }
    }

    public User addUser(User user) {
        lock.writeLock().lock();
        try {
            validate(user, false);
            List<User> users = read();

            boolean exists = users.stream()
                    .anyMatch(u -> u.getUsername().equals(user.getUsername()));
            if (exists) {
                throw new IllegalArgumentException("用户名已存在: " + user.getUsername());
            }

            user.setId(generateId(users));
            String hashed = BCrypt.withDefaults().hashToString(bcryptCost, user.getPassword().toCharArray());
            user.setPassword(hashed);

            users.add(user);
            write(users);
            return user;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public User updateUser(String username, User update) {
        lock.writeLock().lock();
        try {
            List<User> users = read();

            User existing = users.stream()
                    .filter(u -> u.getUsername().equals(username))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("用户不存在: " + username));

            if (update.getRole() != null) {
                String role = update.getRole();
                if (!role.equals("admin") && !role.equals("operator") && !role.equals("viewer")) {
                    throw new IllegalArgumentException("无效的角色: " + role + "。允许的角色: admin, operator, viewer");
                }
                existing.setRole(role);
            }

            if (update.getPassword() != null && !update.getPassword().isEmpty()) {
                if (update.getPassword().length() < 6) {
                    throw new IllegalArgumentException("密码长度不能少于6位");
                }
                String hashed = BCrypt.withDefaults().hashToString(bcryptCost, update.getPassword().toCharArray());
                existing.setPassword(hashed);
            }

            write(users);
            return existing;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public boolean deleteUser(String username) {
        lock.writeLock().lock();
        try {
            List<User> users = read();

            User existing = users.stream()
                    .filter(u -> u.getUsername().equals(username))
                    .findFirst()
                    .orElse(null);

            if (existing == null) {
                return false;
            }

            if ("admin".equals(existing.getUsername())) {
                throw new IllegalArgumentException("admin用户不可删除");
            }

            users.removeIf(u -> u.getUsername().equals(username));
            write(users);
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void validate(User user, boolean isUpdate) {
        if (!isUpdate) {
            if (user.getUsername() == null || user.getUsername().length() < 3 || user.getUsername().length() > 20) {
                throw new IllegalArgumentException("用户名长度必须在3-20个字符之间");
            }
            if (user.getPassword() == null || user.getPassword().length() < 6) {
                throw new IllegalArgumentException("密码长度不能少于6位");
            }
        }
        if (user.getRole() == null || user.getRole().isEmpty()) {
            throw new IllegalArgumentException("角色不能为空");
        }
        if (!user.getRole().equals("admin") && !user.getRole().equals("operator") && !user.getRole().equals("viewer")) {
            throw new IllegalArgumentException("无效的角色: " + user.getRole());
        }
    }

    private String generateId(List<User> users) {
        int maxNum = -1;
        for (User u : users) {
            String id = u.getId();
            if (id != null && id.startsWith("user")) {
                try {
                    int num = Integer.parseInt(id.substring(4));
                    if (num > maxNum) maxNum = num;
                } catch (NumberFormatException ignored) {}
            }
        }
        return "user" + (maxNum + 1);
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class User {
        private String id;
        private String username;
        private String password;
        private String role;

        public User() {}

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
    }
}
