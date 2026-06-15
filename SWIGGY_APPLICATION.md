# Swiggy Builders Club — Application Draft

Submit at: https://mcp.swiggy.com/builders/access/

Each section below maps to a field on the application form. Review,
adjust if anything reads off for you, then copy-paste field by field.

---

## Who you are

**Type:** Individual developer (solo, no registered company)

**Name:** Rohit Anakiya
**Email:** anakiyarohit@gmail.com
**GitHub:** https://github.com/rohitanakiya
**Location:** India

---

## What you're building

A personal AI food recommender that takes natural-language queries like
"cheap high-protein veg meal under 500 calories near me" and ranks
Swiggy results against those constraints. The user describes what they
want once; the agent extracts intent, calls Swiggy MCP for nearby
restaurants and menus, RAG-ranks the results against the constraints
(price, nutrition, distance, ratings), and presents a top-5 with
one-line rationales.

The goal is to reduce the 20-minute "what should I eat" doomscroll on
Swiggy to a 30-second decision. Initial scope: personal use and a
small closed beta with friends. The product would deep-link to
Swiggy's app for actual checkout — no payment handling on our side.

Swiggy is clearly attributed as the source of all restaurant and menu
data shown to users; results are presented as Swiggy listings, with
Swiggy branding and an "Order on Swiggy" deep-link on every card.
Ranking is applied as an additive filter reflecting the user's own
stated preferences (price ceiling, dietary, nutrition targets), not as
a substitute for or override of Swiggy's default ordering.

Live working prototype (with hand-seeded menu data while we wait for
Swiggy access): https://khanadedo.vercel.app
Source: https://github.com/rohitanakiya/KhanaDedo

---

## How it works (integration architecture)

React frontend (Vercel) -> Node/TypeScript/Express orchestrator
(Render Web Service) -> Swiggy MCP.

The orchestrator does LLM-based intent extraction (Groq, Llama 3.3
70B free tier), then calls Swiggy MCP tools (search_restaurants,
browse_menu) over OAuth 2.1 + PKCE per end-user. Results are
embedded with a local Transformers.js model (Xenova/all-MiniLM-L6-v2,
384-dim) and ranked against the parsed constraints with cosine
similarity, then re-ranked with nutrition and rating signals.

PostgreSQL on Supabase stores per-user OAuth refresh tokens
(encrypted at rest), user identity, and cached embeddings. No order
placement; we deep-link to the Swiggy app for checkout.

Full architecture diagram and component table:
https://github.com/rohitanakiya/KhanaDedo/blob/main/docs/ARCHITECTURE.md

---

## Redirect URI(s)

Production: https://ai-food-backend-ib8i.onrender.com/auth/swiggy/callback
Local dev:  http://localhost:4000/auth/swiggy/callback

---

## Static IP ranges or gateway IP(s)

This is a solo developer project currently deployed on Render's free
tier with dynamic egress IPs. Render publishes their egress IP ranges
at https://render.com/docs/static-outbound-ip-addresses — happy to
provide the specific Oregon-region range if helpful.

If a fixed static IP is a hard requirement for production access, I'm
prepared to migrate the orchestrator to a static-IP-capable host
(Oracle Cloud Always Free with a reserved public IP) before going
live. Application architecture is host-agnostic, so the migration is
straightforward.

---

## Security contact

Rohit Anakiya — anakiyarohit@gmail.com (solo developer, primary
contact)

Security policy and vulnerability reporting procedure:
https://github.com/rohitanakiya/KhanaDedo/blob/main/SECURITY.md

---

## Data handling and privacy declaration

Per-user data stored:
- Swiggy OAuth refresh tokens (encrypted at rest in PostgreSQL)
- User identity (email, optional username, bcrypt-hashed password,
  JWT-issued session tokens)
- Cached embedding vectors (no PII)

Search/query history is NOT currently persisted. No payment data, no
device identifiers, no location data beyond what Swiggy itself
returns about restaurants.

Tokens refreshed via standard OAuth flow. Account deletion endpoint
is planned; current deletions are performed on request. TLS in
transit (TLS 1.2+). Postgres connections require SSL.

We do not share user data with third parties. LLM calls (intent
extraction via Groq) send only the user's anonymized query text — no
user identifiers, no session tokens.

Full privacy policy:
https://github.com/rohitanakiya/KhanaDedo/blob/main/PRIVACY.md

---

## Environment and infrastructure setup details

- Frontend: Vercel (free hobby tier), auto-deploy on push to main
- Backend: Render Web Service (Node 22, free tier)
- Database: Supabase (PostgreSQL 16, ap-south-1 / Mumbai, free tier,
  SSL enforced)
- LLM: Groq API (server-side calls only, key stored in Render's
  encrypted environment variable store)
- Embeddings: local Transformers.js in the backend process (no
  external embedding API)
- Source repos:
  - Backend: https://github.com/rohitanakiya/KhanaDedo
  - Frontend: https://github.com/rohitanakiya/KhanaDedo-frontend
  - Companion rate-limiter (designed to sit in front of backend):
    https://github.com/rohitanakiya/api-rate-limiter

Single dev/prod environment for now. Staging environment to be added
if and when usage warrants it.

---

## Acknowledgement of Swiggy MCP terms

(Check the box / agree to terms when shown on the form. Review the
terms first; if they include anything unusual — per-call fees, IP
assignment, exclusivity — pause and reconsider before agreeing.)

---

## Optional fields — leave blank

- Security audit summary: none performed
- SOC2 / ISO certification: none
- Expected traffic and scaling plan: personal use + small closed
  beta initially; honest answer is "we'll learn what usage looks
  like once we go live."

---

## Submission checklist (do these before clicking submit)

- [ ] README at https://github.com/rohitanakiya/KhanaDedo shows the
      current architecture (Supabase, not Render Postgres) and links
      to PRIVACY.md, SECURITY.md, docs/ARCHITECTURE.md
- [ ] Frontend README includes a screenshot so reviewers see the
      product working
- [ ] All three repos (KhanaDedo, KhanaDedo-frontend,
      api-rate-limiter) are pinned on your GitHub profile and have
      1-line descriptions filled in
- [ ] Live demo at https://khanadedo.vercel.app returns
      results for a test query (cold-start ~30s on first request)
- [ ] /health endpoint returns { "status": "ok" }

If all five are green, submit.
