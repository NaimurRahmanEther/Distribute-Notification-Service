ALTER TABLE notifications
    ADD COLUMN scheduled_at TIMESTAMPTZ,
    ADD COLUMN request_id UUID,
    ADD CONSTRAINT notifications_user_request_unique UNIQUE (user_id, request_id);
