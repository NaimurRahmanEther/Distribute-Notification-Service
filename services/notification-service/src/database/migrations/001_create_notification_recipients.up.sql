CREATE TABLE notification_recipients (
    id BIGINT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
