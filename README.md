# Lead Intake Service

Receives leads from **Meta Lead Ads** through a webhook, stores them as the system of record for
the lead lifecycle, keeps an **append-only audit trail** of everything that happens to each lead,
and gives the sales team a dashboard to work them.

| | |
|---|---|
| **Dashboard** | https://stylework-lead-intake-ui.onrender.com |
| **API** | https://stylework-lead-intake.onrender.com ([`/health`](https://stylework-lead-intake.onrender.com/health)) |
| **Repository** | https://github.com/sahulhamid/stylework-lead-intake |

> **Free-tier note:** the API sleeps after ~15 minutes without traffic. The first request after that
> takes 30–60 seconds while it wakes up; everything is fast afterwards. The live data is demo data.

---

## Contents

1. [Tech stack](#tech-stack)
2. [Architecture](#architecture)
3. [What's implemented](#whats-implemented)
   - [Idempotent webhook ingestion](#idempotent-webhook-ingestion)
   - [Status lifecycle and concurrency control](#status-lifecycle-and-concurrency-control)
   - [Audit trail](#audit-trail)
   - [API reference](#api-reference)
   - [Dashboard](#dashboard)
4. [Running locally](#running-locally)
5. [Running with Docker](#running-with-docker)
6. [Sending webhooks](#sending-webhooks) (local and deployed)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Scaling](#scaling)
10. [Trade-offs and decisions](#trade-offs-and-decisions)
11. [Future improvements](#future-improvements)
12. [Project structure](#project-structure)
13. [AI usage](#ai-usage)

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| API | **Node.js 22, Express 5, TypeScript (strict)** | Small, explicit and easy to reason about; Express 5 forwards async errors to one error handler |
| Validation | **Zod** | Every body, query, param and environment variable is validated; TypeScript types are inferred from the schemas |
| Database | **PostgreSQL 17** | Transactions across two tables, unique constraints, triggers and JSONB are all needed by the audit design |
| ORM | **Prisma 7** (with `@prisma/adapter-pg`) | Typed queries, versioned SQL migrations, transactions |
| Logging | **pino** + pino-http | Structured JSON logs with a request ID on every line and PII redaction |
| Frontend | **React 19, Vite, TypeScript, TanStack Query, React Router, Tailwind CSS** | TanStack Query handles caching, cancellation and cache invalidation after writes |
| Tests | **Vitest + Supertest** | Unit tests for pure logic, integration tests through real HTTP against a real Postgres |
| Packaging | **Docker** (multi-stage) + docker-compose | One command runs the database, API and dashboard |
| Hosting | **Render** (API container + static site) + **Neon** (managed Postgres) | Free tiers, deploys straight from GitHub |

---

## Architecture

```
  Meta Lead Ads                                  Sales team (browser)
       │  POST /webhook/meta-lead                        │
       │  (signed: X-Hub-Signature-256)                  │  React dashboard (static files)
       ▼                                                 ▼
┌──────────────────────────────── Express API ─────────────────────────────────┐
│ request-id → http logger → helmet → JSON body (raw bytes kept for the HMAC)  │
│                                                                               │
│  webhook module                          leads module                         │
│   signature check → parse → ingest ──▶   routes → controller → service →      │
│   (adapter: speaks Meta's format)         repository  (domain: lead lifecycle) │
│                                                                               │
│ central error handler: { error: { code, message, details } }                 │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       ▼
                 PostgreSQL:  leads (current state)  +  lead_activities (append-only history)
```

- **Layering:** routes → controller (HTTP only) → service (business rules) → repository (all SQL).
  Read endpoints have no business rules, so their controllers call the repository directly;
  the service layer exists where there is logic (the status change).
- **Dependency direction:** `webhook` (adapter for Meta's format) → `leads` (domain). The domain
  never imports Meta-specific code.
- **One transaction per change:** every write to `leads` and its matching `lead_activities` row
  commit together or not at all.

---

## What's implemented

### Idempotent webhook ingestion

**The problem.** Meta retries a webhook for up to 36 hours until it gets a `200`, may deliver the
same lead more than once, and can deliver duplicates **at the same time**. A naive "insert on every
delivery" creates duplicate leads and a polluted audit trail.

**The design: every delivery is safe to repeat.**

```
POST /webhook/meta-lead
 │
 ├─ 1. Verify signature: HMAC-SHA256 of the RAW request bytes with META_APP_SECRET,
 │     timing-safe comparison, strict 64-hex check        → 401 if missing or wrong
 ├─ 2. Validate the envelope (object: "page", entry[])    → 400 if it isn't a Meta page event
 ├─ 3. For each change where field === "leadgen" (other fields such as "feed" are ignored):
 │       • malformed lead      → skipped and logged (a retry can't fix it)
 │       • details             → LeadDataProvider (inline field_data today, Graph API in production)
 │       • find by meta_lead_id
 │           ├─ not found → INSERT lead + LEAD_CREATED            (one transaction)
 │           │     └─ UNIQUE violation (P2002)? a concurrent delivery won the race:
 │           │        re-read the lead and continue as an update
 │           └─ found     → field-level diff
 │                 ├─ no changes → nothing written                        "unchanged"
 │                 └─ changes    → UPDATE … WHERE id AND version
 │                                 + LEAD_UPDATED with the diff  (one transaction)  "updated"
 └─ 4. 200 { status, created, updated, unchanged, skipped }
```

Key points:

- **The database is the source of truth for uniqueness.** `meta_lead_id` has a `UNIQUE` constraint.
  There is no check-then-insert race: if two deliveries of a new lead arrive together, one insert
  wins and the other gets Prisma error `P2002`, which the code treats as "already created" and
  continues down the update path. Verified by a test that sends **10 concurrent deliveries** of the
  same lead and asserts **1 lead and 1 activity**.
- **Duplicates are no-ops.** The diff compares tracked fields only, sorts JSON keys (Postgres JSONB
  does not preserve key order), compares dates by instant, and **ignores empty incoming values**,
  so a re-delivery without details never erases data. Only real changes write a `LEAD_UPDATED`
  activity, which stores `{ field: { old, new } }`.
- **Signature over the raw body.** `express.json({ verify })` keeps the exact request bytes. The
  HMAC is never computed over re-serialized JSON, which can differ in spacing and key order.
- **Failure semantics are deliberate.** Malformed items are skipped with a `200` (retrying can't fix
  them; their paths are logged). Unexpected errors (for example the database is down) return `5xx`
  so Meta retries the batch, which is safe precisely because ingestion is idempotent.
- **Real Meta webhooks carry only IDs.** Lead details come from the Graph API
  (`GET /{leadgen_id}`). That call sits behind a `LeadDataProvider` interface; this project ships an
  `InlineLeadDataProvider` that reads `field_data` sent inside the webhook, so it can be tested
  without a Meta app. Swapping in a Graph API provider is a one-line change.

### Status lifecycle and concurrency control

```
NEW ──▶ CONTACTED ──▶ QUALIFIED ──▶ CONVERTED (final: handed off to booking)
 │           │             │
 └──▶ LOST ◀─┴─────────────┘
       └──▶ CONTACTED   (re-engagement)
```

- **State machine as data:** `lead-status.ts` holds a `Record<LeadStatus, LeadStatus[]>` table.
  Adding a status to the Prisma enum won't compile until its transitions are defined.
  A same-status "change" is invalid automatically.
- **`PATCH /leads/:id/status`** takes `{ status, note?, version }` and checks, in order:
  lead exists (**404**) → client saw the latest version (**409**) → move allowed (**422**) →
  atomic update.
- **Optimistic locking:** the client sends the `version` it loaded. The update is a single
  `UPDATE … WHERE id = $1 AND version = $2` inside the transaction; zero rows updated means someone
  else changed the lead in between → **409 CONFLICT** instead of a silently lost update. The early
  version check only exists to give a clear message; the atomic `WHERE` is the real guard (a
  dedicated test calls the update with a stale version to prove it).
- **409 vs 422:** 409 means "your view is out of date, reload"; 422 means "that move isn't allowed
  from the current status". Webhook updates bump the version too, so a rep working from an old
  screen is told to reload.
- **The UI never duplicates the rules:** `GET /leads/:id` returns `nextStatuses`, and the dashboard's
  status dropdown only offers those.

### Audit trail

Every lead has a complete, ordered history in `lead_activities`. It is append-only, and a database
trigger rejects any `UPDATE` or `DELETE`, so it holds even outside the application code:

| Type | Written when | Stores |
|---|---|---|
| `LEAD_CREATED` | first delivery of a lead | actor `system:meta-webhook` |
| `LEAD_UPDATED` | a re-delivery changed data | the field-level diff `{ field: { old, new } }` |
| `STATUS_CHANGED` | the sales team moved the lead | `fromStatus`, `toStatus`, optional `note`, actor `dashboard` |

- **Same transaction as the change**, so a status never changes without its history row.
- **Append-only, enforced by the database:** a Postgres trigger rejects `UPDATE` and `DELETE` on
  `lead_activities`, so history can't be rewritten even by a bug or a manual SQL session.
- **Indexed for the timeline:** `(lead_id, created_at)`.
- The dashboard shows it as a tracking-style timeline: the dot colour follows the new status
  (green for converted, grey for lost) and the latest step is highlighted.

**Data model**

| `leads` (current state) | `lead_activities` (history) |
|---|---|
| `id` UUID v7 · `meta_lead_id` **UNIQUE** · form/ad/campaign/page IDs · `meta_created_at` · name, email, phone, city · `custom_fields` JSONB · `raw_payload` JSONB · `status` · `version` · timestamps | `id` · `lead_id` FK · `type` · `actor` · `from_status` / `to_status` · `changes` JSONB · `note` · `created_at` |
| indexes: `status`, `created_at` | index: `(lead_id, created_at)` · append-only trigger |

### API reference

All errors use one shape: `{ "error": { "code": "…", "message": "…", "details"?: … } }`.

| Method & path | Purpose | Responses |
|---|---|---|
| `GET /health` | Liveness + database check | `200 { status: "ok", db: "up" }` · `503` if the DB is unreachable |
| `GET /webhook/meta-lead` | Meta's subscription handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`) | `200` challenge as text · `403` wrong token · `400` missing params |
| `POST /webhook/meta-lead` | Receive leads (signed) | `200 { created, updated, unchanged, skipped }` · `401` bad signature · `400` not a page event / invalid JSON |
| `GET /leads` | List: `page`, `limit` (≤100), `status`, `search` (name, email, phone), `sort` (`-createdAt`, `createdAt`, `-updatedAt`, `updatedAt`, `fullName`, `-fullName`) | `200 { data, meta: { page, limit, total } }` · `400` |
| `GET /leads/:id` | One lead with `activities` (newest first), `rawPayload` and `nextStatuses` | `200 { data }` · `404` · `400` if the id isn't a UUID |
| `PATCH /leads/:id/status` | Change status: `{ status, note?, version }` | `200 { data }` · `400` · `404` · `409` stale version · `422` invalid transition |

Pagination always sorts by an extra `id` tie-breaker, so leads that share a timestamp (for example a
Meta batch) never repeat or disappear between pages.

### Dashboard

- **Lead list:** table (name, contact, status badge, source, received), debounced search, status
  filter, sort, pagination; loading, empty and error states. Filters live in the URL
  (`?status=NEW&page=2`), so links can be shared and the back button restores the view.
- **Lead detail:** contact and source, form answers, a collapsible raw payload viewer, the status
  control (only valid next statuses) and the activity timeline. A 409 shows a clear message and
  reloads the latest version automatically.
- **TanStack Query:** query keys built by one factory (`leadKeys`); request cancellation with
  `AbortSignal`; `keepPreviousData` so paging doesn't flash; after a status change the PATCH
  response is written straight into the detail cache (`setQueryData`) and only the list caches are
  invalidated; 4xx errors are never retried.

**Production basics (backend):** environment validated at startup (the app refuses to start with a
bad config), structured JSON logs with request IDs and PII redaction (IDs are logged, never names,
emails or phones), a central error handler that never leaks internals, `helmet` headers, CORS
limited to the dashboard's origin on `/leads` only, `/health` with a DB probe, graceful shutdown on
`SIGTERM`, containers running as a non-root user.

---

## Running locally

**Requirements:** Node.js 22, Docker.

```bash
git clone https://github.com/sahulhamid/stylework-lead-intake.git
cd stylework-lead-intake

# 1. Database only (Postgres 17 on localhost:5432; also creates the leads_test database)
docker compose up -d postgres

# 2. API on http://localhost:4000
cd backend
npm install
cp .env.example .env
npx prisma generate            # generates the typed client (not committed)
npx prisma migrate deploy      # creates the tables and the append-only trigger
npm run dev

# 3. Dashboard on http://localhost:5173 (in a second terminal)
cd frontend
npm install
npm run dev

# 4. Add some leads (in a third terminal)
cd backend
npm run webhook:send -- --count 10
```

Open http://localhost:5173.

**Backend environment variables** (`backend/.env.example` documents each one):

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://leads:leads@localhost:5432/leads` | required |
| `META_VERIFY_TOKEN` | `local-verify-token` | required; used by the GET handshake |
| `META_APP_SECRET` | `local-dev-app-secret-change-me` | required, at least 16 characters; signs every POST |
| `CORS_ORIGINS` | `http://localhost:5173` | comma-separated origins allowed to call `/leads` |
| `PORT`, `LOG_LEVEL`, `NODE_ENV` | `4000`, `info`, `development` | optional |

The frontend has one variable, `VITE_API_URL` (default `http://localhost:4000`), baked in at build time.

---

## Running with Docker

The whole app (database, API, dashboard) with one command:

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Dashboard (nginx) | http://localhost:8080 |
| API | http://localhost:4000 |
| Postgres | localhost:5432 |

- The API container runs `prisma migrate deploy` on start, then the server. It waits for Postgres to
  be healthy first.
- Compose uses safe local defaults for every secret (the same values as `.env.example`), so no
  setup is needed. Override any of them from your shell, e.g. `META_APP_SECRET=… docker compose up`.
- Stop local `npm run dev` servers first: the containers use ports 4000 and 8080.
- For day-to-day development, run only the database: `docker compose up -d postgres`.

**Images:** both are multi-stage builds. The backend compiles TypeScript in a build stage and ships
only `dist/`, production dependencies and the migrations, running as the non-root `node` user. The
frontend builds with Vite and ships only the static files on nginx, with an SPA fallback so deep
links like `/leads/:id` work on refresh and long-lived caching for hashed assets.

---

## Sending webhooks

`npm run webhook:send` (in `backend/`) builds a Meta-shaped payload, **signs it exactly like Meta**
(HMAC-SHA256 of the raw body with `META_APP_SECRET`) and posts it. Lead details are generated from
the lead ID, so the same ID always produces the same lead.

```bash
npm run webhook:send                                        # 1 new lead
npm run webhook:send -- --count 5                           # a batch of 5 in one request
npm run webhook:send -- --id demo-1                         # created
npm run webhook:send -- --id demo-1                         # same delivery again → "unchanged"
npm run webhook:send -- --id demo-1 --phone +919812345678   # changed phone → "updated" + diff in the timeline
```

It reads `META_APP_SECRET` from `backend/.env` and targets `http://localhost:4000` by default.

### Against the deployed API

The same script sends to any URL with `--url`. The deployed API has its own `META_APP_SECRET`.
**The demo secret is included in the submission email.** It is kept out of this public repo on
purpose. A value set on the command line takes priority over `backend/.env`.

Copy-paste (needs Node 22+; no database or `.env` required):

```bash
git clone https://github.com/sahulhamid/stylework-lead-intake.git
cd stylework-lead-intake/backend
npm install

export META_APP_SECRET=<demo-secret>        # from the submission email
export LIVE=https://stylework-lead-intake.onrender.com/webhook/meta-lead

npm run webhook:send -- --url $LIVE                                        # 1 new lead
npm run webhook:send -- --url $LIVE --count 5                              # a batch of 5
npm run webhook:send -- --url $LIVE --id review-1                          # created
npm run webhook:send -- --url $LIVE --id review-1                          # again → "unchanged"
npm run webhook:send -- --url $LIVE --id review-1 --phone +919812345678    # → "updated" + diff
```

The first request can take up to a minute while the free-tier service wakes up.

Expected output: `POST https://…/webhook/meta-lead → 200 {"status":"received","created":1,…}`.
Refresh https://stylework-lead-intake-ui.onrender.com to see the new lead. Without the deployed
secret, the script signs with the local one from `.env` and the API rejects it with `401`
(which is the signature check working).

### With curl only

```bash
API=https://stylework-lead-intake.onrender.com      # or http://localhost:4000
SECRET=<demo-secret>                                # or local-dev-app-secret-change-me

BODY='{"object":"page","entry":[{"id":"page-1","time":1758700000,"changes":[{"field":"leadgen","value":{"leadgen_id":"curl-1","form_id":"coworking-enquiry","created_time":1758700000,"field_data":[{"name":"full_name","values":["Ravi Kumar"]},{"name":"email","values":["ravi@example.com"]},{"name":"phone_number","values":["+919811111111"]},{"name":"city","values":["Pune"]}]}}]}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')

curl -X POST "$API/webhook/meta-lead" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$BODY"
# → {"status":"received","created":1,"updated":0,"unchanged":0,"skipped":0}

# The same request again → "unchanged":1. Without the signature header → 401.
```

The subscription handshake Meta performs when the webhook is registered:

```bash
curl "$API/webhook/meta-lead?hub.mode=subscribe&hub.verify_token=<verify-token>&hub.challenge=12345"
# → 12345   (locally the token is local-verify-token; the deployed one is in the submission email)
```

---

## Testing

```bash
docker compose up -d postgres   # tests use a separate leads_test database
cd backend
npm test                        # 92 tests
npm run typecheck
```

- Tests never touch the development database: Vitest points `DATABASE_URL` at `leads_test`, applies
  migrations once before the run (`prisma migrate deploy`) and empties the tables before each test.
- `leads_test` is created by `docker/postgres/init/01-create-test-db.sql` on the first start of the
  Postgres volume. On an older volume create it once:
  `docker exec lead-intake-postgres psql -U leads -d leads -c "CREATE DATABASE leads_test;"`

| Suite | Tests | Covers |
|---|---|---|
| Unit: `signature` | 9 | valid/invalid signatures, tampering, re-serialized JSON, malformed headers |
| Unit: `lead-diff` | 8 | no-op re-delivery, field changes, empty values never erase, JSON key order, date comparison |
| Unit: `lead-data-provider` | 7 | mapping Meta's `field_data` to columns |
| Unit: `lead-status` | 27 | every allowed and forbidden transition (all 25 pairs) |
| Integration: webhook | 13 | handshake, create, idempotent re-delivery, update with diff, **10 concurrent deliveries → 1 lead**, batch with malformed items, 401, 400, the append-only trigger |
| Integration: leads | 14 | pagination with identical timestamps, filters, search, sort, detail, 404/400 |
| Integration: status | 11 | lifecycle, 422, 409 (stale, after a webhook update, and the atomic guard), concurrency |
| Integration: CORS | 3 | allowed origin, other origins, webhook not exposed to browsers |

The critical guards were **mutation-checked**: removing the signature check, the idempotency
branch, the pagination tie-breaker or the atomic version check makes the corresponding tests fail.

---

## Deployment

| Piece | Where |
|---|---|
| API | Render Web Service built from `backend/Dockerfile` (health check: `/health`) |
| Dashboard | Render Static Site: `npm ci && npm run build`, publish `dist`, rewrite `/*` → `/index.html` |
| Database | Neon (managed Postgres 17), same region as the API |

Secrets (`DATABASE_URL`, `META_VERIFY_TOKEN`, `META_APP_SECRET`, `CORS_ORIGINS`) live only in the
Render dashboard; nothing secret is in git or in the images. Migrations are applied automatically
when the API container starts. Render redeploys on every push to `main`.

---

## Scaling

The current design handles a single team comfortably. This is what would change as volume grows,
in the order I would do it, and why the existing code makes each step straightforward.

**1. Decouple webhook receipt from processing (first priority).**
Today leads are processed inside the webhook request. At high volume, the webhook should only
verify the signature, persist the raw event and return `200` in milliseconds; workers then process
events from a queue (SQS, Kafka or BullMQ on Redis).
- *Why it's easy here:* ingestion is already idempotent (unique `meta_lead_id` + `P2002` recovery +
  no-op diffs), so at-least-once delivery from a queue is safe without changing the logic.
- Add a `webhook_events` **inbox table** (raw body, received/processed timestamps, error) with a
  **dead-letter queue** and a **replay** tool. `raw_payload` is already stored per lead.
- The Graph API provider plugs into the existing `LeadDataProvider` interface, with retries,
  exponential backoff and a rate limiter (Meta's API has quotas).

**2. Run more API instances.**
The API is stateless (no sessions or in-memory state), so it scales horizontally behind a load
balancer with autoscaling on CPU and latency.
- Use a **connection pooler** for the app (Neon's pooled URL / PgBouncer) and a **direct**
  connection only for migrations: Prisma's migration lock doesn't work through a transaction-mode
  pooler (we hit exactly this during deployment).
- Run migrations as a **one-off release job**, not on every container start, so ten instances don't
  race to migrate. This also removes the Prisma CLI from the runtime image (see trade-offs).

**3. Keep reads fast as the table grows.**
- Search uses `ILIKE '%…%'`, which scans the table. Add a **`pg_trgm` trigram index** on name,
  email and phone (or move search to OpenSearch at very large volume).
- Replace `OFFSET` pagination with **keyset (cursor) pagination**:
  `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC`. The `id` tie-breaker
  already in place makes this a small change.
- Add **composite indexes** for the most common filter + sort pairs (for example
  `(status, created_at)`), guided by `EXPLAIN ANALYZE` on real traffic.
- Add **read replicas** for the dashboard's list and detail reads; writes stay on the primary.

**4. Manage audit-trail growth.**
`lead_activities` only ever grows. **Partition it by month** (native Postgres partitioning) so
recent data stays hot and old partitions can be archived to cheaper storage under a retention policy.
The `(lead_id, created_at)` index keeps timelines fast in the meantime.

**5. Concurrency already scales.**
Optimistic locking holds no locks while people look at a lead, so it scales with the size of the
sales team; conflicts surface as a clear `409` instead of lost updates.

**6. Frontend.**
The dashboard is static files on a CDN. TanStack Query caching already reduces API load; for live
updates, replace refetch-on-focus with **server-sent events or WebSockets** pushing new leads.

**7. Operations.**
Ship the JSON logs to a log platform (the request ID already correlates every line of a request),
add metrics (ingestion rate, 4xx/5xx, p95 latency, queue depth) and alerts. For example, a spike of
`401`s on the webhook means Meta's app secret was rotated without updating ours.

---

## Trade-offs and decisions

| Decision | Why | Cost / what production would do |
|---|---|---|
| **No authentication** | Not in the brief; a rushed auth system is a security risk and slows reviewers down | `/leads` is open on the demo (demo data only). Production: SSO or JWT, a `requireAuth` middleware on the `/leads` router, and the authenticated user ID as the activity actor. The webhook is already protected by Meta's signature. |
| **Fixed actors** (`system:meta-webhook`, `dashboard`) | Without auth the server can't know who clicked, and a client-sent name would be unverified | The audit trail records *where* a change came from, not *who*. Becomes the user ID once auth exists. |
| **Inline `field_data` instead of the Graph API** | Lets the system be tested end to end without a Meta app | Behind the `LeadDataProvider` interface; production swaps in a Graph API provider. |
| **Synchronous processing in the webhook request** | Simple, and fast enough for this volume | First thing to change at scale (queue + workers, above). |
| **`raw_payload` stored per lead** | Debugging, support and replay | PII lives in two places; a data-deletion request (GDPR/DPDP) must clear both the columns and `raw_payload`. Only the latest payload is kept (earlier values survive as diffs). |
| **Migrations run on container start** | Zero manual steps on deploy | Needs the Prisma CLI in the runtime image, making it ~700 MB, and brings its transitive dependencies. `npm audit` reports 4 high findings, all inside the Prisma CLI (`mysql2`, `deepmerge-ts`), code our app never executes. Production: a separate migration job, a runtime image without the CLI. |
| **Direct DB connection** | Prisma migrations need session-level advisory locks, which break through a transaction-mode pooler | Fine at this scale; at scale, pooled URL for the app and direct URL for migrations. |
| **`OFFSET` pagination, `ILIKE` search** | Simple and correct for thousands of leads | Keyset pagination and trigram indexes at scale (above). |
| **Reads call the repository directly** | No business rules to put in a service | Ingestion's find/create/diff logic still lives in the webhook module; moving it into `leads.service` would finish the adapter/domain split. |
| **Free-tier hosting** | Zero cost for a demo | Cold starts after idle time; paid instances stay warm. |
| **Tests focus on the backend** | The backend holds the business rules and concurrency guarantees | No frontend tests and no CI pipeline yet. |

---

## Future improvements

- Authentication and role-based access; the audit actor becomes the signed-in user
- Real Meta Graph API integration behind `LeadDataProvider`
- Queue-based ingestion with an inbox table, dead-letter queue and replay
- CI pipeline (typecheck, tests against Postgres, frontend build) on every push
- Frontend component tests (status control, 409 handling)
- Handoff to the booking system when a lead is CONVERTED; notifications for new leads
- Required reason when marking a lead LOST, and loss-reason reporting
- Rate limiting on the public API
- Move ingestion's create/update logic into `leads.service`

---

## Project structure

```
backend/
  src/
    config/env.ts            environment validation (fails fast)
    lib/                     prisma client, logger, error classes, validation helper
    middleware/              request id, http logger, 404, central error handler
    modules/
      webhook/               signature, schemas, handshake + receive, ingestion, data provider
      leads/                 routes, controller, service, repository, schemas, state machine, diff
    app.ts / server.ts       app wiring (no listen) / server start + graceful shutdown
  prisma/                    schema + migrations (incl. the append-only trigger)
  tests/unit, tests/integration
  scripts/send-test-lead.ts  signed webhook sender
  Dockerfile
frontend/
  src/
    api/                     fetch wrapper (typed ApiError) + lead endpoints
    hooks/                   TanStack Query hooks and cache keys
    components/              table, badge, pagination, timeline, status control
    pages/                   lead list, lead detail
  Dockerfile, nginx.conf
docker/postgres/init/        creates the leads_test database
docker-compose.yml           postgres + api + web
```

---

## AI usage

This project was built with an AI coding assistant. See [AGENT.md](AGENT.md) for the tools used,
key prompts, what was generated versus reviewed, and where I overrode the AI's suggestions.
