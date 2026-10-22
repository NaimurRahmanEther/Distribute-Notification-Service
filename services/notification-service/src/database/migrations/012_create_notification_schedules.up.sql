CREATE TABLE notification_schedules (
    id UUID PRIMARY KEY,
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    stage VARCHAR(30) NOT NULL CHECK (stage IN ('INITIAL', 'UNREAD_REMINDER_1', 'UNREAD_REMINDER_2')),
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    publication_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publication_attempts >= 0),
    last_error VARCHAR(60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (notification_id, stage)
);

CREATE INDEX notification_schedules_pending_idx
    ON notification_schedules(next_check_at, id) WHERE status = 'PENDING';
