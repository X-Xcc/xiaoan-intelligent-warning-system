package com.yolov8.security.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {

    /**
     * SPA catch-all: forward all non-API page routes to index.html.
     * React Router handles client-side routing.
     */
    @GetMapping({"/", "/index", "/login", "/dashboard", "/monitor", "/alerts",
                 "/devices", "/evidence", "/analysis", "/maintenance", "/audit",
                 "/monitor/fullscreen", "/model-training"})
    public String spaIndex() {
        return "forward:/index.html";
    }

    @GetMapping("/annotation")
    public String annotationPage() {
        return "forward:/index.html";
    }

    @GetMapping("/training")
    public String trainingPage() {
        return "forward:/index.html";
    }
}
