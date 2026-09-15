package com.yolov8.security.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Legacy endpoints retained for clients migrating to anonymous access. */
@RestController
@RequestMapping("/api")
public class AuthController {
    @PostMapping("/login")
    public Map<String, String> login() {
        return getCurrentUser();
    }

    @GetMapping("/me")
    public Map<String, String> getCurrentUser() {
        return Map.of("username", "anonymous", "name", "Anonymous", "role", "anonymous");
    }
}
