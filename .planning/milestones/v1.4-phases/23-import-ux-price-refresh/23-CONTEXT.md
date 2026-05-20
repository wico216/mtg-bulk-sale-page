# Phase 23: Import UX & Price Refresh - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator-trusted import workflow (explicit opt-in binder selection) and autonomous, observable price freshness (daily Scryfall refetch + manual escape hatch + `/admin/health` surface).

Two fully independent plans:
- **Plan 23-01 (Daily Price Refresh)** — write-side, MEDIUM risk; PRICE-REFRESH-01..11. Ships first because operator UAT happens against the deployed cron.
- **Plan 23-02 (Import Picker UX)** — UI-only, LOW risk; IMPORT-UX-01..05. Interleaves or follows.

</domain>

<decisions>
## Implementation Decisions

### Tier 2 live-DB testing (Plan 23-01)
- **D-01:** Plan 23-01 uses **Tier 1 only** — default-run unit tests with `vi.stubEnv("CRON_SECRET", …)` + mocked Scryfall fetcher + mocked DB. No `TEST_DATABASE_URL`-gated integration test for the cron handler or advisory lock. Rationale: avoids re-introducing the v1.3.5 silent-skip pattern (the Phase 18 concurrent-proof harness is still pending operator provisioning — adding another env-gated test would compound the same risk). Advisory-lock contention is verified via operator UAT against the deployed cron.

### CRON_SECRET runbook (Plan 23-01)
- **D-02:** Plan 23-01 SUMMARY contains **setup-only** runbook content: one-time `openssl rand -hex 32` generation, paste into Vercel env (Production + Preview), redeploy, then verify `cronSecret: "configured"` on `/admin/health`. No rotation policy or cadence. No separate ops doc.

### Manual refresh button UX (Plan 23-01)
- **D-03:** `<RefreshPricesButton />` uses **button-local state, no toast**:
  - While POST in flight → button shows `Refreshing…`, disabled.
  - On 200 → `router.refresh()` re-renders the tile with the new timestamp; button returns to `Refresh now`.
  - On 409 (advisory lock held) → inline error under the button: `Refresh in progress — try again in a moment` for ~5s, then reset.
  - On 5xx / network failure → inline error: `Refresh failed — check logs` for ~5s, then reset.
  - No new toast library / global notification system introduced.

### Audit metadata shape (Plan 23-01)
- **D-04:** Audit metadata stays **locked scalars only**: `{ trigger, updated, unchanged, failed, skipped, durationMs }`. No `failedSample[]`, no `errors[]` array. Per-card failure detail flows through structured logs (Phase 15 logger), not audit metadata. Preserves the Phase 14 "safe and bounded" invariant with maximum headroom under the 4KB cap.

