package com.yolov8.security.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:anonymous-access;DB_CLOSE_DELAY=-1;MODE=MySQL",
    "app.file.upload-dir=./target/anonymous-access/data",
    "app.file.result-dir=./target/anonymous-access/results",
    "app.camera-config-path=./target/anonymous-access/cameras.json",
    "app.python.auto-start=false",
    "app.go2rtc.auto-start=false",
    "app.go2rtc.sync-enabled=false",
    "app.camera.snapshot.enabled=false",
    "app.cleanup.retention-days=0"
})
@AutoConfigureMockMvc
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void legacy_login_accepts_anonymous_access() throws Exception {
        mockMvc.perform(post("/api/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void legacy_credentials_are_ignored() throws Exception {
        mockMvc.perform(post("/api/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"wrong\",\"password\":\"wrong\"}"))
            .andExpect(status().isOk());
    }

    @Test
    void me_without_token_returns_anonymous_identity() throws Exception {
        mockMvc.perform(get("/api/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("anonymous"));
    }

    @Test
    void login_page_is_public() throws Exception {
        mockMvc.perform(get("/login"))
            .andExpect(status().isOk());
    }
}
