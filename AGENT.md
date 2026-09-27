# AGENT.md: How AI was used

## Tools

| Tool | Used for |
|---|---|
| **Claude Code** (Claude Opus 5.5, VS Code extension) | Design review, proposing code file by file, explaining concepts, running trial checks in scratch copies, debugging deployment |

No code was generated in bulk. Every file was proposed, explained and approved before it was written.

## How I worked with the AI

- **A written brief first.** Before any code, I wrote the design myself in a local `CLAUDE.md`:
  stack, layering, data model, state machine, endpoints and working rules. The AI loaded it every
  session, so decisions stayed consistent across 5 days.
- **Per-file approval.** For every file or function, the AI showed the code and explained it. It
  wrote the file only after I approved. I rejected the first attempt to scaffold several files at
  once and kept this rule for the whole project.
- **I stayed in control of the environment.** I installed every package, ran every migration,
  commit and push, and configured Render and Neon myself.
- **Understanding before committing.** I asked for line-by-line walkthroughs of anything I could
  not defend yet (error-class inheritance, Express 5 async errors, HMAC over raw bytes, atomic
  optimistic locking, TanStack Query caching, `useRef` timers, Docker stages). I kept private
  notes with every question and answer.

## Key prompts (curated)

1. *"Go through the assignment PDF and my CLAUDE.md plan."* This design review found real gaps:
   a race on concurrent duplicate webhooks (fixed with the UNIQUE constraint + `P2002` fallback),
   multi-lead batches, a missing `meta_created_at`, a read-then-compare version check (fixed with
   an atomic `updateMany`), raw-body capture for the HMAC, and a DB-level append-only trigger.
2. *"The actor field: with no auth, who is the actor?"* I challenged the AI's `X-Actor`
   header idea. A client-sent name is an unverified identity, so the actor is now a fixed value
   (`system:meta-webhook` / `dashboard`).
3. *"What happens if A sets CONTACTED and B sets LOST at the same time? Show me the atomic
   check."* This led to a deterministic test of the database-level guard.
4. *"How did you test that? Did the test pass for the right reason?"* Mutation checks (removing
   the code a test protects, then confirming the test fails) found two tests that passed for the
   wrong reason. Both were rewritten.
5. *"Before commit I want to test manually: the whole cycle."* Manual end-to-end checks
   (signed webhook → DB rows → logs → dashboard) before each commit.

## What the AI generated vs. what I did

| Area | Who |
|---|---|
| Product and architecture decisions (REST, Express over NestJS, Postgres + Prisma, monorepo, two tables: current state + append-only history, `meta_lead_id` UNIQUE, `version` column, state machine rules, one transaction per write) | **Me**, in CLAUDE.md before any code |
| Backend code: config, logging, errors, webhook, ingestion, leads API | AI-proposed, **reviewed and approved by me line by line** |
| Security- and correctness-critical code: `verifySignature`, idempotent ingestion, `canTransition`, the transactional status update | AI-written, **reviewed line by line by me** (I first planned to write these by hand and changed that to a review for time; I can explain every line) |
| Prisma schema details (UUID v7, `Timestamptz`, `onDelete: Restrict`, trigger SQL) | AI-proposed; **I questioned each and approved** |
| Tests (92 unit + integration) | AI-written; the test cases came from my questions; **mutation-checked** |
| Frontend (React, TanStack Query, Tailwind) | AI-written; **UX decisions mine** (see below) |
| Dockerfiles, compose, Render/Neon setup | AI-proposed files; **deployment done by me** |
| README | AI-drafted from my outline; **edited by me** |

## Where I overrode or changed the AI

- **Workflow:** rejected batch generation → one file at a time with approval.
- **Actor:** rejected the `X-Actor` header → fixed actor values (no fake identities without auth).
- **Tooling:** TypeScript 7 → 5.9 for stability; removed `dotenv` (Node 22 loads `.env`);
  pinned `@types/node` to 22 to match the runtime; pinned Prisma to 7.10 (npm "latest" was an
  8.0 release candidate).
- **Compose:** kept the Postgres init-folder mount the AI suggested removing (later used for the
  test DB).
- **Webhook security:** kept the HMAC signature and the GET handshake although the assignment does
  not require them, and added a signed test-lead script so reviewers are not blocked by a `401`.
- **Dashboard UX:** instead of making the whole row clickable, an eye icon on hover + the name as
  a link; the name kept black; 15 leads per page; a delivery-tracker style activity timeline
  (coloured dots: green converted, grey lost); kept the actor label "Dashboard" after
  considering User/Admin/Team.
- **Secrets:** refused to put the live `META_APP_SECRET` in the public README; it is shared with
  the submission only.
- **Wording:** changed "tamper-proof" to "append-only": the trigger stops application-level
  changes, but a DB admin could still bypass it.
- **Scope:** decided not to add CI or auth within the deadline (documented as trade-offs).

## Where AI output was wrong and how it was caught

| Problem | Caught by |
|---|---|
| Pagination tie-breaker test passed even without the tie-breaker (Postgres returned insertion order) | Mutation check → rewritten with shuffled explicit IDs |
| "Concurrent" HTTP test never exercised the atomic `WHERE version` guard | Mutation check → added a direct stale-version test |
| Vitest `globalSetup` did not see `test.env`, so it would have migrated the **dev** DB | Trial run before approval → config merged explicitly |
| A debounced search *value* broke the browser Back button | Manual testing → replaced with a timer in `useRef` + URL as the source of truth |
| `CORS_ORIGINS` set to a guessed URL before the static site existed | Live browser error → set to the real `-ui` origin |
| Prisma migrations through Neon's **pooled** host hit an advisory-lock timeout (P1002) | Render logs → direct connection recommended for migrations |

## How I verified AI output

Typecheck + build before every commit (every commit builds) · 92 automated tests against a
separate `leads_test` database · mutation checks on the critical tests · manual end-to-end runs
with signed webhooks, `psql` inspection and log checks · live checks on Render.

## What I would do differently

Write the most critical functions (`verifySignature`, `canTransition`) by hand first and use the
AI as a reviewer, and set up CI on the first day.
