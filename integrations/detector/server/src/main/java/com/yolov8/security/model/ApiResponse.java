package com.yolov8.security.model;

import java.util.List;

public class ApiResponse<T> {

    private String status;
    private String message;
    private T data;

    // Constructor
    public ApiResponse(String status, String message, T data) {
        this.status = status;
        this.message = message;
        this.data = data;
    }

    // Getters
    public String getStatus() {
        return status;
    }
    public String getMessage() {
        return message;
    }
    public T getData() {
        return data;
    }

    // Setters
    public void setStatus(String status) {
        this.status = status;
    }
    public void setMessage(String message) {
        this.message = message;
    }
    public void setData(T data) {
        this.data = data;
    }

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<T>("success", null, data);
    }

    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<T>("success", message, data);
    }

    public static <T> ApiResponse<T> error(String message) {
        return new ApiResponse<T>("error", message, null);
    }

    public static class PageData<T> {
        private List<T> items;
        private long total;
        private int page;
        private int size;

        public PageData(List<T> items, long total, int page, int size) {
            this.items = items;
            this.total = total;
            this.page = page;
            this.size = size;
        }

        public List<T> getItems() { return items; }
        public long getTotal() { return total; }
        public int getPage() { return page; }
        public int getSize() { return size; }
    }

    public static <T> ApiResponse<PageData<T>> paged(List<T> items, long total, int page, int size) {
        return new ApiResponse<>("success", null, new PageData<>(items, total, page, size));
    }
}
