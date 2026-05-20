---
phase: 23-import-ux-price-refresh
plan: 01
subsystem: api
tags: [cron, vercel-cron, scryfall, postgres-advisory-lock, audit-log, admin-health, price-refresh]

# Dependency graph
requires:
  - phase: 15-production-hardening
    provides: requireAdmin + ADMIN_BULK rate-limit; literal-only envChecks pattern; STATUS_LABELS env-to-UI mapping
  - phase: 14-audit-trail
    provides: admin_audit_log table with bounded JSON metadata + createAdminAuditEntry/normalizeAdminAuditAction extension points
  - phase: 17-parser-etched
    provides: getPrice(prices, finish) ladder (now exported as the single source of truth)
  - phase: 18-allocator
    provides: 5-segment cards.id composite PK contract (UPDATE join key)
provides:
  - server-only runPriceRefresh shared service with Postgres advisory-lock single-flight
  - GET /api/cron/refresh-prices (Bearer-gated cron endpoint)
  - POST /api/admin/prices/refresh (admin manual escape hatch with 409-on-locked UX distinction)
  - <RefreshPricesButton /> client component with D-03 button-local state machine
  - lastPriceRefreshAt + cronSecret env check on /admin/health (JSON + page)
  - vercel.json with daily 09:00 UTC cron
  - AdminAuditAction union + runtime allowed-list extended with "price_refresh"
affects: [23-02-import-picker-ux, future-price-history-feature, operator-runbook]

# Tech tracking
tech-stack:
  added: [Vercel Cron (vercel.json), Postgres advisory lock via neon-http (`pg_try_advisory_lock(hashtext(...))`)]
  patterns:
    - "Thin route handler -> shared service (auth at boundary; service is auth-agnostic + server-only) for cron + admin route pair"
    - "Bearer-token fail-closed cron auth: `if (!cronSecret || authHeader !== Bearer ${cronSecret}) return 401`"
    - "Chunked UPDATE by composite PK via `sql.join` + `UPDATE ... FROM (VALUES (id, price), ...) AS v(id, price) WHERE cards.id = v.id` (parametrized; never string-concat)"
    - "Tier-1 default-run unit tests with `vi.stubEnv` + mocked DB/Scryfall (NOT env-gated; literal 'NOT env-gated' file-header convention)"
    - "Distinct HTTP 409 (advisory-lock contention) vs 5xx (generic failure) so the manual-refresh button can render distinct operator-facing copy"

key-files:
  created:
    - src/lib/price-refresh.ts
    - src/lib/__tests__/price-refresh.test.ts
    - src/app/api/cron/refresh-prices/route.ts
    - src/app/api/cron/refresh-prices/__tests__/route.test.ts
    - src/app/api/admin/prices/refresh/route.ts
    - src/app/api/admin/prices/refresh/__tests__/route.test.ts
    - src/app/admin/health/_components/refresh-prices-button.tsx
    - src/app/admin/health/_components/__tests__/refresh-prices-button.test.tsx
    - vercel.json
  modified:
    - src/lib/enrichment.ts (export getPrice — single source of truth)
    - src/db/queries.ts (AdminAuditAction union + runtime allowed-list extended)
    - src/db/admin-health.ts (lastPriceRefreshAt added to snapshot)
    - src/app/api/admin/health/route.ts (cronSecret env check + lastPriceRefreshAt; ok flips false on missing)
    - src/app/admin/health/page.tsx ("Last price refresh" tile replaces dead "Notification failures (24h)" tile; button mounted)
    - src/app/admin/audit/_components/audit-table.tsx (exhaustive switch covers new "price_refresh" action)