### Carried forward from milestone bootstrap (already locked — restated for downstream agents)
- **D-05:** Drop `defaultCheckedFor` memory entirely (Option A from PITFALLS Pitfall 3). Picker opens all-unchecked every session. Select All is the recovery affordance. Will-delete amber panel default-CHECKED behavior is unaffected.
- **D-06:** Replace dead `notificationFailuresLast24h` tile on `/admin/health` with `lastPriceRefreshAt`. Grid stays `lg:grid-cols-4`. PROJECT.md "⚠️ Revisit when log drain lands" row is obsoleted.
- **D-07:** Cron schedule `0 9 * * *` UTC daily (= 02:00 PT / 04:00 CT / 05:00 ET — off-peak globally, before operator's morning admin work).
- **D-08:** Idempotency via Postgres advisory lock — `pg_try_advisory_lock(hashtext('cron.refresh_prices'))`, non-blocking, auto-released on connection close. Second caller (cron-vs-manual or Vercel double-delivery) returns HTTP 409.
- **D-09:** Bulk UPDATE by 5-segment `cards.id` (composite PK), NEVER by `scryfall_id`. Per-row `getPrice(prices, finish)` ladder applied. Avoids re-introducing v1.2 etched-mispricing bug (fixed in Phase 17 FIN-01).
- **D-10:** Never overwrite `cards.price` with NULL when Scryfall returns `not_found`. Rows with no `scryfallId` are skipped entirely. Only write `NULL` when Scryfall explicitly returns `prices.usd === null`. Audit counts distinguish `updated / unchanged / failed (not_found) / skipped (no scryfallId)`.
- **D-11:** Cron handler test is **default-run, NOT env-gated** — file-header comment must say "NOT env-gated." Load-bearing v1.3.5 lesson; pairs with D-01.
- **D-12:** `runPriceRefresh({ trigger, actorEmail? })` is a `"server-only"`, auth-agnostic **shared service** in `src/lib/price-refresh.ts`. Two thin route handlers call it: `GET /api/cron/refresh-prices` (Bearer-token auth, fails closed when env missing → 401) and `POST /api/admin/prices/refresh` (`requireAdmin()` + `ADMIN_BULK` rate-limit). No HTTP between the two routes.
- **D-13:** `envChecks()` reports `cronSecret` as the literal `"configured"` or `"missing"` (never the value). `/admin/health` top-level `ok` flips to `false` when missing.
- **D-14:** `cards.price` is `integer` storing cents. `Math.round(parseFloat(usd) * 100)` matches existing convention.
- **D-15:** Pure-UI picker contract preserved. `binder-picker.tsx` remains a controlled component. Select All / Deselect All call a new `onBulkSet(names[], checked)` callback to avoid N renders.
- **D-16:** No schema change, no migration. `cards.price` exists; `admin_audit_log.action` is `text` so `'price_refresh'` literal works as-is.
- **D-17:** Plan ordering: 23-01 ships first (write-side; operator UAT against deployed cron). 23-02 (UI-only) follows or interleaves.
- **D-18:** Vercel Hobby `maxDuration = 300s` with fluid compute is the current 2026 default. Operator's earlier 10s/60s mental model is outdated. ~26s cold-cache refresh has 11× headroom.

### Claude's Discretion
- Exact inline error copy under the manual refresh button (the strings in D-03 are sketches; planner/executor may tighten phrasing to match other admin error patterns).
- Exact placement of the "X of Y selected" counter — research suggested near Select All / Deselect All buttons; planner picks the precise layout slot.
- Chunked UPDATE batch size (research recommends 500 rows/chunk via `FROM (VALUES …)` join — planner may adjust if profiling justifies).

### Folded Todos
- **`01-phase-18-concurrent-proof.md`** (matched score 0.6) — **NOT folded into Plan 23-01 scope.** Reviewed for relevance; the keyword match is incidental (both involve `TEST_DATABASE_URL`). Per D-01, Plan 23-01 deliberately stays Tier 1 only. The Phase 18 harness remains operator's pending next step (see STATE.md Operator Next Steps), tracked separately. See `## Deferred Ideas → Reviewed Todos`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Project overview, Key Decisions table (esp. v1.3 binder-aware rows, Phase 15 rate-limit + health-endpoint invariants).
- `.planning/REQUIREMENTS.md` — 16 v1.4 requirements (IMPORT-UX-01..05, PRICE-REFRESH-01..11); locked decisions table; out-of-scope table; v2 deferred items.
- `.planning/STATE.md` — Current position; cross-cutting constraints; open decisions carried to planning; operator next steps.
- `.planning/ROADMAP.md` — Phase 23 entry; 6 numbered success criteria.

### v1.4 research synthesis (read all five before planning)
- `.planning/research/SUMMARY.md` — Executive summary; recommended approach; confidence assessment.
- `.planning/research/STACK.md` — Verified stack, Vercel Hobby constraints, all-already-shipped dependencies.
- `.planning/research/FEATURES.md` — Must / should / defer / anti-features; bulk-action UX consensus.
- `.planning/research/ARCHITECTURE.md` — Shared-service + two-route shape; per-file line-level pointers; integration points.
- `.planning/research/PITFALLS.md` — 7 named pitfalls (env-gated test skip, picker memory regression, NULL overwrite, cron+manual race, cents conversion, missing CRON_SECRET, `next dev` no cron).

### Prior-phase contracts that Plan 23-01 / 23-02 must NOT break
- Phase 15 `15-SECURITY-REVIEW.md` — Rate-limit invariants (`ADMIN_BULK` applies AFTER `requireAdmin()`); `/admin/health` literal-only env labels; STATUS_LABELS path.
- Phase 17 etched-finish fix — `getPrice(prices, finish)` ladder; per-row, per-finish pricing.
- Phase 18 allocator — 5-segment `cards.id` composite PK; never address rows by `scryfall_id`.
- Phase 19 import preview — Two-stage NDJSON contract; `unsorted` binder default-unchecked semantics; will-delete amber panel logic (separate from `defaultCheckedFor` memory being dropped).
- Phase 22 hardening delta — D-DOS-01 resolution (rate-limit on import preview); confirms `ADMIN_BULK` is the right policy for new write-side admin routes.

### Operator-context references
- `.planning/RETROSPECTIVE.md` — v1.3.5 silent-skip incident; the load-bearing reason D-01 / D-11 exist.
- `.planning/todos/pending/01-phase-18-concurrent-proof.md` — Reviewed but not folded; tracks operator's pending `TEST_DATABASE_URL` provisioning step.

### Source files Plan 23-01 / 23-02 will modify or create (per ARCHITECTURE.md)
- `src/lib/price-refresh.ts` (NEW)
- `src/app/api/cron/refresh-prices/route.ts` (NEW)
- `src/app/api/admin/prices/refresh/route.ts` (NEW)
- `src/app/admin/health/_components/refresh-prices-button.tsx` (NEW)
- `vercel.json` (NEW, repo root — verified does not currently exist)
- `src/app/admin/import/_components/binder-picker.tsx` (MODIFY — header block, lines ~73-80)
- `src/app/admin/import/_components/import-client.tsx` (MODIFY — line ~246, replace `defaultCheckedFor` policy)
- `src/db/admin-health.ts` + `src/app/api/admin/health/route.ts` + `src/app/admin/health/page.tsx` (MODIFY — add `lastPriceRefreshAt`, replace dead tile)
- `src/lib/enrichment.ts` (MODIFY — export `getPrice(prices, finish)` as a single source of truth)
- `src/lib/store/binder-import-store.ts` (MODIFY or simplify — `defaultCheckedFor` policy drop per D-05)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/scryfall.ts` `fetchCardsByScryfallIds(ids)` — v1.3.1-hardened batcher with ~4 req/s gate + 30s 429 lockout backoff. Reused as-is by `runPriceRefresh`.
- `src/lib/enrichment.ts` `getPrice(prices, finish)` — Per-finish price ladder. Currently file-private; Plan 23-01 must export it as the single source of truth (NEW — bridges the v1.2 etched-mispricing fix into the refresh path).
- `src/db/admin-health.ts` `getAdminHealthSnapshot()` — Parallel-query pattern; Plan 23-01 adds a 4th `MAX(created_at) WHERE action='price_refresh'` query alongside existing three.
- `envChecks()` — Existing literal-only env-check table; Plan 23-01 extends with `cronSecret`.
- `requireAdmin()` middleware + `ADMIN_BULK` rate-limit (Phase 15) — Wraps the manual refresh route.
- `src/app/admin/import/_components/binder-picker.tsx` — Already a controlled `"use client"` component with `onToggle(name, checked)` prop. Plan 23-02 adds two `<button>` elements + new `onBulkSet(names[], checked)` callback in the existing `<header>` block.
- `admin_audit_log` table (Phase 14) — `action='price_refresh'` literal works as-is. No schema change.
- `src/db/__tests__/orders.concurrent.test.ts` — Phase 18 pattern reference for "what NOT to repeat" (env-gated, silently skipped in CI). Plan 23-01's cron test deliberately diverges.

### Established Patterns
- **Thin route handler → shared service** — Phase 11/13/18 pattern. Auth happens at the route boundary; service is auth-agnostic and `"server-only"`.
- **STATUS_LABELS path for env labels** — Phase 15 invariant. Only path from env-state to UI text is the lookup table; pinning test enforces this. Plan 23-01's `cronSecret` extension follows the same path.
- **Chunked autocommitted UPDATE via `FROM (VALUES …)` join** — Drizzle + neon-http pattern (no interactive transactions). 500 rows/chunk default.
- **Default-run unit tests with `vi.stubEnv`** — Plan 23-01's cron handler test pattern. Explicit anti-pattern: env-gated tests (the v1.3.5 incident).
- **Inline destructive confirmation with typed REPLACE phrase** — Phase 19 pattern. NOT used by manual refresh (refresh is reversible / re-runnable; no destruction) — confirmation lives in button-local state only per D-03.
- **`router.refresh()` post-mutation** — Standard App Router pattern for server-rendered tiles.

### Integration Points
- `vercel.json` at repo root — new infrastructure surface. `crons[]` array, single entry, no retry config (Vercel docs explicit: no cron retries on Hobby).
- `CRON_SECRET` env var — Vercel auto-injects as `Authorization: Bearer ${CRON_SECRET}` on GET-only cron requests. Provisioned by operator before first deploy (D-02).
- `export const maxDuration = 300;` on the cron route — Vercel Hobby 2026 default; ~26s refresh has 11× headroom.
- `export const runtime = "nodejs";` on the cron route — required for advisory-lock SQL via neon-http.

</code_context>

<specifics>
## Specific Ideas

- **Manual refresh inline error copy** (D-03): operator-facing strings explicitly named — `Refreshing…` (loading), `Refresh in progress — try again in a moment` (409), `Refresh failed — check logs` (5xx). Planner / executor may tighten phrasing but must keep 409 ≠ 5xx distinction (operator needs to know whether to retry now or escalate).
- **Audit metadata shape** (D-04): `{ trigger, updated, unchanged, failed, skipped, durationMs }` — exact field order and naming. Mirrors existing audit-metadata conventions (Phase 14).
- **CRON_SECRET runbook location** (D-02): inline in `23-01-SUMMARY.md` under a `## Operator Setup` section, not a separate file.
- **Tier 2 test deliberate absence** (D-01): SUMMARY must note explicitly *why* there's no live-DB test for the cron handler — references the v1.3.5 retrospective lesson so future-maintainer-Claude doesn't "helpfully" add one.

</specifics>

<deferred>
## Deferred Ideas

None new from this discussion. All v2 deferrals already captured in `.planning/REQUIREMENTS.md` v2 sections:
- IMPORT-UX-FUT-01..03 (Smart Select, saved presets, Cmd-A shortcut)
- PRICE-REFRESH-FUT-01..05 (staleness badge, cooldown UI, top-5 movers, NDJSON streaming, `card_price_history`)

### Reviewed Todos (not folded)
- **`01-phase-18-concurrent-proof.md`** — Keyword match (`TEST_DATABASE_URL`, `concurrent`) is incidental. Plan 23-01 deliberately stays Tier 1 only per D-01. The Phase 18 harness remains tracked separately as the operator's pending NEXT step in `STATE.md → Operator Next Steps`. Adding it to Plan 23-01 scope would conflate two independent operator handoffs.

</deferred>

---

*Phase: 23-import-ux-price-refresh*
*Context gathered: 2026-05-20*
