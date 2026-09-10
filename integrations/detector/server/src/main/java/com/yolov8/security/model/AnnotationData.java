package com.yolov8.security.model;

import java.util.ArrayList;
import java.util.List;

public class AnnotationData {

    private String imageFilename;
    private int imageWidth;
    private int imageHeight;
    private String annotator;
    private String annotatedAt;
    private String status = "unlabeled";
    private List<String> labels = new ArrayList<>();
    private List<BBox> bboxes = new ArrayList<>();
    private List<KeypointGroup> keypoints = new ArrayList<>();

    public AnnotationData() {}

    public AnnotationData(String imageFilename) {
        this.imageFilename = imageFilename;
    }

    public String getImageFilename() { return imageFilename; }
    public void setImageFilename(String imageFilename) { this.imageFilename = imageFilename; }
    public int getImageWidth() { return imageWidth; }
    public void setImageWidth(int imageWidth) { this.imageWidth = imageWidth; }
    public int getImageHeight() { return imageHeight; }
    public void setImageHeight(int imageHeight) { this.imageHeight = imageHeight; }
    public String getAnnotator() { return annotator; }
    public void setAnnotator(String annotator) { this.annotator = annotator; }
    public String getAnnotatedAt() { return annotatedAt; }
    public void setAnnotatedAt(String annotatedAt) { this.annotatedAt = annotatedAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public List<String> getLabels() { return labels; }
    public void setLabels(List<String> labels) { this.labels = labels; }
    public List<BBox> getBboxes() { return bboxes; }
    public void setBboxes(List<BBox> bboxes) { this.bboxes = bboxes; }
    public List<KeypointGroup> getKeypoints() { return keypoints; }
    public void setKeypoints(List<KeypointGroup> keypoints) { this.keypoints = keypoints; }

    public static class BBox {
        private String id;
        private double x;
        private double y;
        private double width;
        private double height;
        private List<String> labels = new ArrayList<>();
        private double confidence;
        private String source = "human";

        public BBox() {}

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public double getX() { return x; }
        public void setX(double x) { this.x = x; }
        public double getY() { return y; }
        public void setY(double y) { this.y = y; }
        public double getWidth() { return width; }
        public void setWidth(double width) { this.width = width; }
        public double getHeight() { return height; }
        public void setHeight(double height) { this.height = height; }
        public List<String> getLabels() { return labels; }
        public void setLabels(List<String> labels) { this.labels = labels; }
        public double getConfidence() { return confidence; }
        public void setConfidence(double confidence) { this.confidence = confidence; }
        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }
    }

    public static class KeypointGroup {
        private String id;
        private String personId;
        private List<Keypoint> points = new ArrayList<>();

        public KeypointGroup() {}

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getPersonId() { return personId; }
        public void setPersonId(String personId) { this.personId = personId; }
        public List<Keypoint> getPoints() { return points; }
        public void setPoints(List<Keypoint> points) { this.points = points; }
    }

    public static class Keypoint {
        private String name;
        private double x;
        private double y;
        private int visible = 2;

        public Keypoint() {}

        public Keypoint(String name, double x, double y, int visible) {
            this.name = name;
            this.x = x;
            this.y = y;
            this.visible = visible;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public double getX() { return x; }
        public void setX(double x) { this.x = x; }
        public double getY() { return y; }
        public void setY(double y) { this.y = y; }
        public int getVisible() { return visible; }
        public void setVisible(int visible) { this.visible = visible; }
    }
}
