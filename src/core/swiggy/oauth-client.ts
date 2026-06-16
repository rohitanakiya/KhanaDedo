/**
 * Swiggy OAuth client — wraps the three Swiggy endpoints we talk to:
 *   - POST /auth/register   (Dynamic Client Registration, RFC 7591)
 *   - POST /auth/token      (authorization_code exchange)
 *   - POST /auth/logout     (revoke session)
 *
 * Per the Swiggy docs we use OAuth 2.1 with PKCE. Our DCR registration
 * happens once at startup and is cached for the lifetime of the
 * process — Swiggy issues a long-lived client_id.
 */

import type { EncryptedPayload } from "./encryption";

const BASE_URL = "https://mcp.swiggy.com";
const TIMEOUT_MS = 10_000;

export class SwiggyAuthError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
    this.name = "SwiggyAuthError";
  }
}

// ---------- Dynamic Client Registration ----------

interface DcrResponse {
  client_id: string;
  client_id_issued_at?: number;
  client_secret?: string; // public clients (PKCE) don't get one, but the spec allows it
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
}

let cachedClientId: string | null = null;

export async function getOrRegisterClient(redirectUri: string): Promise<string> {
  if (cachedClientId) return cachedClientId;

  const body = {
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: "none", // public client; PKCE replaces secret
    grant_types: ["authorization_code"],
    response_types: ["code"],
    client_name: "KhanaDedo",
    scope: "mcp:tools mcp:resources mcp:prompts",
  };

  const response = await fetchWithTimeout(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new SwiggyAuthError(
      `DCR failed: ${response.status} ${text.slice(0, 200)}`,
      response.status
    );
  }

  const data = (await response.json()) as DcrResponse;
  if (!data.client_id) {
    throw new SwiggyAuthError("DCR response missing client_id", 500, data);
  }

  cachedClientId = data.client_id;
  console.log(`[swiggy-oauth] registered client_id=${data.client_id.slice(0, 12)}...`);
  return data.client_id;
}

// ---------- Authorization URL builder ----------

export function buildAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    code_challenge: args.codeChallenge,
    code_challenge_method: "S256",
    state: args.state,
    scope: "mcp:tools",
  });
  return `${BASE_URL}/auth/authorize?${params.toString()}`;
}

// ---------- Token exchange ----------

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number; // seconds
  scope: string;
}

export async function exchangeCodeForToken(args: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const response = await fetchWithTimeout(`${BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: args.code,
      code_verifier: args.codeVerifier,
      client_id: args.clientId,
      redirect_uri: args.redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new SwiggyAuthError(
      `Token exchange failed: ${response.status} ${text.slice(0, 200)}`,
      response.status
    );
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new SwiggyAuthError("Invalid token response shape", 500, data);
  }
  return data;
}

// ---------- Logout ----------

export async function revokeSession(accessToken: string): Promise<void> {
  try {
    await fetchWithTimeout(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    // Logout is best-effort — even if Swiggy's side fails, we still
    // delete our local copy. Log and move on.
    console.warn(
      `[swiggy-oauth] logout request failed (will still drop local token): ${(err as Error).message}`
    );
  }
}

// ---------- JWT sub claim extraction (no signature verification) ----------

/**
 * Pulls the `sub` claim out of a Swiggy access token without
 * verifying the signature. We never use this value for authorization;
 * it's stored purely for audit/correlation with Swiggy support.
 *
 * Returns null if parsing fails — non-fatal.
 */
export function extractSwiggyUserId(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as { sub?: string; user_id?: string };
    return payload.sub ?? payload.user_id ?? null;
  } catch {
    return null;
  }
}

// ---------- Internal: timeout-wrapped fetch ----------

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Re-export so callers don't have to import from two places.
export type { EncryptedPayload };
