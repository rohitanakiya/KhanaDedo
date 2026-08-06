import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../db";
import { passwordResetEmail, sendEmail } from "../../email";
import {
  createApiKey,
  isRateLimiterEnabled,
  RateLimiterError,
} from "../../rate-limiter-client";

export interface SignupResult {
  user: {
    id: string;
    email: string;
    username: string | null;
    createdAt: Date;
  };
  /**
   * Present only when the rate-limiter is configured and provisioning
   * succeeded. The caller must show this to the user once and never
   * persist it on the food-backend side.
   */
  apiKey?: {
    rawKey: string;
    keyId: string;
    note: string;
  };
}

export async function createUser(
  email: string,
  password: string,
  username?: string
): Promise<SignupResult> {
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Step 1: Insert the user row first. If the rate-limiter is down or
  // returns an error later, we still have a usable account; we just
  // didn't provision an API key, and the user can request one later.
  const userResult = await pool.query<{
    id: string;
    email: string;
    username: string | null;
    created_at: Date;
  }>(
    `
    INSERT INTO users (email, username, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, email, username, created_at
    `,
    [email, username ?? null, passwordHash]
  );
  const user = userResult.rows[0];

  // Step 2: If the gateway is configured, provision an API key for this
  // user and stash the key_id on the row. Failures here are logged but
  // not fatal — the user is created either way.
  let apiKey: SignupResult["apiKey"];

  if (isRateLimiterEnabled()) {
    try {
      const created = await createApiKey({
        name: `user:${user.email}`,
        scopes: ["read", "write"],
        tier: "free",
      });

      await pool.query(`UPDATE users SET api_key_id = $1 WHERE id = $2`, [
        created.keyId,
        user.id,
      ]);

      apiKey = {
        rawKey: created.rawKey,
        keyId: created.keyId,
        note: "Store this key safely. It will never be shown again.",
      };
    } catch (err) {
      const message =
        err instanceof RateLimiterError
          ? err.message
          : (err as Error).message;
      console.warn(
        `Signup succeeded for ${user.email} but API key provisioning failed: ${message}`
      );
    }
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.created_at,
    },
    apiKey,
  };
}

export async function authenticateUser(email: string, password: string) {
  const query = `
    SELECT id, email, username, password_hash, is_active, created_at
    FROM users
    WHERE email = $1
  `;

  const result = await pool.query(query, [email]);
  const user = result.rows[0];

  if (!user) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    return null;
  }

  if (!user.is_active) {
    throw new Error("USER_INACTIVE");
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    jwtSecret,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      isActive: user.is_active,
      createdAt: user.created_at,
    },
  };
}

// ---------- Password reset ----------

const RESET_TOKEN_TTL_MINUTES = 60;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Generates a reset token for the user with the given email and
 * sends it via email. Always returns without indicating whether
 * the email exists — the caller MUST return the same generic
 * response to the user regardless of outcome (email-enumeration
 * defense).
 *
 * Any error (email doesn't exist, send failed, DB write failed)
 * is logged but not thrown to the caller.
 */
export async function createPasswordReset(email: string): Promise<void> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 AND is_active = TRUE`,
    [email]
  );
  const user = result.rows[0];
  if (!user) {
    // Silent no-op — don't leak whether email exists.
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await pool.query(
    `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      token_hash = EXCLUDED.token_hash,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
    `,
    [user.id, tokenHash, expiresAt]
  );

  const frontendBase =
    process.env.FRONTEND_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://khanadedo.vercel.app"
      : "http://localhost:5173");
  const resetUrl = `${frontendBase}/?reset=${encodeURIComponent(rawToken)}`;

  const { subject, text, html } = passwordResetEmail({
    resetUrl,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  });

  const outcome = await sendEmail({ to: email, subject, text, html });
  if (!outcome.sent) {
    console.warn(
      `[auth] password-reset email send failed for ${email}: ${outcome.error}`
    );
  }
}

/**
 * Verifies a reset token and, if valid, updates the user's password.
 * Throws generic errors on any failure — the caller should surface
 * "Invalid or expired link" without further detail.
 */
export async function resetPassword(
  rawToken: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const tokenHash = hashToken(rawToken);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rows = await client.query<{ user_id: string; expires_at: Date }>(
      `
      SELECT user_id, expires_at
      FROM password_reset_tokens
      WHERE token_hash = $1
      `,
      [tokenHash]
    );
    const row = rows.rows[0];

    if (!row || row.expires_at <= new Date()) {
      throw new Error("Invalid or expired reset link");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, row.user_id]
    );

    // Single-use — delete the token so the link can't be reused.
    await client.query(
      `DELETE FROM password_reset_tokens WHERE user_id = $1`,
      [row.user_id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
