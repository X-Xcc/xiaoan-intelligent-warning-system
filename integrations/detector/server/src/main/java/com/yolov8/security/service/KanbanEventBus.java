package com.yolov8.security.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.function.BiConsumer;

public class KanbanEventBus {

    private static final Logger log = LoggerFactory.getLogger(KanbanEventBus.class);
    private static final Set<BiConsumer<String, Object>> subscribers = new CopyOnWriteArraySet<>();

    public static void subscribe(BiConsumer<String, Object> subscriber) {
        subscribers.add(subscriber);
    }

    public static void unsubscribe(BiConsumer<String, Object> subscriber) {
        subscribers.remove(subscriber);
    }

    public static void publish(String eventType, Object data) {
        for (BiConsumer<String, Object> subscriber : subscribers) {
            try {
                subscriber.accept(eventType, data);
            } catch (Exception e) {
                log.error("KanbanEventBus publish error [{}]: {}", eventType, e.getMessage(), e);
            }
        }
    }
}