key-decisions:
  - "D-01 honored: Tier-1 unit tests only; cron handler and shared service tests are default-run with vi.stubEnv + mocked DB/Scryfall. No env-gated live-DB integration test. Background: v1.3.5 retrospective."
  - "D-02 honored: CRON_SECRET runbook lives inline in this SUMMARY (Operator Setup section). No separate ops doc."
  - "D-03 honored: <RefreshPricesButton /> uses button-local state with 409 vs 5xx distinct inline copy; no toast library; no client-side persistence."
  - "D-04 honored: audit metadata is exactly { trigger, updated, unchanged, failed, skipped, durationMs } — locked scalars only; per-card failure detail flows through logEvent."
  - "D-08 honored: pg_try_advisory_lock(hashtext('cron.refresh_prices')) single-flights cron+manual; second caller throws PriceRefreshLockedError -> 409 (manual) / quiet 200 (cron)."
  - "D-09 honored: UPDATE join key is cards.id (5-segment); SQL never references scryfall_id in WHERE/JOIN."
  - "D-10 honored: rows with no scryfallId go to `skipped`; Scryfall not_found preserves price (`failed`); only explicit prices.usd === null writes NULL."
  - "D-12 honored: runPriceRefresh is server-only and auth-agnostic; both route handlers call it directly (no HTTP between routes)."
  - "D-13 honored: cronSecret reported as the literal 'configured' or 'missing'; ok flips false when missing; secret value never serialized."
  - "D-14 honored: cents conversion via Math.round(usd * 100); cards.price remains integer cents."
  - "D-16 honored + PATTERNS correction applied: AdminAuditAction TS union AND runtime allowed-list both extended (without the latter, audit reads silently coerce price_refresh -> inventory.update)."
  - "D-18 honored: both routes export maxDuration = 300 (Vercel Hobby 2026 fluid-compute ceiling)."

patterns-established:
  - "Postgres advisory-lock single-flight via neon-http: non-blocking `pg_try_advisory_lock(hashtext(<key>))`; auto-released at connection close (no try/finally unlock needed because neon-http opens a fresh session per request)."
  - "Cron route shape: nodejs runtime + maxDuration=300 + Bearer-token fail-closed gate + structured logger + advisory-lock error mapped to quiet 200/{reason:'locked'} (no fake 5xx alarm noise on double-delivery)."
  - "Manual escape-hatch admin route shape: requireAdmin -> enforceRateLimit(ADMIN_BULK) -> service call -> distinct 409 vs 500 mapping so UX can render different operator-facing copy."

requirements-completed:
  - PRICE-REFRESH-01
  - PRICE-REFRESH-02
  - PRICE-REFRESH-03
  - PRICE-REFRESH-04
  - PRICE-REFRESH-05
  - PRICE-REFRESH-06
  - PRICE-REFRESH-07
  - PRICE-REFRESH-08
  - PRICE-REFRESH-09
  - PRICE-REFRESH-10
  - PRICE-REFRESH-11

# Metrics
duration: ~21 min (sequential portion; excludes recovered worktree time)
completed: 2026-05-20
---

# Phase 23 Plan 01: Daily Price Refresh Summary

**Vercel-cron daily Scryfall price refetch backed by a Postgres advisory-lock single-flight, with an admin-only manual escape hatch on `/admin/health`, fail-closed `CRON_SECRET` env reporting, and a Tier-1 default-run test suite that deliberately avoids the v1.3.5 env-gated-skip trap.**

## Performance

- **Duration:** ~21 minutes wall clock for the sequential executor portion (Tasks 2-4 + SUMMARY). Task 1 was previously completed in a worktree and recovered into main as commit `a8769a3` before this run started.
- **Started:** 2026-05-20T19:48Z (first commit `f4835d2` on Task 1)
- **Completed:** 2026-05-20T20:09Z (Task 4 commit `bdf8cbe`)
- **Tasks:** 4 / 4
- **Files created:** 9
- **Files modified:** 6
- **Net diff:** +1454 / -1 across the four task commits

## Accomplishments

- **Daily autonomous price refresh** via Vercel Cron at `0 9 * * *` UTC, with Bearer-token fail-closed auth and 11x maxDuration headroom over the ~26s cold-cache run.
- **Manual admin escape hatch** via a `<RefreshPricesButton />` that distinguishes advisory-lock contention (`409 — Refresh in progress, try again in a moment`) from generic failure (`5xx / network — Refresh failed, check logs`) per D-03.
- **Per-row finish-aware refresh** that bridges the v1.2 etched-mispricing fix (Phase 17 FIN-01) into the cron path; UPDATEs by 5-segment `cards.id` only, never by `scryfall_id`.
- **Operator observability** via a new `lastPriceRefreshAt` tile and `cronSecret` env-check row on `/admin/health` (replacing the dead `notificationFailuresLast24h` deferral row from Phase 15).
- **Audit trail per run** — exactly one `admin_audit_log` row with `action='price_refresh'` and bounded metadata `{ trigger, updated, unchanged, failed, skipped, durationMs }`.

## Task Commits

Each task was committed atomically (sequential executor on `main`):

