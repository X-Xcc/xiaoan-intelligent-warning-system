package com.yolov8.security.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

public class DetectionData {

    private String id;
    private String timestamp;
    private List<String> actions;

    @JsonProperty("person_count")
    private int personCount;

    private String filename;

    @JsonProperty("image_filename")
    private String imageFilename;

    @JsonProperty("frame_count")
    private int frameCount;

    private double fps;

    private List<Map<String, Object>> boxes;

    @JsonProperty("camera_name")
    private String cameraName;

    @JsonProperty("camera_id")
    private String cameraId;

    public DetectionData() {
    }

    public DetectionData(String id, String timestamp, List<String> actions, int personCount,
                         String filename, String imageFilename, int frameCount, double fps,
                         List<Map<String, Object>> boxes) {
        this.id = id;
        this.timestamp = timestamp;
        this.actions = actions;
        this.personCount = personCount;
        this.filename = filename;
        this.imageFilename = imageFilename;
        this.frameCount = frameCount;
        this.fps = fps;
        this.boxes = boxes;
    }

    public String getId() { return id; }
    public String getTimestamp() { return timestamp; }
    public List<String> getActions() { return actions; }
    public int getPersonCount() { return personCount; }
    public String getFilename() { return filename; }
    public String getImageFilename() { return imageFilename; }
    public int getFrameCount() { return frameCount; }
    public double getFps() { return fps; }
    public List<Map<String, Object>> getBoxes() { return boxes; }

    public void setId(String id) { this.id = id; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
    public void setActions(List<String> actions) { this.actions = actions; }
    public void setPersonCount(int personCount) { this.personCount = personCount; }
    public void setFilename(String filename) { this.filename = filename; }
    public void setImageFilename(String imageFilename) { this.imageFilename = imageFilename; }
    public void setFrameCount(int frameCount) { this.frameCount = frameCount; }
    public void setFps(double fps) { this.fps = fps; }
    public void setBoxes(List<Map<String, Object>> boxes) { this.boxes = boxes; }
    public String getCameraName() { return cameraName; }
    public void setCameraName(String cameraName) { this.cameraName = cameraName; }
    public String getCameraId() { return cameraId; }
    public void setCameraId(String cameraId) { this.cameraId = cameraId; }
}
