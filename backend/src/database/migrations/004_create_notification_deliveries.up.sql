CREATE TABLE notification_deliveries (
    id UUID PRIMARY KEY,
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'PUSH')),
    stage VARCHAR(30) NOT NULL DEFAULT 'INITIAL'
        CHECK (stage IN ('INITIAL', 'UNREAD_REMINDER_1', 'UNREAD_REMINDER_2')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'RETRYING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    provider_message_id TEXT,
    last_error TEXT,
    next_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (notification_id, channel, stage)
);

CREATE INDEX notification_deliveries_pending_idx
    ON notification_deliveries (next_attempt_at, id)
    WHERE status IN ('PENDING', 'RETRYING');
