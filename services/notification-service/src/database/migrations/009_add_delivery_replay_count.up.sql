ALTER TABLE notification_deliveries
    ADD COLUMN replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0);
