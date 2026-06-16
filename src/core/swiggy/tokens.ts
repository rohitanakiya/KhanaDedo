/**
 * Per-user Swiggy access-token storage.
 *
 * Wraps the user_swiggy_tokens table with encryption at the boundary —
 * callers see raw access tokens (Strings) and never have to think
 * about ciphertext, IVs, or auth tags.
 *
 * One row per KhanaDedo user; re-storing a token for the same user
 * overwrites the existing row.
 */

import pool from "../db";
import { decrypt, encrypt } from "./encryption";

export interface StoredToken {
  accessToken: string;
  expiresAt: Date;
  scope: string;
  swiggyUserId: string | null;
}

export interface NewToken {
  kdUserId: string;
  accessToken: string;
  expiresInSeconds: number;
  scope: string;
  swiggyUserId?: string | null;
}

/**
 * Persists a freshly-obtained Swiggy access token for the given
 * KhanaDedo user. Overwrites any existing token for that user.
 */
export async function storeToken(token: NewToken): Promise<void> {
  const { ciphertext, iv, authTag } = encrypt(token.accessToken);
  const expiresAt = new Date(Date.now() + token.expiresInSeconds * 1000);

  await pool.query(
    `
    INSERT INTO user_swiggy_tokens (
      kd_user_id, token_ciphertext, token_iv, token_auth_tag,
      expires_at, scope, swiggy_user_id, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (kd_user_id) DO UPDATE SET
      token_ciphertext = EXCLUDED.token_ciphertext,
      token_iv         = EXCLUDED.token_iv,
      token_auth_tag   = EXCLUDED.token_auth_tag,
      expires_at       = EXCLUDED.expires_at,
      scope            = EXCLUDED.scope,
      swiggy_user_id   = EXCLUDED.swiggy_user_id,
      updated_at       = NOW()
    `,
    [
      token.kdUserId,
      ciphertext,
      iv,
      authTag,
      expiresAt,
      token.scope,
      token.swiggyUserId ?? null,
    ]
  );
}

/**
 * Returns the active token for the given user, or null if no token
 * is stored or the stored token has expired.
 *
 * Expired tokens are NOT deleted here (let the caller decide); they
 * just don't get returned.
 */
export async function getToken(kdUserId: string): Promise<StoredToken | null> {
  const result = await pool.query<{
    token_ciphertext: Buffer;
    token_iv: Buffer;
    token_auth_tag: Buffer;
    expires_at: Date;
    scope: string;
    swiggy_user_id: string | null;
  }>(
    `
    SELECT token_ciphertext, token_iv, token_auth_tag,
           expires_at, scope, swiggy_user_id
    FROM user_swiggy_tokens
    WHERE kd_user_id = $1
    `,
    [kdUserId]
  );

  const row = result.rows[0];
  if (!row) return null;

  if (row.expires_at <= new Date()) return null;

  const accessToken = decrypt({
    ciphertext: row.token_ciphertext,
    iv: row.token_iv,
    authTag: row.token_auth_tag,
  });

  return {
    accessToken,
    expiresAt: row.expires_at,
    scope: row.scope,
    swiggyUserId: row.swiggy_user_id,
  };
}

/**
 * Removes the stored token for a user. Idempotent — safe to call
 * even if no token exists.
 */
export async function deleteToken(kdUserId: string): Promise<void> {
  await pool.query(
    `DELETE FROM user_swiggy_tokens WHERE kd_user_id = $1`,
    [kdUserId]
  );
}

/**
 * Cleanup job — removes all expired tokens. Run via cron or on
 * startup; not in any hot path. Returns the number of rows deleted.
 */
export async function deleteExpiredTokens(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM user_swiggy_tokens WHERE expires_at <= NOW()`
  );
  return result.rowCount ?? 0;
}
