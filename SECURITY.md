# Security Policy

This document describes the security posture of the AI Food
Recommendation Backend. It is intended for security reviewers,
prospective integration partners, and anyone reporting a vulnerability.

## Reporting a vulnerability

Please email **anakiyarohit@gmail.com** with subject line beginning
`[security]`. Do not file public GitHub issues for security
vulnerabilities. Expected acknowledgement window: 72 hours.

## Threat model

This is a small, single-tenant application deployed on managed
infrastructure. The threat model assumes:

- An untrusted public internet on the request side.
- A trusted managed host (Render, Vercel) on the deployment side.
- A semi-trusted partner gateway (api-rate-limiter) when running in
  layered-auth mode.

## In-place controls

### Transport security

- TLS 1.2+ enforced on all public endpoints. The frontend at
  `*.vercel.app` and the backend at `*.onrender.com` use certificates
  managed by their respective hosts.
- PostgreSQL connections require SSL when `DATABASE_URL` is set; the
  client uses `rejectUnauthorized: false` to accept Render's
  self-signed cert chain while still encrypting the channel.

### Authentication

- Passwords are hashed with bcrypt, salt rounds = 10. Plaintext
  passwords are never stored or logged.
- Sessions are stateless: a JWT signed with HS256 is issued at login.
  Token TTL is 7 days. The signing key (`JWT_SECRET`) is stored in
  Render's environment variable secret store and never appears in
  source.
- Login failures return generic error messages so attackers cannot
  distinguish "user not found" from "wrong password".

### Authorization

- Routes that require a logged-in user (`/profile/*`) are gated by an
  auth middleware that verifies the JWT and attaches the decoded user
  ID to the request.
- The public recommendation endpoint (`/chat/recommend`) is anonymous
  by design.

### Input validation

- Every endpoint validates its request body, params, and query against
  a Zod schema. Invalid input returns 400 with a structured error
  body; the request never reaches the controller.
- Body size is capped at 1MB via `express.json({ limit: "1mb" })`.

### SQL injection prevention

- All database queries use parameterized statements via `pg`. There is
  no string concatenation of user input into SQL.

### CORS

- The allowed origin list is driven entirely by the `CORS_ORIGINS`
  environment variable. The default for local development is
  `http://localhost:5173,http://localhost:3000`. Production sets it to
  the Vercel frontend origin only.
- Credentials mode is enabled to support future cookie-based flows but
  is currently unused.

### Rate limiting

- When deployed in gateway mode behind the api-rate-limiter, every
  request passes a token-bucket plus sliding-window check before
  reaching the application server. In gateway mode the application
  binds to `127.0.0.1` only, so it cannot be reached except via the
  gateway.
- Currently the live deployment does not use the gateway (single-host
  deploy), so rate limiting is not active in production. This will
  change once both services are co-deployed.

### Error handling

- All thrown errors flow through a centralized `errorMiddleware` that
  returns a structured JSON body (`{ error, code, details? }`). Stack
  traces are never returned to the client.
- The middleware uses a typed `ApiError` hierarchy
  (`ValidationError`, `UnauthorizedError`, `ForbiddenError`,
  `ConflictError`, `NotFoundError`) so error codes are stable.

### Secret management

- All secrets (`JWT_SECRET`, `DATABASE_URL`, `RATE_LIMITER_ADMIN_KEY`,
  `GROQ_API_KEY` when introduced) are stored in the host's environment
  variable store and read once at process start.
- `.env` is in `.gitignore` and has never been committed.
- No secret is ever logged. Error messages from the rate-limiter
  client redact the key value.

### Dependency hygiene

- Optional dependencies (`@xenova/transformers`) are installed with
  graceful fallback so a deploy that omits them still works (returns
  filter-only results without semantic ranking).
- `package-lock.json` is committed for reproducible installs.

## Known limitations

These are deliberately not yet in place and are tracked as part of
ongoing work:

- **No structured logging.** The current setup uses `console.log` /
  `console.warn`. A structured logger (Pino) is planned.
- **No automated dependency scanning.** Dependabot will be enabled
  once the public Swiggy integration ships.
- **No DAST/SAST tooling** in CI. Manual review only.
- **No formal pen-test** has been performed.
- **Render free-tier Postgres** does not provide off-host backup
  retention; this is acceptable for the demo phase but will be
  addressed before any production usage.

## Cryptographic primitives in use

| Use case        | Algorithm      | Library                |
|-----------------|----------------|------------------------|
| Password hash   | bcrypt         | `bcrypt` (npm)         |
| JWT signing     | HMAC SHA-256   | `jsonwebtoken` (npm)   |
| TLS in transit  | TLS 1.2 / 1.3  | host-managed (Render, Vercel) |
| API key auth    | HMAC SHA-256   | api-rate-limiter (Python) |

Last updated: 2026-05-06.
