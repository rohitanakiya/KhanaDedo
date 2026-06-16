/**
 * AES-256-GCM encryption helpers for at-rest token storage.
 *
 * We use GCM (not CBC) because:
 *   - Built-in authentication (tampering with ciphertext is detected)
 *   - No padding oracle attacks
 *   - Modern, fast on every Node runtime we care about
 *
 * The key comes from TOKEN_ENCRYPTION_KEY — a 32-byte (256-bit) value
 * base64-encoded. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Same key must be set on every deployment (local, prod) so tokens
 * stored in one environment can be read in the same environment.
 * Losing the key bricks all stored tokens.
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12;  // GCM standard

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }

  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length})`
    );
  }

  cachedKey = buf;
  return buf;
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function encrypt(plaintext: string): EncryptedPayload {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return { ciphertext, iv, authTag };
}

export function decrypt(payload: EncryptedPayload): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), payload.iv);
  decipher.setAuthTag(payload.authTag);

  const plaintext = Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
