-- Password reset tokens.
--
-- We store SHA-256 hashes of the raw token, never the raw value.
-- The raw token is emailed to the user; when they click the reset
-- link we hash the incoming token and look it up. This means:
--   - A DB dump doesn't expose active reset URLs
--   - The user has one and only one working link (from the email)
--
-- Tokens are:
--   - Single-use (deleted after successful reset)
--   - Time-limited (expires_at, 1 hour from creation)
--   - Per-user; issuing a new one invalidates prior ones for the
--     same user via ON CONFLICT + DO UPDATE (single row per user).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast cleanup of expired rows (cron / on-startup housekeeping).
CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at
    ON password_reset_tokens(expires_at);

-- Enable RLS immediately — Supabase will nag otherwise, and this
-- table holds security-sensitive material.
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