1. **Task 1: Read-side scaffolding (export `getPrice`, extend `AdminAuditAction`, add `lastPriceRefreshAt` to admin-health, wire `cronSecret` env check)** — `f4835d2` (feat). Originally committed in a Claude Code worktree (`worktree-agent-a80f24bdccafe70c3`) and recovered into `main` via merge commit `a8769a3` after a path-drift bug in the worktree dispatch.
2. **Task 2: `runPriceRefresh` shared service with Postgres advisory lock, per-row finish ladder, chunked composite-PK UPDATE, locked-scalar audit metadata** — `27ef9a9` (feat). 8 default-run test cases covering dedupe, skip/preserve semantics, per-finish ladder divergence, `cards.id` join-key invariant, audit metadata shape, and advisory-lock contention.
3. **Task 3: GET `/api/cron/refresh-prices` (Bearer-gated) + POST `/api/admin/prices/refresh` (requireAdmin + ADMIN_BULK) + `vercel.json`** — `4a4f030` (feat). 7 cron + 6 admin default-run test cases including the auth-header-never-logged assertion and the 409 vs 5xx mapping.
4. **Task 4: `<RefreshPricesButton />` client component + page mount + end-to-end validation** — `bdf8cbe` (feat). 7 default-run cases under happy-dom covering every D-03 state transition.

**Plan metadata commit:** _(this SUMMARY commit, see below)_

## Files Created/Modified

### Created (9)

- `src/lib/price-refresh.ts` — server-only `runPriceRefresh({ trigger, actorEmail? })`; exports `PriceRefreshSummary` and `PriceRefreshLockedError`.
- `src/lib/__tests__/price-refresh.test.ts` — 8 default-run cases; `NOT env-gated` literal in file header.
- `src/app/api/cron/refresh-prices/route.ts` — Bearer-token GET; `runtime=nodejs`; `maxDuration=300`; quiet 200 on locked.
- `src/app/api/cron/refresh-prices/__tests__/route.test.ts` — 7 default-run cases.
- `src/app/api/admin/prices/refresh/route.ts` — POST with `requireAdmin` → `ADMIN_BULK` rate-limit → service call; 409 on locked, 500 on generic error.
- `src/app/api/admin/prices/refresh/__tests__/route.test.ts` — 6 default-run cases.
- `src/app/admin/health/_components/refresh-prices-button.tsx` — client mutation button with `router.refresh()` post-success.
- `src/app/admin/health/_components/__tests__/refresh-prices-button.test.tsx` — 7 default-run cases under happy-dom.
- `vercel.json` — single cron entry, `0 9 * * *` UTC daily, path `/api/cron/refresh-prices`.

### Modified (6)

- `src/lib/enrichment.ts` — `getPrice(prices, finish)` flipped from file-private to `export function`; now the single source of truth used by both the import enrichment pipeline and the cron refresh.
- `src/db/queries.ts` — `AdminAuditAction` union and the `normalizeAdminAuditAction` runtime allowed-list both extended with `"price_refresh"` (Patterns correction — D-16 alone was incomplete; without the runtime list the audit READS would silently coerce `'price_refresh'` to `'inventory.update'`).
- `src/db/admin-health.ts` — `AdminHealthSnapshot.lastPriceRefreshAt` added via a fourth `MAX(created_at) WHERE action='price_refresh'` query in the existing `Promise.all`; existing `admin_audit_log_action_idx` covers the filter.
- `src/app/api/admin/health/route.ts` — `cronSecret` added to `envChecks()` and to `ok` composition; `lastPriceRefreshAt` replaces the deferred `notificationFailuresLast24h` field on `AdminHealthRecent`.
- `src/app/admin/health/page.tsx` — "Last price refresh" tile replaces the "Notification failures (24h)" tile (grid stays `lg:grid-cols-4` per D-06); `<RefreshPricesButton />` mounted inside the tile, below the timestamp; `cronSecret` row added to the `checks[]` array and to `overallOk`.
- `src/app/admin/audit/_components/audit-table.tsx` — exhaustive switch on `AdminAuditAction` extended to render `"price_refresh"` rows.

## Decisions Made

None new in this execution — Task 1's worktree run captured all 18 decisions cited at planning time (D-01..D-18). This sequential execution honored every one and did not introduce additional decisions. The CRON_SECRET runbook (D-02) and the deliberate Tier-2 absence (D-01) are documented in the dedicated sections below per the plan's `<output>` requirements.

