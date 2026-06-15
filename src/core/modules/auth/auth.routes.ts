import { Router, Request, Response } from "express";
import { validate } from "../../../middleware/validate.middleware";
import { login, signup } from "./auth.controller";
import { loginSchema, signupSchema } from "./auth.schemas";

const router = Router();

router.post("/signup", validate({ body: signupSchema }), signup);
router.post("/login", validate({ body: loginSchema }), login);

/**
 * Placeholder OAuth callback for the Swiggy MCP integration.
 *
 * This endpoint is the redirect URI registered with the Swiggy
 * Builders Club application. The full handler (PKCE code-for-token
 * exchange, refresh-token storage encrypted at rest) will be
 * implemented once Builders Club access is granted.
 *
 * Until then it serves a friendly placeholder so anyone visiting the
 * URL — including Swiggy reviewers — sees something coherent instead
 * of a 404.
 */
router.get("/swiggy/callback", (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    console.warn(`[swiggy-oauth] callback returned error: ${error}`);
  } else if (code) {
    console.log(
      `[swiggy-oauth] callback received code (state=${state ?? "n/a"})`
    );
  }

  res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KhanaDedo — Swiggy OAuth callback</title>
    <style>
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        max-width: 560px;
        margin: 80px auto;
        padding: 0 24px;
        color: #1f2937;
        line-height: 1.55;
      }
      h1 { color: #059669; margin-bottom: 8px; }
      .lede { color: #4b5563; }
      .muted { color: #6b7280; font-size: 0.9em; margin-top: 32px; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    </style>
  </head>
  <body>
    <h1>KhanaDedo</h1>
    <p class="lede">Swiggy MCP OAuth callback endpoint.</p>
    <p>
      This URL is registered with Swiggy Builders Club as the redirect
      URI for KhanaDedo's MCP integration. The full OAuth handler
      (PKCE code-for-token exchange, encrypted refresh-token storage)
      activates once Builders Club approval is granted; until then,
      this page confirms the endpoint is reachable on the registered
      production domain.
    </p>
    <p class="muted">
      Live demo:
      <a href="https://khanadedo.vercel.app">khanadedo.vercel.app</a>
      &nbsp;·&nbsp; Source:
      <a href="https://github.com/rohitanakiya/KhanaDedo">github.com/rohitanakiya/KhanaDedo</a>
    </p>
  </body>
</html>`);
});

export default router;
