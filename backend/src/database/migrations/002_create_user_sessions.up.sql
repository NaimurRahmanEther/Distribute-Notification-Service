

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    refresh_token_hash CHAR(64) NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    last_used_at TIMESTAMPTZ
);


-- Enforce one unrevoked session per user; queries check expiration separately.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_one_active_per_user
    ON user_sessions(user_id)
    WHERE revoked_at IS NULL;

-- Find sessions belonging to a user
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
    ON user_sessions(user_id);