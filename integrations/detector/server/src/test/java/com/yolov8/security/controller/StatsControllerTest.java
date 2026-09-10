package com.yolov8.security.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class StatsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void getStats_returns_valid_structure() throws Exception {
        mockMvc.perform(get("/api/stats"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalDetections").exists())
            .andExpect(jsonPath("$.behaviorCounts").exists());
    }

    @Test
    void getStatsSummary_returns_ok() throws Exception {
        mockMvc.perform(get("/api/stats/summary"))
            .andExpect(status().isOk());
    }

    @Test
    void getTrendStats_default_day() throws Exception {
        mockMvc.perform(get("/api/stats/trend"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.labels").isArray())
            .andExpect(jsonPath("$.data").isArray());
    }
}
