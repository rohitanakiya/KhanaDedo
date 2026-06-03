# AI Food Recommendation Backend

> **Live demo:** https://foodhelp-frontend.vercel.app
> **API:** https://ai-food-backend-ib8i.onrender.com  ·  [`/health`](https://ai-food-backend-ib8i.onrender.com/health)
> **Frontend repo:** [foodhelp-frontend](https://github.com/rohitanakiya/foodhelp-frontend)  ·  **Rate-limiter:** [api-rate-limiter](https://github.com/rohitanakiya/api-rate-limiter)
>
> _Hosted on Render's free tier (~30s cold start after idle). Postgres on Supabase. Local embeddings via Transformers.js — zero paid AI APIs._

## What it does

Takes a natural-language query like *"cheap high-protein veg meal in Bangalore"* and returns ranked food recommendations. The interesting layer is the ranker: it combines semantic vector similarity with structured constraints extracted from the query (price, dietary flags, protein, city) and a hybrid score that mixes similarity, nutrition signals, and restaurant rating.

The eventual product, currently in build-out, is an AI agent that does the same thing over live Swiggy data (via the [Swiggy MCP](https://mcp.swiggy.com/builders) program) and hands off to Swiggy's checkout — so the user types what they want, the agent ranks Swiggy's real catalog against those constraints, and the user clicks one button to order. See **Roadmap** below.

## Architecture (today)

```
User (browser)
      |
      v   HTTPS
React frontend (Vercel)
      |
      v   POST /chat/recommend
Node + Express backend (Render Web Service)
      |
      +-- Zod request validation
      +-- Rule-based intent extraction (city, veg, max price, min protein)
      +-- Local 384-dim embeddings via @xenova/transformers
      +-- Hybrid scoring (similarity + protein + rating)
      |
      v   parameterized SQL
PostgreSQL (Supabase, with pgvector available)
```

Full architecture write-up including the planned target state with Swiggy MCP: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Tech stack

- **Backend:** Node.js 22, TypeScript (strict), Express 5
- **Database:** PostgreSQL 16 on Supabase (free tier, includes pgvector)
- **Embeddings:** [`@xenova/transformers`](https://github.com/xenova/transformers.js) — `Xenova/all-MiniLM-L6-v2` (384-dim), runs in-process, zero external API cost
- **Validation:** Zod schemas + centralized typed `ApiError` middleware
- **Auth:** JWT for user identity (`bcrypt` for password hashing) + optional API-key gateway via the companion [api-rate-limiter](https://github.com/rohitanakiya/api-rate-limiter)
- **Hosting:** Render Web Service (backend) · Supabase (Postgres) · Vercel (frontend)

## Endpoints

| Method | Path               | Auth | Purpose |
|--------|--------------------|------|---------|
| POST   | `/auth/signup`     | none | Create user; optionally provision a rate-limiter API key |
| POST   | `/auth/login`      | none | Issue 7-day JWT |
| GET    | `/profile/me`      | JWT  | Return logged-in user's profile |
| POST   | `/chat/recommend`  | none | Public semantic recommendation |
| GET    | `/menu`            | none | Browse seeded menu items with filters |
| GET    | `/health`          | none | Liveness check |

## Try it against the live API

```bash
curl -s -X POST https://ai-food-backend-ib8i.onrender.com/chat/recommend \
  -H "Content-Type: application/json" \
  -d '{"text":"cheap high protein veg food in bangalore"}' | jq
```

First request after idle takes ~30s (Render free-tier cold start). After that, sub-second.

## Local development

```bash
git clone https://github.com/rohitanakiya/foodhelp.git
cd foodhelp
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

**v2 — in build**
- LLM-driven filter extraction (Groq + Llama 3.3 70B, free tier) replacing the regex extractor for nuanced queries
- pgvector + HNSW index replacing JSONB linear scan
- LLM-synthesized one-line rationales per ranked result

**v3 — Swiggy MCP integration**
- OAuth 2.1 + PKCE per-user authorization against the Swiggy MCP server
- Live restaurant and menu data replacing the seeded dataset
- Distance + delivery-time as ranking signals
- Deep-link to Swiggy app for actual checkout (no payment handling on our side)

**v4 — distribution**
- PWA install for mobile users
- MCP server exposing the recommender to Claude / ChatGPT / Gemini users from their existing assistants
- Optional Capacitor wrap for Google Play Store

## Limitations (honest)

- Dataset is ~30 hand-seeded menu items — enough to demonstrate ranking, not a real recommender.
- Filter extraction is regex — reliable for demo queries, brittle on nuanced phrasings (planned: LLM via Groq).
- Embeddings stored as JSONB scanned linearly — fine at this scale, would migrate to pgvector for production.
- No automated evaluation of recommendation quality; manual spot-checks only.
- Cross-region latency: backend on Render Oregon, DB on Supabase Mumbai = ~400ms round-trip per query. Acceptable for demo, would co-locate before launch.

## Author

Rohit Anakiya — [@rohitanakiya](https://github.com/rohitanakiya) · anakiyarohit@gmail.com

Built to learn how production AI-backed systems actually fit together. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the engineering decisions behind it.
