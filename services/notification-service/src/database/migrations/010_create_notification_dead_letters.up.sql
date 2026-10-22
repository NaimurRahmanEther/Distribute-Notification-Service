CREATE TABLE notification_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
    replay_count INTEGER NOT NULL CHECK (replay_count >= 0),
    reason VARCHAR(60) NOT NULL,
    attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    publication_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publication_attempts >= 0),
    next_publish_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replayed_at TIMESTAMPTZ,
    replayed_by BIGINT REFERENCES notification_recipients(id) ON DELETE SET NULL,
    UNIQUE (delivery_id, replay_count)
);

CREATE INDEX notification_dead_letters_unpublished_idx
    ON notification_dead_letters(next_publish_at, id) WHERE published_at IS NULL;

-- Preserve terminal failures from before the DLQ was introduced, without raw errors.
INSERT INTO notification_dead_letters(delivery_id, replay_count, reason, attempt_count)
SELECT d.id, d.replay_count, 'LEGACY_TERMINAL_FAILURE', d.attempt_count
FROM notification_deliveries d
WHERE d.status = 'FAILED' OR (d.channel = 'PUSH' AND d.status = 'SENT' AND EXISTS (
    SELECT 1 FROM notification_push_targets t WHERE t.delivery_id = d.id AND t.status = 'FAILED'
));
