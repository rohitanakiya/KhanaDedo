-- Stores per-user Swiggy OAuth access tokens, encrypted at rest.
--
-- Lifecycle:
--   1. User clicks "Connect Swiggy" -> /auth/swiggy/start initiates PKCE flow
--   2. Swiggy redirects to /auth/swiggy/callback with code + state
--   3. Backend exchanges code -> access_token, stores encrypted here
--   4. On every Swiggy MCP call, backend looks up + decrypts this row
--   5. On 401/expiry, row is deleted and user re-runs the flow
--   6. On explicit logout, backend calls Swiggy /auth/logout and deletes row
--
-- One row per (kd_user_id) — re-connecting Swiggy overwrites the existing
-- row via ON CONFLICT. We never store more than one token per user.
--
-- The token itself is encrypted with AES-256-GCM in app code; we store
-- the ciphertext + IV + auth tag separately so the DB row is useless
-- without TOKEN_ENCRYPTION_KEY.

CREATE TABLE IF NOT EXISTS user_swiggy_tokens (
    kd_user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- AES-256-GCM ciphertext of the raw access_token. The original
    -- token never appears in the DB or logs.
    token_ciphertext        BYTEA NOT NULL,
    token_iv                BYTEA NOT NULL,
    token_auth_tag          BYTEA NOT NULL,

    -- Lifetime info we need to know without decrypting.
    expires_at              TIMESTAMPTZ NOT NULL,
    scope                   TEXT NOT NULL,

    -- Swiggy's own user id (from the JWT's sub claim, decoded
    -- once at token-exchange time). Useful for audit/correlation
    -- with Swiggy support without us having to decrypt the token.
    swiggy_user_id          TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helps the cleanup job (deletes expired tokens) without a full scan.
CREATE INDEX IF NOT EXISTS idx_user_swiggy_tokens_expires_at
    ON user_swiggy_tokens(expires_at);
