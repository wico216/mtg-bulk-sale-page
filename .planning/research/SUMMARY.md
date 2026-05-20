# Project Research Summary — v1.4 Import UX & Price Refresh

**Project:** Viki — MTG Bulk Store
**Milestone:** v1.4 Import UX & Price Refresh
**Domain:** Personal-scale e-commerce; Next.js 16 App Router + Neon (drizzle/neon-http) on Vercel Hobby
**Researched:** 2026-05-20
**Confidence:** HIGH

## Executive Summary

v1.4 is two small, fully-independent features bolted onto a mature v1.3 codebase:

1. Select All / Deselect All buttons on the existing binder picker, with a default-deselected initial state.
2. A daily Vercel Cron that refetches Scryfall prices, writes one `admin_audit_log` row per run, exposes `lastPriceRefreshAt` on `/admin/health`, and adds a manual "Refresh now" escape hatch.

Research across STACK, FEATURES, ARCHITECTURE, and PITFALLS converges on the same opinion: **zero new dependencies, zero schema changes, no migrations**. The only new artifacts are a root `vercel.json`, a `CRON_SECRET` env var, two new route handlers, one shared service (`src/lib/price-refresh.ts`), one client button component, and small diffs to the picker, the import-client parent, and the health snapshot.

The recommended approach is a **shared service called by two thin route handlers**: cron (`GET /api/cron/refresh-prices`, Bearer-token auth) and manual (`POST /api/admin/prices/refresh`, `requireAdmin()` + `ADMIN_BULK` rate-limit) both call `runPriceRefresh({ trigger, actorEmail? })`. The service reuses the v1.3.1-hardened `fetchCardsByScryfallIds()` batcher, computes price **per-row, per-finish** through the existing `getPrice(prices, finish)` ladder, and bulk-UPDATEs by the 5-segment composite `cards.id` (NEVER by `scryfall_id`). This last point is load-bearing: the v1.2 etched-mispricing bug would re-emerge if the refresh blindly UPDATE-by-scryfall_id.

The biggest risks are silent regressions, not novel engineering:
- (a) env-gated tests skipping in CI (the exact v1.3.5 hotfix failure mode) — must write a default-run, NOT env-gated handler test with `vi.stubEnv`
- (b) breaking the existing `defaultCheckedFor` memory contract in `binder-import-store.ts:53-58` without explicitly choosing a replacement policy
- (c) writing `price = NULL` for cards Scryfall returned as `not_found` — the refresh must SKIP, not overwrite

Vercel-side gotchas (Hobby once-per-day, ±59 min drift, no retries, may double-deliver events, 300s max duration) are well-documented and mitigated through idempotency. Operator's earlier mental model of "Hobby = 10s/60s timeout" is **outdated as of 2026** — Hobby with fluid compute is 300s default = max. There is 11× headroom for the ~26s cold-cache refresh.

## Key Findings

### Recommended Stack

Zero new runtime deps, zero dev deps, zero schema changes. Every infrastructure surface the spec needs — Scryfall batcher with 429 backoff, `admin_audit_log` table, `/admin/health` endpoint, `requireAdmin()` middleware, sliding-window rate limiter, structured logger, controlled binder-picker component — is already shipped from v1.2/v1.3 and used as-is.

**Core technologies (all already shipped):**
- `next@16.2.2` — Route handlers; `export const maxDuration = 300` per Vercel Hobby cap. AGENTS.md warns this is NOT training-data Next.js; verify route handler syntax in `node_modules/next/dist/docs/` before authoring.
- `react@19.2.4` — Binder picker is already a controlled `"use client"` component; Select/Deselect All is two `<button>` elements wired to existing `onToggle`/new `onBulkSet` callback.
- `drizzle-orm@^0.45.2` — Per-row UPDATE on `cards.id` (chunked 500/batch via `FROM (VALUES …)` join); single INSERT into `admin_audit_log` per run.
- `@neondatabase/serverless@^1.0.2` — Same constraint as v1.3: no interactive transactions on `neon-http`. Chunked autocommitted UPDATEs are the right shape.
- Existing `src/lib/scryfall.ts` — `fetchCardsByScryfallIds(ids)` is the reused entrypoint; gate at ~4 req/sec; exponential backoff with Retry-After already implemented.