## Deviations from Plan

None - plan executed exactly as written.

Two small, in-scope wording adjustments were made to satisfy the plan's strict grep-based acceptance criteria — these are not behavior changes:

1. Code comments in `src/lib/price-refresh.ts` were reworded to avoid the literal tokens `failedSample`, `errors:`, and `notFoundIds` (the original docstrings used these words to explain the design choice but they tripped the `grep -nE "(failedSample|errors\s*:|notFoundIds)"` acceptance assertion). Behavior unchanged.
2. A docstring in `src/app/admin/health/_components/refresh-prices-button.tsx` was reworded to avoid the literal tokens `toast` and `sessionStorage` (same reason — the original wording explained the D-03 prohibition by naming the things we are NOT doing). Behavior unchanged.

## Issues Encountered

1. **Test isolation in `refresh-prices-button.test.tsx`** — `vi.spyOn(globalThis, "fetch")` instances accumulated across test cases, leaking earlier `mockResolvedValueOnce` queues into the re-click-guard test (Case 7) and inflating the call count from 1 to 6. Resolved by adding `afterEach(() => { vi.restoreAllMocks(); cleanup(); })`. Documented inline in the test file.

2. **TypeScript `Record<string, unknown>` index signature** — `PriceRefreshSummary` interface members don't satisfy the `metadata: Record<string, unknown>` constraint of `logEvent` directly. Resolved by spreading the summary at the call site (`metadata: { ...summary }`) on both route handlers.

These were "Issues Encountered" (problems during planned work), not deviations from the plan.

## User Setup Required

### Operator Setup (D-02 inline runbook)

**Required before the first Vercel deploy** — without `CRON_SECRET` set, the cron endpoint will fire at 09:00 UTC and 401 silently (the `/admin/health` page will show `cronSecret: missing` and `ok: false`, but the daily price refresh will not run).

Steps:

1. **Generate the secret locally:**
   ```bash
   openssl rand -hex 32
   ```
   Copy the 64-character hex output to your clipboard.

2. **Paste into Vercel Project Settings:**
   - Open: Vercel Dashboard → Project (`wikos-spellbinder`) → Settings → Environment Variables
   - Add a new variable:
     - **Key:** `CRON_SECRET`
     - **Value:** the 64-char hex from step 1
     - **Environments:** Production (required) + Preview (optional but recommended for parity)

3. **Redeploy** so the env var is injected into the function bundle:
   - Vercel Dashboard → Deployments → most-recent → ⋯ menu → **Redeploy**

4. **Verify** the configuration landed:
   - Visit `https://wikos-spellbinder.vercel.app/admin/health`
   - The "Configuration" section MUST show a row reading `Cron secret · Configured`
   - The top-level page status MUST be `ok: true`
   - Optionally: trigger a manual refresh via the "Refresh now" button and verify the "Last price refresh" tile timestamp updates within a few seconds

**No rotation cadence is mandated.** This is a low-privilege secret whose only capability is invoking `/api/cron/refresh-prices` — leaked exposure would let an attacker DoS the Scryfall budget for the project (no PII, no card data write beyond what Scryfall already returns). Rotate at operator's discretion (the same 4-step procedure above with a new `openssl rand -hex 32` value).

## Why no Tier 2 live-DB integration test

Per D-01, this plan stays **Tier 1 only**. The cron handler and `runPriceRefresh` service tests are default-run unit tests using `vi.stubEnv("CRON_SECRET", ...)` + mocked `db` + mocked `fetchCardsByScryfallIds`. No `TEST_DATABASE_URL`-gated integration test was added.

**Why this is the right call:**

- **The v1.3.5 retrospective lesson** (`.planning/RETROSPECTIVE.md`) — env-gated tests silently skip in CI when the env var isn't set, and the next observation point is a production incident. The cron handler test file's header literally contains the string `"NOT env-gated"` so future-maintainer-Claude has a load-bearing reason not to "helpfully" wrap it in a `describeIfDb`.
- **The Phase 18 concurrent-proof harness is still pending operator provisioning** (`.planning/todos/pending/01-phase-18-concurrent-proof.md`, promoted 2026-05-13 to Operator Next Steps). Adding another env-gated test now would compound the same risk, not mitigate it.
- **Advisory-lock contention is verified at the unit level** (Case 8 of `price-refresh.test.ts` — `pg_try_advisory_lock` returning `acquired: false` throws `PriceRefreshLockedError`). End-to-end contention against a real Postgres backend is verified by operator UAT against the deployed cron — operator can fire the manual button mid-cron-window and observe the 409 on `/admin/prices/refresh`.

