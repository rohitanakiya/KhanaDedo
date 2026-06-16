/**
 * PKCE (Proof Key for Code Exchange, RFC 7636) helpers.
 *
 * We generate a fresh verifier+challenge per authorization flow.
 * The challenge is sent to Swiggy's /authorize endpoint; the verifier
 * is held in our state store and sent later to /auth/token along
 * with the code.
 *
 * S256 is the only method we use — plain is deprecated and Swiggy
 * specifies S256 in their docs.
 */

import crypto from "node:crypto";

export interface PkcePair {
  verifier: string;   // 32 random bytes, base64url
  challenge: string;  // SHA-256(verifier), base64url
}

export function generatePkcePair(): PkcePair {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

/**
 * A cryptographically random opaque token for CSRF protection.
 * Used as the OAuth `state` parameter — sent to Swiggy, returned in
 * the callback, looked up in our state store to find the matching
 * verifier and the KhanaDedo user this flow belongs to.
 */
export function generateState(): string {
  return crypto.randomBytes(24).toString("base64url");
}
