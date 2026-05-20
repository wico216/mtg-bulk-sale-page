# Stack Research — v1.4 Import UX & Price Refresh

**Domain:** Next.js 16 App Router + Neon HTTP + Drizzle, hosted on Vercel Hobby
**Researched:** 2026-05-20
**Confidence:** HIGH (Vercel docs verified against current canonical URLs; existing surfaces verified by reading `src/lib/scryfall.ts`, `src/db/schema.ts`, `src/app/admin/import/_components/binder-picker.tsx`, `package.json`)

## TL;DR

**This milestone needs ZERO new runtime dependencies, ZERO new dev dependencies, and ZERO schema changes.** The only additions are:

1. A new `vercel.json` at repo root (file does not currently exist).
2. A new `CRON_SECRET` env var (generated locally, added to Vercel project env + `.env.local`).
3. A correction to the milestone bootstrap note: **Hobby allows 100 cron jobs per project** (not 2); the constraint that matters is the **once-per-day execution cap** and **±59 min scheduling precision**.

Everything else — Scryfall batch fetcher, `admin_audit_log` table, `/admin/health` endpoint, `requireAdmin()` middleware, rate limiter, structured logger, and the binder picker component — is already shipped and used as-is.

## Recommended Stack

### Core Technologies (already shipped — no changes)

| Technology              | Version (from `package.json`) | Purpose                                              | Why It Stays |
|-------------------------|-------------------------------|------------------------------------------------------|--------------|
| `next`                  | `16.2.2`                      | App Router; route handlers for cron endpoint         | Already the runtime; cron endpoint is just another route handler at `app/api/cron/refresh-prices/route.ts`. Note: AGENTS.md warns this Next.js is **not** training-data Next.js — verify route handler syntax in `node_modules/next/dist/docs/` before authoring the endpoint. |
| `react`                 | `19.2.4`                      | Binder picker UX (Select All / Deselect All buttons) | Picker is already a client component (`"use client"`); just adds two buttons + a default-off effect. Local `useState`/parent-controlled `selection` map already in place. |
| `drizzle-orm`           | `^0.45.2`                     | UPDATE `cards.price` rows + INSERT one `admin_audit_log` row per run | Already used everywhere; no new query patterns needed. Bulk price update is a per-row UPDATE (or `CASE WHEN` batch) using the existing Neon HTTP driver. |
| `@neondatabase/serverless` | `^1.0.2`                   | Postgres HTTP driver under Drizzle                   | Same constraint as v1.3 — **no interactive transactions on neon-http**. The price refresh must be designed as either (a) per-card autocommitted UPDATEs, or (b) a single CTE/batched UPDATE statement. **Not** a `BEGIN; UPDATE...; COMMIT;` sequence. |
| Existing Scryfall fetcher (`src/lib/scryfall.ts`) | shipped v1.3.1/v1.3.2 | `fetchCardsByScryfallIds(ids)` batch fetch with rate-limit gate | Already serializes ≤4 req/sec via `acquireGate()`; already handles 429+5xx with exponential backoff; already caches by `id-${scryfallId}`. The cron job is a **caller** of this function, not a re-implementer. |

### New Infrastructure Surface

| Surface              | Configuration               | Purpose                                                                                       |
|----------------------|-----------------------------|-----------------------------------------------------------------------------------------------|
| `vercel.json` (NEW)  | `crons[]` array + `$schema` | Declares the daily cron schedule and target path. File does not currently exist in repo.      |
| `CRON_SECRET` (NEW)  | Random ≥16-char string      | Vercel auto-sends as `Authorization: Bearer ${CRON_SECRET}`; route handler verifies equality. |
| `maxDuration` export | `300` (Hobby maximum)       | Set on the cron route handler so a slow cold-cache run (≈26s ideal, can be longer under 429 backoff) doesn't hit the default cap. Hobby default = max = 300s. |

### Supporting Libraries

**No new supporting libraries.** The following common-but-tempting additions are explicitly NOT needed:

