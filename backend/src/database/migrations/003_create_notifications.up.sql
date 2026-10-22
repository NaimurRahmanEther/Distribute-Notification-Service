CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    type VARCHAR(20) NOT NULL
        CHECK (
            type IN (
                'SYSTEM',
                'SECURITY',
                'ACTIVITY',
                'ANNOUNCEMENT'
            )
        ),

    title VARCHAR(200) NOT NULL,
     

    message TEXT NOT NULL,

    data JSONB NOT NULL DEFAULT '{}'::jsonb, 

    read_at TIMESTAMPTZ,

    scheduled_at TIMESTAMPTZ,
    request_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notifications_user_request_unique UNIQUE (user_id, request_id)
);

CREATE INDEX notifications_user_created_idx
    ON notifications (user_id, created_at DESC, id DESC);

CREATE INDEX notifications_user_unread_idx
    ON notifications (user_id, created_at DESC, id DESC)
    WHERE read_at IS NULL;