**New infrastructure surface:**
- `vercel.json` at repo root (file does NOT currently exist; verified). `crons[]` array with `path: /api/cron/refresh-prices`, `schedule: 0 9 * * *` (or operator-chosen off-peak UTC hour).
- `CRON_SECRET` env var (≥32 chars, generated via `openssl rand -hex 32`). Vercel auto-injects as `Authorization: Bearer ${CRON_SECRET}`.
- `export const maxDuration = 300;` on the cron route.

**Stack corrections vs. milestone bootstrap notes:**
- Hobby allows **100 cron jobs/project** (not 2). Constraint that matters is **once-per-day** + **±59 min drift**.
- Hobby `maxDuration` is **300s** with fluid compute (not 10s/60s). Operator's timeout concern is unfounded; there's 11× headroom.

### Expected Features

**Must have (table stakes — all P1 for v1.4 launch):**
- Select All / Deselect All buttons on the binder picker — explicit opt-in affordance
- Default selection = all binders unchecked on every picker open
- Daily Vercel Cron at off-peak UTC (recommend `0 9 * * *`) refetching all card prices
- One `admin_audit_log` row per run: `{trigger, updated, unchanged, failed, durationMs}` in metadata
- `lastPriceRefreshAt` on `/admin/health` (computed via `MAX(created_at) FROM admin_audit_log WHERE action='price_refresh'`)
- Manual "Refresh now" admin button gated by `requireAdmin()` + `ADMIN_BULK` rate-limit (20/min, already shipped)
- Idempotency guard — Postgres advisory lock to absorb Vercel double-delivery + cron-vs-manual race
- Partial-failure tolerance — Scryfall 404s recorded in `failed` count; run continues; prices SKIPPED (never written to NULL)
- "X of Y selected" counter near the picker buttons; Continue button disabled when `selectedCount === 0`

**Should have (defer if Phase has no slack):**
- Staleness badge on `/admin/health` (yellow when `lastPriceRefreshAt > 36h` ago)
- 60s cooldown UI + "Refreshed Ns ago" text on the manual refresh button

**Defer (v1.4.x or never):**
- NDJSON streaming progress during manual refresh
- "Smart Select: NEW only" third button (NEW binders already sort to top with green pill in v1.3)
- Saved selection presets, multi-source pricing, automated repricing, real-time tickers, price-history graphs, per-card price-drop emails

**Explicit anti-features (do NOT build):**
- Real-time price tickers on storefront — Scryfall itself refreshes once/24h
- Multi-source pricing fallback — Scryfall is more reliable than operator's own deploys
- Automated repricing with margin rules — operator runs pass-through pricing
- Cron failure → Discord/email alerts — `/admin/health` is the surface; adding a vendor for one daily job is overengineered
- Keyboard shortcut `Cmd-A` / `Ctrl-A` — conflicts with browser native

### Architecture Approach

Two route handlers (cron + manual) are thin auth/rate-limit wrappers over **one** shared service `src/lib/price-refresh.ts` exporting `runPriceRefresh({ trigger, actorEmail? })`. The service performs five steps:

1. SELECT every `(id, scryfallId, finish, price)` tuple from `cards`
2. De-dup Scryfall IDs and call `fetchCardsByScryfallIds(uniqueIds)`
3. Compute `Math.round(getPrice(card.prices, row.finish) * 100)` **per row** because the same `scryfall_id` maps to N rows under the 5-segment PK with different finishes
4. Chunked bulk UPDATE by `cards.id` (500 rows/chunk via `FROM (VALUES …)` join)
5. Single INSERT into `admin_audit_log`

The health snapshot adds a fourth parallel `MAX(created_at) WHERE action='price_refresh'` to `getAdminHealthSnapshot()`.

**Major components:**

1. `src/lib/price-refresh.ts` (NEW) — Shared service, `"server-only"`, unit-testable against in-memory mocks; auth-agnostic.
2. `src/app/api/cron/refresh-prices/route.ts` (NEW) — `GET`, `runtime = "nodejs"`, `maxDuration = 300`; verifies `Authorization: Bearer ${CRON_SECRET}` with fail-CLOSED when env missing; returns 401 otherwise.
3. `src/app/api/admin/prices/refresh/route.ts` (NEW) — `POST`, mirrors `bulk-delete/route.ts` shape; `requireAdmin()` + `enforceRateLimit(ADMIN_BULK)` + same service call.
4. `src/app/admin/health/_components/refresh-prices-button.tsx` (NEW) — Client component POSTing to the manual route; `router.refresh()` on success.
5. `src/app/admin/import/_components/binder-picker.tsx` (MODIFY) — Add Select All / Deselect All buttons in `<header>` block (~lines 73-80) wired to a new `onBulkSet(names, checked)` callback prop. **Path correction: this file lives under `_components/`, NOT directly under `import/`.**
6. `src/app/admin/import/_components/import-client.tsx` (MODIFY, line ~246) — Replace `initialSelection[b.name] = defaultCheckedFor(b)` with the chosen v1.4 default policy.
7. `src/db/admin-health.ts` + `src/app/api/admin/health/route.ts` + `src/app/admin/health/page.tsx` — Add `lastPriceRefreshAt` field to interface, response, and 4th tile.
8. `src/lib/enrichment.ts` — Export the currently-file-private `getPrice(prices, finish)` ladder so the service has a single source of truth.