| Library                       | Status     | Why NOT |
|-------------------------------|------------|---------|
| `node-cron` / `croner`        | DO NOT ADD | Vercel Cron is the scheduler; no in-process cron daemon needed. |
| `bullmq` / `bee-queue`        | DO NOT ADD | Single daily job on a small inventory; no queue/worker infra justified. |
| `@upstash/redis`              | DO NOT ADD | No distributed-lock need at this scale (1 admin, daily job, idempotent UPDATEs). If concurrency ever becomes a real concern, a Postgres advisory lock through the existing Neon connection is the cheaper next step. |
| `zod` / `valibot`             | DO NOT ADD | Cron endpoint accepts no body. The `Authorization` header comparison is a single string equality. |
| New cron-validation lib       | DO NOT ADD | One schedule, hand-validated against crontab.guru once. |
| New audit-log abstraction     | DO NOT ADD | `admin_audit_log` table is already in `src/db/schema.ts` (lines 88–110) — INSERT one row directly. |
| New retry/backoff lib (`p-retry`, `async-retry`) | DO NOT ADD | The Scryfall fetcher (`src/lib/scryfall.ts` lines 43–88 and 139–197) already implements exponential backoff with Retry-After honoring. |
| New "manual trigger" framework (e.g. `react-query` mutation libs beyond what's there) | DO NOT ADD | Manual "Refresh now" button is a plain `<form action={serverAction}>` or a `fetch('/api/admin/refresh-prices', { method: 'POST' })` — no new client state library. |

### Development Tools

| Tool                  | Purpose                                     | Notes                                                              |
|-----------------------|---------------------------------------------|--------------------------------------------------------------------|
| `crontab.guru`        | Validate the cron expression                | Web tool; no install. Recommended schedule: `0 4 * * *` (04:00–04:59 UTC). |
| Manual local testing  | Hit the route with the bearer token by hand | `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh-prices`. **Vercel cron does NOT run under `next dev`** — see Local-Dev Story below. |

## Installation

```bash
# Runtime dependencies: NONE
# Dev dependencies:     NONE
# Schema changes:       NONE
# Migration scripts:    NONE
```

**The only file-system additions are:**

1. `vercel.json` at repo root (new file).
2. A line in `.env.local` for `CRON_SECRET`.
3. A new route handler (e.g. `src/app/api/cron/refresh-prices/route.ts`).
4. A new admin-triggered handler (e.g. `src/app/api/admin/refresh-prices/route.ts`).
5. Diff to `src/app/admin/import/_components/binder-picker.tsx` to add Select All / Deselect All buttons (no new file).
6. Diff to the picker's parent (`src/app/admin/import/_components/import-client.tsx`) to default `selection = {}` on open (no new file).
7. Diff to `/admin/health` endpoint to read and expose `lastPriceRefreshAt` (looked up from `admin_audit_log` via `MAX(created_at) WHERE action = '<refresh-action-name>'`).

## Vercel Cron Configuration — Verified Schema (2026)

### `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/refresh-prices",
      "schedule": "0 4 * * *"
    }
  ]
}
```

Notes:
- `path` MUST start with `/` and target a production deployment route.
- `schedule` uses standard 5-field cron in UTC. **Vercel does NOT support `MON`/`SUN`/`JAN` aliases**; numeric only.
- You cannot set both day-of-month and day-of-week (one must be `*`).

### Hobby Plan Limits (verified at vercel.com/docs/cron-jobs/usage-and-pricing, last_updated 2026-03-04)

| Constraint                    | Hobby Value                              | Implication for v1.4                                                                                                          |
|-------------------------------|------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| Number of cron jobs / project | **100** (not 2 — milestone note is stale) | Plenty of headroom. We use 1.                                                                                                  |
| Minimum interval              | **Once per day**                         | `0 4 * * *` is valid. Anything more frequent (e.g. `*/30 * * * *`, `0 * * * *`) **fails at deployment** with an explicit error. |
| Scheduling precision          | **Hourly (±59 min)**                     | `0 4 * * *` may actually fire anywhere in `04:00:00`–`04:59:59` UTC. Acceptable for a price-refresh job. |
| Function max duration         | **300s default = max**                   | Set `export const maxDuration = 300;` on the cron route handler. Cold-cache 7,700-card refresh ≈26s ideal but headroom for 429 backoff is wise. |
| Function invocation method    | GET (only)                               | The cron route handler MUST export `GET`. The manual "Refresh now" admin route is a separate handler and can be POST. |
| User-Agent on cron requests   | `vercel-cron/1.0`                        | Optional belt-and-suspenders check; bearer-token check is the load-bearing guard. |
| Cron in preview deployments   | **No** — production only                 | Confirms why local-dev story is "call the route by hand." |
| Retry on failure              | **No** — Vercel does not retry          | Design the job as resumable / idempotent. Per-card UPDATE-if-changed is naturally idempotent. |

### Authentication Pattern (verified at vercel.com/docs/cron-jobs/manage-cron-jobs)

Vercel sends the `CRON_SECRET` env var as a literal `Authorization: Bearer ${CRON_SECRET}` header. The endpoint compares:

```ts
// src/app/api/cron/refresh-prices/route.ts
import type { NextRequest } from "next/server";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ... call existing fetchCardsByScryfallIds(), UPDATE cards.price, INSERT admin_audit_log row.
}
```

**Generate the secret** (recommend ≥32 chars; Vercel docs minimum is 16):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Then set it in:
- Vercel dashboard → Project → Settings → Environment Variables → `CRON_SECRET` (Production, Preview, Development scopes — at minimum Production).
- `.env.local` for parity when manually invoking locally.

### Local-Dev Story (verified — explicit non-support)

From vercel.com/docs/cron-jobs/manage-cron-jobs (last_updated 2026-02-27):

> "There is currently no support for `vercel dev`, `next dev`, or other framework-native local development servers."

**The supported local workflow is:**

```bash
# 1. Run dev server as normal.
npm run dev

