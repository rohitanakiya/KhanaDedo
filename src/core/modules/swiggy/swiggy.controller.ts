import { Request, Response } from "express";
import { z } from "zod";
import {
  BadRequestError,
  UnauthorizedError,
  InternalServerError,
} from "../../errors";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  extractSwiggyUserId,
  getOrRegisterClient,
  revokeSession,
  SwiggyAuthError,
} from "../../swiggy/oauth-client";
import { generatePkcePair, generateState } from "../../swiggy/pkce";
import { consume, put } from "../../swiggy/state-store";
import { deleteToken, getToken, storeToken } from "../../swiggy/tokens";

/**
 * Where Swiggy will redirect after the user finishes /authorize.
 * Must exactly match a redirect URI we registered with Swiggy
 * (during enterprise onboarding) AND the one DCR registered.
 */
function getRedirectUri(): string {
  const fromEnv = process.env.SWIGGY_REDIRECT_URI;
  if (fromEnv) return fromEnv;
  // Sensible defaults: production on Render, local on port 4000.
  return process.env.NODE_ENV === "production"
    ? "https://ai-food-backend-ib8i.onrender.com/auth/swiggy/callback"
    : "http://localhost:4000/auth/swiggy/callback";
}

function getFrontendBaseUrl(): string {
  return (
    process.env.FRONTEND_BASE_URL ??
    (process.env.NODE_ENV === "production"
      ? "https://khanadedo.vercel.app"
      : "http://localhost:5173")
  );
}

// ---------- POST /auth/swiggy/start ----------

const startSchema = z.object({
  returnTo: z.string().url().optional(),
});

/**
 * Initiates the per-user OAuth flow. Requires the caller to be
 * authenticated as a KhanaDedo user (req.user from JWT middleware).
 *
 * Returns the Swiggy /authorize URL — the frontend should redirect
 * the user there. After they finish, Swiggy redirects to our
 * /callback, which redirects back to `returnTo` on the frontend.
 */
export async function startSwiggyAuth(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError("Login required");

  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError("Invalid body", parsed.error.issues);
  }

  const returnTo = parsed.data.returnTo ?? getFrontendBaseUrl();
  const redirectUri = getRedirectUri();

  let clientId: string;
  try {
    clientId = await getOrRegisterClient(redirectUri);
  } catch (err) {
    if (err instanceof SwiggyAuthError) {
      throw new InternalServerError(
        `Swiggy DCR failed: ${err.message}`,
        "SWIGGY_DCR_FAILED"
      );
    }
    throw err;
  }

  const { verifier, challenge } = generatePkcePair();
  const state = generateState();

  put(state, { kdUserId: userId, codeVerifier: verifier, returnTo });

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  res.json({ authorizeUrl });
}

// ---------- GET /auth/swiggy/callback ----------

/**
 * Receives Swiggy's redirect with ?code=...&state=....
 * Exchanges the code for a token, stores it encrypted, then
 * redirects the user back to the frontend `returnTo` URL.
 *
 * Note: this is a 302-driven flow, not JSON. Errors render an HTML
 * page so the user sees something coherent in their browser.
 */
export async function swiggyAuthCallback(req: Request, res: Response) {
  const { code, state, error: oauthError, error_description } = req.query as {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  };

  if (oauthError) {
    return renderError(
      res,
      400,
      `Swiggy authorization was denied (${oauthError}): ${error_description ?? "no details"}`
    );
  }

  if (!code || !state) {
    return renderError(res, 400, "Missing code or state in callback");
  }

  const entry = consume(state);
  if (!entry) {
    return renderError(
      res,
      400,
      "Invalid or expired state. Please re-start the Connect Swiggy flow."
    );
  }

  const redirectUri = getRedirectUri();

  let clientId: string;
  try {
    clientId = await getOrRegisterClient(redirectUri);
  } catch (err) {
    return renderError(res, 502, `DCR failed: ${(err as Error).message}`);
  }

  let tokenResponse;
  try {
    tokenResponse = await exchangeCodeForToken({
      clientId,
      code,
      codeVerifier: entry.codeVerifier,
      redirectUri,
    });
  } catch (err) {
    return renderError(
      res,
      502,
      `Token exchange failed: ${(err as Error).message}`
    );
  }

  await storeToken({
    kdUserId: entry.kdUserId,
    accessToken: tokenResponse.access_token,
    expiresInSeconds: tokenResponse.expires_in,
    scope: tokenResponse.scope,
    swiggyUserId: extractSwiggyUserId(tokenResponse.access_token),
  });

  // Bounce back to the frontend with a success indicator the SPA
  // can react to. Use a query param so the frontend doesn't need
  // to round-trip our backend to know auth just succeeded.
  const back = new URL(entry.returnTo);
  back.searchParams.set("swiggy", "connected");
  res.redirect(302, back.toString());
}

// ---------- POST /auth/swiggy/logout ----------

/**
 * Revokes the user's Swiggy session on Swiggy's side AND drops
 * our stored token. Idempotent — safe if user already disconnected.
 */
export async function logoutSwiggy(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError("Login required");

  const stored = await getToken(userId);
  if (stored) {
    await revokeSession(stored.accessToken);
  }
  await deleteToken(userId);

  res.json({ disconnected: true });
}

// ---------- GET /auth/swiggy/status ----------

/**
 * Lightweight check so the frontend can know whether to show
 * "Connect Swiggy" or "Disconnect Swiggy" without leaking the
 * actual token.
 */
export async function swiggyStatus(req: Request, res: Response) {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError("Login required");

  const stored = await getToken(userId);
  if (!stored) {
    return res.json({ connected: false });
  }
  return res.json({
    connected: true,
    expiresAt: stored.expiresAt.toISOString(),
    scope: stored.scope,
  });
}

// ---------- Internal: error page renderer ----------

function renderError(res: Response, status: number, message: string): void {
  res
    .status(status)
    .type("html")
    .send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>KhanaDedo — Swiggy connect error</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 540px; margin: 80px auto; padding: 0 24px; color: #1f2937; }
      h1 { color: #b91c1c; }
      .muted { color: #6b7280; font-size: 0.9em; margin-top: 32px; }
    </style>
  </head>
  <body>
    <h1>Couldn't connect to Swiggy</h1>
    <p>${escapeHtml(message)}</p>
    <p class="muted">
      <a href="${escapeHtml(getFrontendBaseUrl())}">Back to KhanaDedo</a>
    </p>
  </body>
</html>`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
