CREATE TABLE IF NOT EXISTS cameras (
    id          VARCHAR(64) PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    type        VARCHAR(32) NOT NULL,
    brand       VARCHAR(64),
    model       VARCHAR(128),
    ip          VARCHAR(64),
    port        INT DEFAULT 554,
    rtsp_url    VARCHAR(512),
    http_url    VARCHAR(512),
    username    VARCHAR(128),
    password    VARCHAR(128),
    channel     INT DEFAULT 1,
    status      VARCHAR(32) DEFAULT 'offline',
    enabled     BOOLEAN DEFAULT TRUE,
    go2rtc_id       VARCHAR(64),
    http_mjpeg_url  VARCHAR(512),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 兼容已有数据库：添加新列（若表已创建）
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS go2rtc_id VARCHAR(64);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS http_mjpeg_url VARCHAR(512);
