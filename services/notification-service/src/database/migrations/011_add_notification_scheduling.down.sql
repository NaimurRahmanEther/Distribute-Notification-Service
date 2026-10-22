ALTER TABLE notifications
    DROP CONSTRAINT notifications_user_request_unique,
    DROP COLUMN request_id,
    DROP COLUMN scheduled_at;