# 2. In another shell, simulate Vercel's cron invocation by hand.
curl -i -X GET \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/refresh-prices
```

This matches the existing local-dev pattern for `/admin/health` and the import endpoint — no schedule daemon, just a hand-rolled HTTP request when you want to exercise the code path.

## Manual "Refresh now" Button — Stack Decision

The escape-hatch admin button is **structurally distinct** from the cron endpoint:

| Concern                | Cron endpoint                                    | Manual admin endpoint                                              |
|------------------------|--------------------------------------------------|---------------------------------------------------------------------|
| Path                   | `/api/cron/refresh-prices`                       | `/api/admin/refresh-prices` (suggested)                             |
| Method                 | GET (Vercel hard requirement)                    | POST (CSRF-friendly, matches existing admin mutation routes)        |
| Auth                   | `Authorization: Bearer ${CRON_SECRET}`           | `requireAdmin()` (existing middleware) + ADMIN_BULK rate-limit      |
| Rate limit             | None (Vercel-only caller)                        | `ADMIN_BULK` bucket (existing in `src/lib/rate-limit.ts`)           |
| Shared business logic  | A single internal function `refreshAllPrices()` invoked by both routes | Same                                                                |

**Stack rationale:** keep the route handlers thin; both call into a single `refreshAllPrices()` core. No new stack needed — `requireAdmin()`, the rate limiter, and the structured logger are all already in `src/lib/`.

## Binder Picker UX — Stack Decision

**No stack change needed.** The existing picker at `src/app/admin/import/_components/binder-picker.tsx`:

- Is already a `"use client"` React 19 component.
- Already receives `selection: Record<string, boolean>` from the parent as controlled state and calls `onToggle(name, checked)` to mutate.
- Adding **Select All** and **Deselect All** buttons is a pure component-internal diff: two `<button>` elements in the header that call `onToggle(name, true)` / `onToggle(name, false)` for every binder in `binders`.
- "All deselected on open" is a parent-state default: the parent (`import-client.tsx`) currently initializes `selection` from `knownBinderNames`. The diff is to initialize `selection = {}` (or `{ [each]: false }`) instead.

| Question                                          | Answer                                                                                          |
|---------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Need a new state library (Zustand/Redux/Jotai)?  | **NO.** Already controlled state in the parent. Local `useState` in the parent is sufficient.  |
| Need a new UI primitives library (Radix/shadcn)? | **NO.** Existing Tailwind + native `<input type="checkbox">` already used; matches v1.3 visual language. |
| Need a new form library?                          | **NO.** No form submission; selection is held in memory and POSTed as part of the import commit. |

## Schema — Confirmed No Change

Reviewing `src/db/schema.ts`:

- `cards.price` is `integer("price")` nullable, stored as cents. (Line 43.) **The cron job updates this column in place.** No `card_price_history` table is needed — operator's stated decision ("all cards, no history") is the right call for a single-admin friend-store scale.
- `admin_audit_log` (lines 88–110) already has `action TEXT`, `actorEmail TEXT` (nullable — good fit for cron-with-no-user), `targetType TEXT`, `targetCount INTEGER`, `metadata JSONB` — exactly the columns we need. The price-refresh row writes something like `{ action: 'price_refresh', actorEmail: null, targetType: 'cards', targetCount: <updated>, metadata: { updated, unchanged, failed, durationMs, source: 'cron' | 'manual' } }`.

**No migration, no `npm run migrate:*` script needed for v1.4.**

`lastPriceRefreshAt` on `/admin/health` is **computed from `admin_audit_log`** at request time:

```sql
SELECT MAX(created_at) FROM admin_audit_log WHERE action = 'price_refresh'
```

No new column anywhere.

## Alternatives Considered

| Recommended                                              | Alternative                                          | When to Use Alternative                                                                                                              |
|----------------------------------------------------------|------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| Vercel Cron (declarative `vercel.json`)                  | GitHub Actions scheduled workflow hitting prod URL  | If we ever needed to leave the Vercel ecosystem, or wanted >Hobby precision without paying for Pro. Not justified at current scale.  |
| `CRON_SECRET` bearer-token auth                          | IP allowlist of Vercel infra                         | Vercel does not publish stable cron-source IPs; bearer is the documented mechanism.                                                  |
| Single `admin_audit_log` row with counts in `metadata`   | Separate `price_refresh_runs` table                  | If we ever wanted to chart history or rate-limit refreshes by counting recent runs. For "show lastPriceRefreshAt and nothing more," the audit-log row is enough. |
| Update `cards.price` in place                            | Append-only `card_price_history` table               | If operator ever wants "what did Lightning Bolt cost on 2026-04-15?" — defer until requested. Storage cost would be ~7,700 rows/day = ~2.8M rows/year. |
| Local React state for Select All / Deselect All          | URL state via `nuqs` / search params                 | If we wanted the binder selection to survive page reload. Operator's stated design is "all-deselected default" — survival is anti-goal. |
| `export const maxDuration = 300` on the cron route       | Streaming response to extend wall-time               | If the job ever exceeded 5 min. Current cold-cache estimate is ~26s. We have 11× headroom. |

## What NOT to Use

| Avoid                                              | Why                                                                                                          | Use Instead                                                                          |
|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| `node-cron`, `croner`, `agenda`                    | These need a long-lived process. Vercel serverless functions are not long-lived.                             | Vercel Cron declared in `vercel.json`.                                               |
| In-process `setInterval` / `setTimeout` for scheduling | Same problem — function instances die between invocations.                                              | Vercel Cron.                                                                          |
| `@vercel/cron` npm package                         | There is no such first-party package; cron is configured declaratively. Avoid lookalikes.                    | `vercel.json` `crons[]`.                                                              |
| Edge runtime for the cron handler                  | Cron jobs run on Node functions; the job needs the Neon HTTP driver and the existing `src/lib/scryfall.ts` (both Node-compatible without edge-specific shims). | Node runtime (Next.js default for route handlers). |
| `pg-cron` Postgres extension                       | Neon serverless does not support `pg_cron` on Hobby tier; would also bind scheduling to the DB and bypass the existing fetcher. | Vercel Cron + the existing Node-side fetcher.                                        |
| New `card_price_history` table                     | Operator explicitly chose "all cards, no history." Storage + write amplification for unused query patterns. | Update `cards.price` in place; `admin_audit_log` keeps the run-level record.         |
| Optimistic UI library for the manual "Refresh now" button | Single-admin tool; a plain spinner + a page refresh after the POST is enough. Adds dependency for no real UX win. | Local `useState` + the existing Tailwind spinner/disabled-state pattern.            |
| Splitting the Scryfall refetch into a queue       | At ~7,700 cards × 75/batch × 4 concurrent = ~26 batches = ~26s wall-time, this fits in a single function invocation with 10× headroom. | Single in-function loop using the existing `fetchCardsByScryfallIds()`. |
| New env-var validation library (`@t3-oss/env-nextjs` etc.) | `CRON_SECRET` is one string. The route handler's `if (!cronSecret) return 401` is the check. | Inline check; existing `/admin/health` already reports `CRON_SECRET` as `"configured"`/`"missing"` if we add it to the STATUS_LABELS lookup. |

## Stack Patterns by Variant

**If the cron run consistently approaches `maxDuration`:**
- First, lower `COLLECTION_CONCURRENCY` is the WRONG move (it'd make things slower).
- Instead, partition by `setCode` and add a second daily cron at a different hour. Hobby allows 100 cron jobs, so we have room.
- Only at that point would a queue (Postgres-backed `pgmq`, or a `tasks` table) become justified.

**If we ever need sub-day refresh granularity:**
- Hobby blocks this at deploy time. Pro plan unlocks per-minute precision.
- Don't try to work around this with overlapping daily crons or in-process loops.

**If Scryfall starts 429ing the daily run consistently:**
- Lower `COLLECTION_CONCURRENCY` from 4 to 2.
- The existing `acquireGate()` already serializes; the only knob is concurrency-of-waves.

## Version Compatibility

| Package A                                | Compatible With                          | Notes                                                                                                  |
|------------------------------------------|------------------------------------------|--------------------------------------------------------------------------------------------------------|
| `next@16.2.2`                            | Vercel Cron (current)                    | Route handlers in `app/api/**/route.ts` with `maxDuration` export — verified pattern.                  |
| `vercel.json` `crons[]`                  | `next@13.5+`                             | Documented since 2024; current schema unchanged through May 2026.                                       |
| `@neondatabase/serverless@^1.0.2`        | Node runtime (cron) + Edge (storefront) | The cron route stays on Node. `neon-http` has no interactive transactions — already a v1.3 constraint, doesn't change. |
| `drizzle-orm@^0.45.2`                    | Both runtimes                            | No new patterns needed; bulk UPDATE via `db.update(cards).set({ price }).where(eq(cards.id, id))` per row, or a single CASE-WHEN update built dynamically. |

## Sources

- https://vercel.com/docs/cron-jobs — `vercel.json` `crons[]` schema, cron expression rules, UTC-only constraint (last_updated 2025-06-25). HIGH confidence.
- https://vercel.com/docs/cron-jobs/usage-and-pricing — Hobby = **100 crons/project**, **once-per-day minimum interval**, **±59 min precision** (last_updated 2026-03-04). HIGH confidence. **This corrects the milestone-context claim of "2 daily crons" — the current limit is 100.**
- https://vercel.com/docs/cron-jobs/manage-cron-jobs — `CRON_SECRET` + `Authorization: Bearer` pattern, App Router code sample, **no support for `vercel dev`/`next dev`**, no retry on failure, GET method requirement (last_updated 2026-02-27). HIGH confidence.
- https://vercel.com/docs/cron-jobs/quickstart — End-to-end `vercel.json` + route handler example; cron only runs on **production** deployments, not previews (last_updated 2026-03-17). HIGH confidence.
- https://vercel.com/docs/functions/configuring-functions/duration — Hobby `maxDuration` default = max = **300s** with fluid compute; `export const maxDuration = N` syntax for Next.js ≥13.5 (last_updated 2026-02-27). HIGH confidence.
- `package.json` at repo root — current dependency versions. HIGH confidence (read directly).
- `src/db/schema.ts` lines 32–110 — confirms `cards.price integer` nullable and `admin_audit_log` shape. HIGH confidence (read directly).
- `src/lib/scryfall.ts` lines 93–279 — confirms `fetchCardsByScryfallIds()` is the existing batched entrypoint with 429 backoff, in-memory cache, and the v1.3.2 gate-chain serializer. HIGH confidence (read directly).
- `src/app/admin/import/_components/binder-picker.tsx` — confirms picker is controlled, client-side, no new state library needed. HIGH confidence (read directly).

---
*Stack research for: v1.4 Import UX & Price Refresh*
*Researched: 2026-05-20*
