# Privacy & Data Handling

This document describes what user data the AI Food Recommendation Backend
collects, how it is stored, and what controls users have over it. It is
written to be honest about what is implemented today versus what is
planned, so nothing here is aspirational.

## Scope

This policy covers the backend service deployed at
`https://ai-food-backend-ib8i.onrender.com` and the source repository at
`https://github.com/rohitanakiya/foodhelp`. The companion frontend at
`https://foodhelp-frontend.vercel.app` does not collect any data
beyond what it forwards to this backend.

## What we collect

### Public endpoint: `/chat/recommend`

The semantic recommendation endpoint accepts a single text field — the
user's natural-language query — and returns ranked menu suggestions.
**This endpoint is anonymous, requires no authentication, and does not
log or persist the query, the user's IP, or any device information.**
The query is processed in memory and discarded once the response is
returned.

### Authenticated endpoints: `/auth/signup`, `/auth/login`, `/profile/me`

When a user signs up, the following is stored in PostgreSQL:

- `id` — generated UUID
- `email` — required, used for login
- `username` — optional display name
- `password_hash` — bcrypt hash with salt rounds = 10. The plaintext
  password is never stored or logged.
- `is_active` — boolean account flag
- `created_at`, `updated_at` — timestamps
- `api_key_id` — optional pointer to an api-rate-limiter key, present
  only when the rate-limiter gateway is configured. The raw API key
  itself is shown to the user once at signup and never persisted on
  the backend.

No other personally identifiable information is collected. The system
does not store: full name, phone number, postal address, payment data,
device identifiers, or location.

### What we explicitly do NOT collect or store today

- Search/query history. `/chat/recommend` does not persist queries.
- IP addresses or User-Agent strings (beyond what Render's standard
  request logs hold transiently).
- Cookies. The backend does not set cookies; sessions are JWT-based
  and the token is held client-side.
- Analytics, tracking pixels, or third-party telemetry.

## Where data is stored

- **PostgreSQL** (Supabase, ap-south-1 / Mumbai region). TLS enforced.
  Single-tenant project on Supabase's free tier.
- **No data warehouse, no analytics pipeline, no log shipping** to
  external services beyond Render's own platform telemetry.

## How long data is retained

- User accounts: indefinitely while the account remains active.
- JWTs: 7-day expiry, after which the user must log in again.
- Database backups: not currently retained off-host. Supabase provides
  daily point-in-time backups on the free tier.

## Sharing with third parties

The backend currently makes no outbound calls to third-party APIs that
involve user data. Specifically:

- Embedding generation runs locally inside the backend process via
  `@xenova/transformers` (model: `Xenova/all-MiniLM-L6-v2`). No query
  text or embedding is sent to any third party.
- Filter extraction is rule-based and runs in-process.

When the planned LLM integration ships (Groq for filter extraction),
the only data sent to Groq will be the user's query text. No user
identifier, email, or session token will be included in LLM requests.

When the planned Swiggy MCP integration ships, the user's OAuth
authorization will allow the backend to call Swiggy on the user's
behalf using a per-user OAuth token. Tokens will be encrypted at rest
in PostgreSQL.

## User rights and controls

### Available today

- A user can stop using the service at any time. JWTs expire in 7 days
  and are not auto-renewed.
- A user can request account deletion by contacting the security
  contact below; deletion is performed manually and is irreversible.

### Planned

- `DELETE /profile/me` endpoint for self-service account deletion.
  Until this ships, account deletion is performed manually on request.
- Per-user data export endpoint.

## Security contact

Rohit Anakiya — anakiyarohit@gmail.com

For security-relevant disclosures see [SECURITY.md](./SECURITY.md).

## Changes to this policy

This document lives in version control. Material changes are recorded
through commits to the repository, visible in the Git history at
`https://github.com/rohitanakiya/foodhelp/commits/main/PRIVACY.md`.

Last updated: 2026-06-03.