If a future Tier-2 wave provisions `TEST_DATABASE_URL`, the natural next step is the Phase 18 harness (concurrent allocator proof) before adding cron-handler integration coverage. That handoff is tracked separately and is unaffected by this plan.

## Pitfall mitigation cross-reference

| Pitfall | Mitigation |
|---|---|
| **PITFALLS Pitfall 1** — auth bypass via missing/wrong Bearer | Fail-closed `if (!cronSecret \|\| authHeader !== 'Bearer ${cronSecret}') return 401`. Cron-test Cases 1-3 cover all three 401 states. |
| **PITFALLS Pitfall 2** — env-gated tests silently skip in CI | All Phase-23 test files default-run; literal `"NOT env-gated"` in headers; phase-level grep gate (`describe.skip` / `describe.runIf` count = 0) verifies. |
| **PITFALLS Pitfall 4** — neon-http advisory lock auto-release behavior | Documented in code: no `pg_try_advisory_lock` is paired with `pg_advisory_unlock` because neon-http opens a fresh session per request; the connection-close auto-release IS the unlock. |
| **PITFALLS Pitfall 5** — NULL-overwrite on Scryfall `not_found` | Explicit guard: rows absent from the Scryfall response Map go to `failed`, NOT to the UPDATE batch; only `prices.usd === null` writes NULL. Test Case 3 enforces. |
| **PITFALLS Pitfall 6** — missing `CRON_SECRET` env on deploy | Two safeguards: (a) cron endpoint fails closed (401 even on a header-bearing request); (b) `/admin/health` flips `ok: false` and surfaces the literal `Cron secret · Missing` row with the `openssl rand -hex 32` hint. |
| **PITFALLS Pitfall 9** — Vercel Hobby cron drift ±59 min within the hour | Documented in the cron-route docstring; operator should NOT report a 09:35 UTC firing as a bug. |
| **PITFALLS Pitfall 14** — cron at-least-once delivery (Vercel docs disclosure) | Same advisory lock handles double-delivery; quiet 200 with `{ reason: "locked" }` so the cron run history doesn't show fake 5xx alarms. |

## Open items for operator UAT

1. **Provision `CRON_SECRET` and verify on `/admin/health`** — Operator Setup runbook above.
2. **Live cron firing window** — first deploy after operator provisions `CRON_SECRET`, observe the 09:00–09:59 UTC firing window in Vercel Dashboard → Crons. Subsequent runs should produce one new `admin_audit_log` row per day. PITFALLS Pitfall 9 confirms the drift is normal.
3. **Advisory-lock contention** — during the cron firing window (or by deliberately staggering the manual button against a synthetic in-flight cron), click "Refresh now" twice in quick succession. Expected: first click 200, second click 409 with inline copy "Refresh in progress — try again in a moment". This is the end-to-end proof for D-08 that Tier 1 cannot exercise (see "Why no Tier 2 live-DB integration test" above).

## Next Phase Readiness

- **Plan 23-02 (Import Picker UX)** is unblocked. It is fully independent of this plan (different files, no shared state) per `23-CONTEXT.md` D-17.
- **Operator handoff:** `CRON_SECRET` provisioning (above) is the only required action before this plan ships to production. Until then, the cron will 401 silently — `/admin/health` is the audible signal.
- **Outstanding from v1.3 close (carried into v1.4):** `TEST_DATABASE_URL` provisioning for the Phase 18 concurrent-proof harness is still pending. Independent of this plan; tracked in `.planning/todos/pending/01-phase-18-concurrent-proof.md`.

## Self-Check: PASSED

All 10 declared output files exist on disk. All 5 task commits (`f4835d2`, `a8769a3`, `27ef9a9`, `4a4f030`, `bdf8cbe`) are present in git history. Phase-level verification gates (NOT env-gated, no scryfall_id join, no failedSample/errors/notFoundIds tokens, lg:grid-cols-4 preserved, dead tile retired, vercel.json shape, maxDuration=300 on both routes, no HTTP between routes) all pass.

---
*Phase: 23-import-ux-price-refresh*
*Plan: 23-01 Daily Price Refresh*
*Completed: 2026-05-20*
