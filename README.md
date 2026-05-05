# 🍽️ AI Food Recommendation Backend

> 🚀 **Live demo:** https://foodhelp-frontend.vercel.app
> **API base:** https://ai-food-backend-ib8i.onrender.com — health check at [`/health`](https://ai-food-backend-ib8i.onrender.com/health)
> **Frontend repo:** [foodhelp-frontend](https://github.com/rohitanakiya/foodhelp-frontend)
>
> _Hosted on Render's free tier — the first request after idle takes ~30s to wake up. Postgres + local Transformers.js embeddings (Xenova/all-MiniLM-L6-v2)._

## 🚀 Project Overview

This project is a **backend system for an AI-powered food recommendation engine**.

The goal is to allow users to input natural language queries like:

> *"cheap high protein veg food in bangalore"*
> *"light but filling food"*

…and receive **intelligent food recommendations** based on:

* semantic understanding (AI-like behavior)
* nutritional data (protein, calories)
* restaurant ratings
* user intent

---

## 🧠 Core Idea

Traditional systems rely only on filters (price, veg, etc.).

This system goes beyond that by combining:

```
Natural Language Input
        ↓
Intent Extraction (rule-based NLP)
        ↓
Embedding Generation (vector representation)
        ↓
Cosine Similarity (semantic matching)
        ↓
Hybrid Scoring (AI-like ranking)
        ↓
Top Food Recommendations
```

---

## 🏗️ Tech Stack

* **Backend:** Node.js + TypeScript (strict)
* **Framework:** Express 5
* **Database:** PostgreSQL (JSONB embeddings, idempotent migration runner)
* **Authentication:** JWT (user identity) + optional API-key gateway (rate-limiter)
* **ORM/DB Access:** pg (node-postgres)
* **Embeddings:** [`@xenova/transformers`](https://github.com/xenova/transformers.js) — `Xenova/all-MiniLM-L6-v2` (384-dim), runs locally with no API costs
* **Validation:** Zod schemas + centralized error middleware
* **Hosting:** Render (Web Service + Postgres) · Vercel (frontend)

---

## 📦 Features Implemented

### 🔐 Authentication System

* User signup & login
* Password hashing
* JWT-based authentication
* Protected routes

---

### 👤 Profile Module

* Fetch user profile (`/profile/me`)
* Middleware-based authentication

---

### 🍴 Food Database

* `restaurants` table
* `menu_items` table with:

  * price
  * veg/non-veg
  * protein
  * calories
  * description

---

### 🔎 Menu Filtering API

* Filter by:

  * city
  * veg
  * protein
  * price
* Efficient SQL queries with indexing

---

### 🧠 Natural Language Parsing

Converts user input into structured filters:

Example:

```
"cheap veg high protein food"
↓
{ veg: true, maxPrice: 300, minProtein: 20 }
```

---

### 🤖 Semantic Recommendation System

#### Step 1: Embedding (Simulated)

* Converts text → vector representation

#### Step 2: Similarity Matching

* Uses **cosine similarity** to compare:

  * user query
  * menu items

#### Step 3: Hybrid Scoring

Final score combines:

* semantic similarity
* protein content
* restaurant rating

---

### 📡 API Endpoint

#### POST `/chat/recommend`

Request:

```json
{
  "text": "light but filling food"
}
```

Response:

```json
{
  "filters": {},
  "recommendations": [...]
}
```

---

## 🧪 Example Queries

* "cheap veg food in bangalore"
* "high protein meal"
* "light but filling food"
* "budget healthy options"

---

## ⚡ Try it against the live API

```bash
curl -s -X POST https://ai-food-backend-ib8i.onrender.com/chat/recommend \
  -H "Content-Type: application/json" \
  -d '{"text":"cheap high protein veg food in bangalore"}' | jq
```

The first request after idle takes ~30s on Render's free tier (cold start). After that, responses are <1s.

---

## ⚠️ Current Limitations

* Dataset is hand-seeded (~30 menu items across a handful of restaurants) — enough to show the ranking working, not enough to be a real recommender.
* Embeddings are stored as JSONB and scanned linearly. Fine for demo scale; would migrate to pgvector for production.
* Filter extraction is rule-based regex, not an LLM. Reliable for the demo queries, brittle for edge cases.

---

## 🔮 Future Improvements

* 📊 Migrate JSONB embeddings → pgvector with HNSW index
* 🧠 LLM-driven filter extraction (replace regex)
* 📍 Location-based ranking (radius from user)
* 👤 Personalization from search history
* 🍽️ Real data ingestion pipeline (Zomato / Swiggy)

---

## 🧠 What This Project Demonstrates

* Backend system design
* Database modeling & optimization
* API architecture
* Authentication & security
* NLP basics (intent extraction)
* Vector similarity concepts
* AI system thinking (RAG foundation)

---

## ⚡ Getting Started

```bash
npm install
npm run dev
```

Server runs on:

```
http://localhost:4000
```

---

## 🚪 Running behind the api-rate-limiter gateway

This backend can run standalone (open on `0.0.0.0:4000`) or behind a sibling project, [api-rate-limiter](https://github.com/rohitanakiya/api-rate-limiter), as an authenticating, rate-limiting API gateway. The integration is the same architecture Stripe, Cloudflare, and AWS API Gateway use: a single public surface checks who you are and how fast you're going before traffic ever reaches the application server.

### Architecture

```
Browser / curl
      │
      ▼  (port 8000, public)
┌──────────────────────────┐
│ api-rate-limiter         │  Python · FastAPI · Redis
│  • X-API-Key auth (HMAC) │
│  • Token bucket          │
│  • Sliding window        │
│  • /gw/* → proxies to    │
│    UPSTREAM_URL          │
└──────────┬───────────────┘
           │ adds X-Authenticated-Key-Id,
           │ X-Authenticated-Scopes, etc.
           ▼  (port 4000, 127.0.0.1 only in gateway mode)
┌──────────────────────────┐
│ ai-food-backend          │  Node · Express · Postgres
│  • gatewayAuth middleware│
│  • JWT auth for /profile │
│  • semantic recommender  │
└──────────────────────────┘
```

The food backend keeps its existing JWT for user identity (`/auth/login`, `/profile`). The gateway answers a different question: "may you call this API at all?" — layered auth, not replaced.

### Configuration

Add to your `.env`:

```env
GATEWAY_MODE=true
CORS_ORIGINS=http://localhost:8000,http://localhost:3000,http://localhost:5173
```

When `GATEWAY_MODE=true`:
- The server binds to `127.0.0.1:4000` instead of `0.0.0.0`, so only the local gateway can reach it.
- The `gatewayAuthMiddleware` reads `X-Authenticated-Key-Id`, `X-Authenticated-Scopes`, etc. from the gateway and exposes them on `req.gateway` for downstream handlers.

In the rate-limiter's `.env`:

```env
UPSTREAM_URL=http://127.0.0.1:4000
```

### Running both services together

You'll need **three terminals** (or two if you skip Redis and use the rate-limiter's in-memory fallback):

```powershell
# Terminal 1 — Redis (optional; rate-limiter falls back to in-memory if unavailable)
cd C:\Users\rohit\OneDrive\Desktop\api-rate-limiter
docker compose up

# Terminal 2 — Rate limiter / gateway
cd C:\Users\rohit\OneDrive\Desktop\api-rate-limiter
.\venv\Scripts\activate
uvicorn app.main:app --reload

# Terminal 3 — Food backend
cd C:\Users\rohit\OneDrive\Desktop\ai-food-backend
npm run dev
```

### Smoke test (PowerShell)

```powershell
# Create an API key via the gateway's admin endpoint
$adminKey = "super-secret-admin-key-change-in-production"  # from rate-limiter .env
$response = Invoke-RestMethod -Uri http://localhost:8000/admin/keys `
  -Method Post `
  -Headers @{"X-Admin-Key"=$adminKey} `
  -ContentType "application/json" `
  -Body '{"name":"smoke","scopes":["read","write"],"tier":"free"}'
$apiKey = $response.raw_key

# Call /chat/recommend through the gateway
Invoke-RestMethod -Uri http://localhost:8000/gw/chat/recommend `
  -Method Post `
  -Headers @{"X-API-Key"=$apiKey} `
  -ContentType "application/json" `
  -Body '{"text":"high protein veg food in bangalore"}' |
  ConvertTo-Json -Depth 10
```

The rate-limiter applies its tier limits (free = 20 req/min, sliding window + token bucket) before the request ever reaches the food backend. Past the limit you'll see `429 rate_limit_exceeded` with `Retry-After`.

---

## 👨‍💻 Author

Built as a learning project to understand:

> **How real-world AI-backed backend systems are designed and implemented.**

---

## 🚧 Roadmap / What’s Remaining

This project is currently in the **backend + AI foundation stage**.
The following features are planned to evolve it into a full production-ready system:

---

### 🎨 Frontend (React-based UI)

* Build a modern **React + TypeScript frontend**
* Features:

  * 🔍 Search bar for natural language queries
  * 🍽️ Interactive food cards (price, protein, calories, rating)
  * 🎯 Filters (veg, price range, protein)
  * 📱 Responsive UI (mobile-friendly)
* Optional:

  * Real-time suggestions (autocomplete)
  * Dark mode

---

### 🤖 Real AI Integration

* Replace fake embeddings with real embeddings (OpenAI)
* Improve semantic understanding of:

  * vague queries (“light but filling”)
  * preferences (“gym diet”, “bulking food”)
* Move toward **RAG-based system**

---

### 📊 Vector Search Upgrade

* Replace JSON embeddings with:

  * PostgreSQL + pgvector **OR**
  * External vector DB (Pinecone / Weaviate)
* Enable fast and scalable similarity search

---

### 🍽️ Data Ingestion (Zomato / Swiggy MCP)

* Build pipelines to ingest real-world data:

  * restaurant menus
  * ratings
  * pricing
* Possible approaches:

  * public APIs (if available)
  * scraping pipelines (with caution)
  * MCP-style ingestion system
* Normalize and clean data for consistency

---

### 👤 Personalization

* User-specific recommendations:

  * dietary preferences
  * fitness goals (cutting / bulking)
  * past interactions
* Store user behavior → improve ranking

---

### ⚖️ Advanced Ranking System

* Improve scoring with:

  * calories vs protein balance
  * price efficiency (₹ per gram protein)
  * popularity signals
* Dynamic weighting instead of fixed formula

---

### 📍 Location Awareness

* Geo-based filtering:

  * nearby restaurants
  * delivery radius
* Integration with maps APIs

---

### 🚀 Deployment & Scaling — ✅ done for v1

* ✅ Backend deployed on Render (`render.yaml` blueprint, auto-deploy on push to `main`)
* ✅ Postgres on Render free tier with SSL
* ✅ Frontend deployed on Vercel
* 🔜 Docker / CI / observability when this graduates past portfolio scope

---

### 🔐 Production Readiness — ✅ done for v1

* ✅ Input validation (Zod) on every request body
* ✅ Centralized error middleware with typed `ApiError` hierarchy
* ✅ CORS allowlist driven by env var
* ✅ Rate limiting (via [api-rate-limiter](https://github.com/rohitanakiya/api-rate-limiter) gateway in Path B mode)
* 🔜 Structured logging + Sentry-style error tracking

---

## 🎯 Long-Term Vision

Transform this into a system similar to:

```id="vision"
Zomato / Swiggy + AI assistant
```

Where users can:

* ask in natural language
* get personalized, intelligent food recommendations
* discover meals based on goals, not just menus

---


---
