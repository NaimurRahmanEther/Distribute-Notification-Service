CREATE TABLE notification_outbox (
    id UUID PRIMARY KEY,

    delivery_id UUID NOT NULL
        REFERENCES notification_deliveries(id) ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL
        CHECK (event_type = 'DELIVERY_REQUESTED'),

    payload JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(payload) = 'object'),

    attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count >= 0),

    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    published_at TIMESTAMPTZ,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notification_outbox_unpublished_idx
    ON notification_outbox (next_attempt_at, id)
    WHERE published_at IS NULL;
