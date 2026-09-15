# KhanaDedo — Backend

> **Live demo:** https://khanadedo.vercel.app
> **API:** https://ai-food-backend-ib8i.onrender.com  ·  [`/health`](https://ai-food-backend-ib8i.onrender.com/health)
> **Frontend repo:** [KhanaDedo-frontend](https://github.com/rohitanakiya/KhanaDedo-frontend)  ·  **Rate-limiter:** [api-rate-limiter](https://github.com/rohitanakiya/api-rate-limiter)
>
> _Hosted on Render's free tier (~30s cold start after idle). Postgres on Supabase. Groq LLM for intent extraction, re-ranking, and summarization._

## What it does

Takes a natural-language query like *"cheap high-protein veg meal in Bangalore"* or *"something light for breakfast"* and returns a ranked list of food items from the user's real Swiggy catalog, one tap away from checkout.

The interesting layer is the ranker: an LLM extracts structured constraints from the query (price, dietary flags, protein, city) *and* translates vague intent into a concrete Swiggy search term (`"light food"` → `"salad"`). Swiggy's `search_menu` returns candidates; the LLM then scores each item 0–10 for intent-fit and we re-rank on that score, with LLM-generated one-line rationales per card explaining *why* each item earned its rank.

The whole pipeline talks to Swiggy over the [Swiggy MCP](https://mcp.swiggy.com/builders) via OAuth 2.1 + PKCE — every request is scoped to the individual user's Swiggy session, tokens are AES-256-GCM encrypted at rest. One-tap "Add to Swiggy cart" writes to the user's real Swiggy cart via `update_food_cart`; checkout happens on Swiggy's own surface.

## Architecture (today)

```
User (browser)
      |
      v   HTTPS
React frontend (Vercel)
      |
      v   POST /chat/recommend  { text, addressId? }
Node + Express backend (Render Web Service)
      |
      +-- Zod request validation
      +-- Groq extractor: structured filters + Swiggy-friendly search term
      +-- Swiggy MCP client (OAuth 2.1 + PKCE, JSON-RPC 2.0 over HTTP)
      |     - get_addresses     (resolve delivery address)
      |     - search_menu × 2   (parallel pagination for 20 items)
      |     - update_food_cart  (one-tap add-to-cart)
      +-- Groq synthesizer: intentFit 0-10 + rationale + nutrition estimate per item
      +-- Final re-rank by intentFit
      |
      v   parameterized SQL
PostgreSQL (Supabase, RLS on Swiggy tokens)
```

Full architecture write-up: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Tech stack

- **Backend:** Node.js 22, TypeScript (strict), Express 5
- **Database:** PostgreSQL 16 on Supabase (free tier), Row-Level Security on Swiggy token table
- **LLM:** Groq API — `openai/gpt-oss-20b` for filter extraction, `openai/gpt-oss-120b` for synthesis / re-ranking
- **Swiggy:** MCP client — JSON-RPC 2.0 over HTTP, SSE-aware, OAuth 2.1 + PKCE per-user delegation
- **Auth:** JWT for KhanaDedo identity (`bcrypt` password hashing); AES-256-GCM at-rest encryption for Swiggy access tokens; optional API-key gateway via the companion [api-rate-limiter](https://github.com/rohitanakiya/api-rate-limiter)
- **Validation:** Zod schemas + centralized typed `ApiError` middleware
- **Hosting:** Render Web Service (backend) · Supabase (Postgres) · Vercel (frontend)

## Endpoints

| Method | Path                     | Auth | Purpose |
|--------|--------------------------|------|---------|
| POST   | `/auth/signup`           | none | Create user; optionally provision a rate-limiter API key |
| POST   | `/auth/login`            | none | Issue 7-day JWT |
| POST   | `/auth/forgot-password`  | none | Send password-reset email via Resend |
| POST   | `/auth/reset-password`   | none | Consume reset token, set new password |
| POST   | `/auth/swiggy/start`     | JWT  | Begin Swiggy OAuth (returns `authorizeUrl`) |
| GET    | `/auth/swiggy/callback`  | JWT  | OAuth redirect target; stores encrypted access token |
| GET    | `/auth/swiggy/status`    | JWT  | Whether the user has an active Swiggy connection |
| POST   | `/auth/swiggy/logout`    | JWT  | Disconnect Swiggy (deletes stored token) |
| GET    | `/profile/me`            | JWT  | Return logged-in user's profile |
| POST   | `/chat/recommend`        | none | Ranked recommendations. Seed path anon, Swiggy path for connected users |
| GET    | `/chat/addresses`        | JWT  | List the user's Swiggy delivery addresses for the frontend picker |
| POST   | `/chat/cart`             | JWT  | Add one item to the user's Swiggy cart via `update_food_cart` |
| GET    | `/menu`                  | none | Browse seeded menu items (demo-mode fallback) |
| GET    | `/health`                | none | Liveness check |

## Try it against the live API

```bash
curl -s -X POST https://ai-food-backend-ib8i.onrender.com/chat/recommend \
  -H "Content-Type: application/json" \
  -d '{"text":"cheap high protein veg food in bangalore"}' | jq
```

First request after idle takes ~30s (Render free-tier cold start). After that, sub-second.

## Local development

```bash
git clone https://github.com/rohitanakiya/KhanaDedo.git
cd KhanaDedo
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET
npm run db:migrate
npm run db:seed
npm run embeddings:generate
npm run dev
```

Server runs on `http://localhost:4000`.

## Running behind the api-rate-limiter (gateway mode)

The backend can run standalone or behind the [api-rate-limiter](https://github.com/rohitanakiya/api-rate-limiter) as an authenticating, rate-limiting gateway — same layered-auth pattern Stripe and AWS API Gateway use. The gateway answers *"are you allowed and how often"* via API keys; the backend keeps its own JWT for *"who you are"*.

```
Browser
   |
   v   port 8000 (public)
api-rate-limiter      Python / FastAPI / Redis
   |   HMAC key auth, token bucket + sliding window
   |   forwards to UPSTREAM_URL with X-Authenticated-* headers
   v   port 4000 (loopback only in gateway mode)
ai-food-backend       Node / Express
   |   gatewayAuth middleware reads the identity headers
   v
PostgreSQL
```

To enable, set on the backend:
```env
GATEWAY_MODE=true
CORS_ORIGINS=http://localhost:8000,http://localhost:5173
```

And on the rate-limiter:
```env
UPSTREAM_URL=http://127.0.0.1:4000
```

Full walkthrough (Redis container, both services, end-to-end smoke test): see the rate-limiter README.

## Documentation

- [`PRIVACY.md`](./PRIVACY.md) — what user data is collected, how it's stored, retention, deletion
- [`SECURITY.md`](./SECURITY.md) — threat model, in-place controls, known limitations, vulnerability reporting
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — current and target architectures, component table, endpoint reference

## Roadmap

The vision is an AI agent that lets users say *"find me a cheap veg high-protein meal nearby"* and ranks live Swiggy results against those constraints — replacing the 20-minute doomscroll-on-Swiggy with a 30-second decision. Sequenced milestones:

**v1 — done**
- Backend + frontend live with a hand-seeded ~30-item menu
- Local embeddings, rule-based filter extraction, hybrid scoring
- JWT auth, Zod validation, error middleware, idempotent migrations
- Companion api-rate-limiter integration (designed and tested; runs locally; can be deployed in front of the backend in gateway mode)

**v2 — done**
- LLM-driven filter extraction (Groq, developer tier) replacing the regex extractor for nuanced queries
- LLM-synthesized one-line rationale per ranked result plus a summary
- LLM-estimated protein/calories per Swiggy item, marked visibly as estimates

**v3 — Swiggy MCP integration — done**
- OAuth 2.1 + PKCE per-user authorization against the Swiggy MCP server
- Live restaurant and menu data replacing the seeded dataset
- Deep-link to the Swiggy app for actual checkout (no payment handling on our side)
- "Powered by Swiggy" + "Re-ranked by KhanaDedo" attribution on every result set

**v4 — depth on Swiggy**
- pgvector + HNSW index replacing JSONB linear scan (embeddings cached per Swiggy item)
- Distance + delivery-time as ranking signals once we cross-reference the Swiggy address geo
- Session-aware Swiggy caching so repeat queries are near-instant
- PWA install for mobile users

> **Scope note:** KhanaDedo is a Swiggy-only integration. We are not
> planning to add other food-delivery, dining, or quick-commerce
> providers. The goal is depth on one platform, not shallow
> multi-provider coverage.

## Limitations (honest)

- Nutrition on Swiggy items is LLM-estimated from dish names (Swiggy MCP doesn't return per-item macros). Displayed with a dashed underline and a `~` label so users know these are estimates, not measurements.
- No automated evaluation of recommendation quality; manual spot-checks only.
- Cross-region latency: backend on Render Oregon, DB on Supabase Mumbai = ~400ms round-trip per query. Acceptable for demo, would co-locate before launch.
- Semantic embeddings (`@xenova/transformers`) are skipped on Render to keep the slug small; the LLM re-ranking step covers most of what cosine similarity would have. Local dev has full embeddings for A/B comparison.
- Items with required Swiggy variants (size, spice level, addons) can't be blind-added to cart — we detect the failure and fall back to opening the menu page so the user can customize + add themselves.
- Swiggy's cart is browser-session-scoped: after one-tap add, the user must also be logged into Swiggy in the same browser to see the item at checkout. Most Indian users are, but a fresh device requires one Swiggy login step.

## Author

Rohit Anakiya — [@rohitanakiya](https://github.com/rohitanakiya) · anakiyarohit@gmail.com

Built to learn how production AI-backed systems actually fit together. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the engineering decisions behind it.