**Health page tile decision (OPEN — operator must resolve in requirements):** Replace the dead `notificationFailuresLast24h` placeholder tile with `lastPriceRefreshAt`, OR add a 5th tile (`lg:grid-cols-5`). Architecture research recommends **replace** since the notification-failures tile is logged in PROJECT.md as "⚠️ Revisit when log drain lands" and renders as a permanent "Unknown."

### Critical Pitfalls

1. **Env-gated test skipping in CI (HIGH — v1.3.5 repeat).** The Phase 18 → v1.3.5 hotfix happened because `orders.concurrent.test.ts` gates on `TEST_DATABASE_URL`, so it never ran in CI. The cron handler test MUST be a default-run unit test using `vi.stubEnv("CRON_SECRET", …)` + mocked Scryfall fetcher + mocked DB, with a file-header comment explicitly saying "NOT env-gated."

2. **Picker memory contract regression (HIGH).** `binder-import-store.ts:53-58` implements a non-obvious Phase 19 invariant: prior selection wins, NEW binders default ON, `unsorted` always OFF (D-08/D-09/D-10). Will-delete is default-CHECKED at `import-client.tsx:255-256` *because the memory exists*. A naive hard-reset to `{}` silently drops the memory feature, breaks NEW-binders-default-on, and inherits a now-stale will-delete-default-CHECKED premise. Requirements MUST pick one explicit option:
   - **(A — recommended by FEATURES)** Drop `defaultCheckedFor` memory entirely; Select All / Deselect All are the only affordances.
   - **(B)** Keep memory; default-checked behavior unchanged; Select/Deselect All purely additive.
   - **(C)** Memory persists as `lastSelection`, surfaced as a "last imported" badge on each binder row; picker opens all-unchecked regardless; operator clicks Select All to recover.

3. **Writing `price = NULL` for Scryfall `not_found` cards (HIGH).** Same bug class as Phase 17 etched mispricing. The naive `card.price = scryfallMap.get(id)?.prices.usd ?? null` loop will nuke previously-good prices for ~12 known etched/obscure cards every day. The refresh MUST: skip rows with no `scryfallId`; skip rows where `scryfallMap.get(id)` returns undefined (preserve prior price); only write `NULL` when Scryfall explicitly returned `prices.usd === null`. Audit metadata distinguishes `updated / unchanged / failed (Scryfall not_found) / skipped (no scryfall_id)`.

4. **Cron + Manual race → audit log liar (MEDIUM).** Vercel may deliver the same cron event twice; cron may also overlap a manual click. Mitigation: Postgres advisory lock via `pg_try_advisory_lock(hashtext('cron.refresh_prices'))` (non-blocking; bail with 409 if held).

5. **Price unit conversion (MEDIUM, easy to forget).** `cards.price` is `integer` storing **cents** (`schema.ts:43`, `seed.ts:26`, `queries.ts:858`; read paths divide by 100). Scryfall returns USD strings (`"1.27"`). MUST use `Math.round(parseFloat(usd) * 100)`.

6. **`CRON_SECRET` silently missing in Vercel env (MEDIUM).** Vercel cron dashboard reports HTTP-level success; a 401 looks identical to a 200 from above. Mitigation: extend `envChecks()` with `cronSecret: isPresent(process.env.CRON_SECRET) ? "configured" : "missing"` literal; flip top-level `ok` to false when missing. NEVER log the actual secret value.

7. **`next dev` runs no cron (MEDIUM).** Vercel docs explicit: no support for `vercel dev` / `next dev` for cron scheduling. Local workflow is hand-rolled `curl -H "Authorization: Bearer $CRON_SECRET"`. Phase VERIFICATION.md must require operator-verified live cron invocation post-deploy.

## Implications for Roadmap

The two features are **fully independent** (no shared files, no shared state, no shared types).

### Recommended: Phase 23 with two plans

