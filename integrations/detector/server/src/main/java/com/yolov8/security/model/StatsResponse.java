package com.yolov8.security.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class StatsResponse {

    private int totalDetections;
    private int totalImages;
    private BehaviorCounts behaviorCounts;
    private List<DetectionData> allDetections;
    private List<DetectionData> recentDetections;
    private int personCount;

    public StatsResponse() {
    }

    public StatsResponse(int totalDetections, int totalImages, BehaviorCounts behaviorCounts,
                         List<DetectionData> allDetections, List<DetectionData> recentDetections) {
        this.totalDetections = totalDetections;
        this.totalImages = totalImages;
        this.behaviorCounts = behaviorCounts;
        this.allDetections = allDetections;
        this.recentDetections = recentDetections;
    }

    public int getTotalDetections() { return totalDetections; }
    public int getTotalImages() { return totalImages; }
    public BehaviorCounts getBehaviorCounts() { return behaviorCounts; }
    public List<DetectionData> getAllDetections() { return allDetections; }
    public List<DetectionData> getRecentDetections() { return recentDetections; }
    public int getPersonCount() { return personCount; }

    public void setTotalDetections(int totalDetections) { this.totalDetections = totalDetections; }
    public void setTotalImages(int totalImages) { this.totalImages = totalImages; }
    public void setBehaviorCounts(BehaviorCounts behaviorCounts) { this.behaviorCounts = behaviorCounts; }
    public void setAllDetections(List<DetectionData> allDetections) { this.allDetections = allDetections; }
    public void setRecentDetections(List<DetectionData> recentDetections) { this.recentDetections = recentDetections; }
    public void setPersonCount(int personCount) { this.personCount = personCount; }

    public static class BehaviorCounts {
        @JsonProperty("跌倒")
        @JsonAlias({"fall", "跌倒"})
        private int fall;
        @JsonProperty("打架")
        @JsonAlias({"fight", "打架"})
        private int fight;
        @JsonProperty("离岗")
        @JsonAlias({"absent", "离岗"})
        private int absent;
        @JsonProperty("人员聚集")
        @JsonAlias({"gather", "人员聚集"})
        private int gather;

        public BehaviorCounts() {
        }

        public BehaviorCounts(int fall, int fight, int absent, int gather) {
            this.fall = fall;
            this.fight = fight;
            this.absent = absent;
            this.gather = gather;
        }

        public int getFall() { return fall; }
        public int getFight() { return fight; }
        public int getAbsent() { return absent; }
        public int getGather() { return gather; }

        public void setFall(int fall) { this.fall = fall; }
        public void setFight(int fight) { this.fight = fight; }
        public void setAbsent(int absent) { this.absent = absent; }
        public void setGather(int gather) { this.gather = gather; }
    }
}