#### Phase 23 — Plan 01: Daily Price Refresh

**Rationale:** Higher-risk, write-side feature; touches DB, external service (Scryfall), new env var, new infrastructure (`vercel.json`).

**Delivers:**
- `src/lib/price-refresh.ts` shared service (export `getPrice` from `enrichment.ts` first)
- `GET /api/cron/refresh-prices` route with Bearer-token auth + `maxDuration = 300`
- `POST /api/admin/prices/refresh` route mirroring `bulk-delete/route.ts` shape
- `vercel.json` at root with `crons[]` entry
- `lastPriceRefreshAt` in `getAdminHealthSnapshot()` + `/admin/health` JSON + 4th tile on `/admin/health` page
- `cronSecret` literal-only check in `envChecks()`
- `<RefreshPricesButton />` client component next to the new tile
- Postgres advisory lock single-flight
- Operator runbook update for `CRON_SECRET` setup + post-deploy live cron verification

**Risk level:** MEDIUM (write-side; first cron run hits production DB; needs explicit operator UAT post-deploy).

#### Phase 23 — Plan 02: Import Picker UX

**Rationale:** Pure UI; can land independently or interleave with Plan 01.

**Delivers:**
- Select All / Deselect All buttons in `binder-picker.tsx` header (`onBulkSet(names[], checked)` callback to avoid N renders)
- "X of Y selected" counter inline with the buttons
- `import-client.tsx:246` initial-selection diff per chosen Option A/B/C
- Empty-state helper text + disabled Continue button when `selectedCount === 0 && willDeleteCount === 0`
- Picker tests: fresh-operator (no localStorage) opens all-unchecked; tab-order assertion

**Risk level:** LOW (UI-only; existing test patterns extend cleanly).

### Open Decisions for Requirements

1. **Memory contract handling (Pitfall 3).** Pick A/B/C (recommend A — drop memory).
2. **Health tile placement.** Replace dead `notificationFailuresLast24h` placeholder OR add a 5th tile (recommend replace).
3. **Cron UTC hour.** Recommend `0 9 * * *` UTC (= 02:00 PT, 04:00 CT, 05:00 ET).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Vercel docs verified against current canonical URLs; on-disk files read directly. |
| Features | MEDIUM-HIGH | Bulk-action UX backed by PatternFly + Helios + NN/g + Eleken + eBay. Memory-contract option pick is operator preference. |
| Architecture | HIGH | All integration points verified against on-disk source; line-level pointers given for every modified file. |
| Pitfalls | HIGH | Every cited line read directly. v1.3.5 incident referenced from RETROSPECTIVE.md and pending todo. |

**Overall confidence:** HIGH

### Gaps to Address

- Open decision A (memory contract) — pick A/B/C in requirements.
- Open decision B (health tile placement) — pick replace-vs-add in requirements.
- Cron UTC hour — pin in requirements.
- Tier 2 live-DB integration test — opt-in/skip decision during planning.
- `CRON_SECRET` rotation policy — operator runbook doc.

## Sources

### Primary (HIGH confidence)
- Vercel Cron Jobs docs (cron schema, auth pattern, double-delivery, no retry, GET-only)
- Vercel Function Duration docs (Hobby = 300s default = max with fluid compute)
- Vercel Cron Usage and Pricing (Hobby = 100 crons/project, once-per-day min, ±59 min drift)
- Scryfall API docs (10 req/s, 30s 429 lockout, ~24h price refresh upstream)
- In-repo source files read directly 2026-05-20: `package.json`, `src/db/schema.ts`, `src/lib/scryfall.ts`, `src/lib/enrichment.ts`, `src/app/admin/import/_components/binder-picker.tsx`, `src/app/admin/import/_components/import-client.tsx`, `src/lib/store/binder-import-store.ts`, `src/db/admin-health.ts`, `src/app/api/admin/health/route.ts`, `src/app/admin/health/page.tsx`, `.planning/PROJECT.md`, `.planning/RETROSPECTIVE.md`, `.planning/todos/pending/01-phase-18-concurrent-proof.md`.

### Secondary (MEDIUM confidence — UX consensus)
- PatternFly Bulk selection; Helios Table multi-select; NN/g Checkboxes + Dangerous UX; GitLab Pajamas Destructive actions; Eleken Bulk action UX; eBay Playbook Bulk Editing.

---

*Synthesized 2026-05-20 by orchestrator from STACK / FEATURES / ARCHITECTURE / PITFALLS research files. Ready for requirements definition.*
