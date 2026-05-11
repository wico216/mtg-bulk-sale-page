# Phase 22 Security Review: v1.3 STRIDE Delta

**Reviewer:** Phase 22-01 executor (post-Phase 21).
**Date:** 2026-05-11.
**Scope:** v1.3 milestone delta over the Phase 15 baseline. Documents only the
v1.3-amplified surfaces (binder-aware inventory, multi-binder allocator, public
storefront aggregation, cart migration, parser perf), the new I-DISC-05 binder-name
leak finding (resolved by v1.3), the resolution of the Phase 15 deferred
D-DOS-01 import-preview rate-limit, and the multi-binder concurrent-proof
verification harness. The Phase 15 baseline (`15-SECURITY-REVIEW.md`) remains
authoritative for unchanged surfaces; only deltas appear here. STRIDE-style:
**S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure,
**D**enial of service, **E**levation of privilege.

## Surface inventory delta

Only surfaces whose security posture changed in v1.3 appear here. All other
surfaces are unchanged from the Phase 15 baseline (`15-SECURITY-REVIEW.md
§ Surface inventory`).

| Surface                             | File                                                       | v1.3 change                                                                                     | Auth | Rate limit                            |
|-------------------------------------|------------------------------------------------------------|-------------------------------------------------------------------------------------------------|------|---------------------------------------|
| Import preview                      | `src/app/api/admin/import/preview/route.ts`                | Now rate-limited post-auth (Phase 22-01 D-03; resolves deferred D-DOS-01). Parser groups 12,749 rows into BinderSummary[] before responding. | requireAdmin | **ADMIN_BULK 20/min** (NEW)            |
| Import commit                       | `src/app/api/admin/import/commit/route.ts`                 | Unchanged route handler; replaceCardsForBinders is now binder-aware (Phase 19 D-15)             | requireAdmin | ADMIN_BULK 20/min (unchanged)         |
| Checkout                            | `src/app/api/checkout/route.ts`                            | Multi-binder-aware; StockConflict.available is SUM across binders (Phase 18 D-06); CheckoutResponse.order returns PublicOrderData (binder snapshot stripped per AGG-02 / Phase 20 D-07) | none | CHECKOUT 10/min (unchanged)           |
| Public storefront (`GET /`)         | `src/app/page.tsx`                                          | StorefrontShell receives `PublicCard[]` (4-segment aggregated id; no `binder`/`binders` field per Phase 20 D-05)                              | none | none (unchanged)                      |
| Cart page (`GET /cart`)             | `src/app/cart/page.tsx` + `cart-page-client.tsx`            | v1.2 → v1.3 reconciliation effect runs once per browser; cart-storage version sentinel '1.3' added (Phase 20 D-12/D-13). Aggregated keys throughout. | none | none (unchanged)                      |
| Public storefront/cart/checkout response shapes | `src/lib/types.ts` `PublicCard`, `PublicOrderData`, `PublicOrderItem`, `StockConflict` | Type-split from internal `AdminCard` / `OrderData` / `OrderItem`; binder fields stripped at the boundary (Phase 20 D-07 / AGG-02; pinned by `src/app/__tests__/page-invariant.test.ts` and `src/app/cart/__tests__/page-invariant.test.ts`) | n/a | n/a |

The proxy (`src/proxy.ts`) is unchanged from Phase 15 — `/api/admin/*` continues
to pass through to the route handlers, which are the authoritative gate via
`requireAdmin()`.

## New findings

### I-DISC-05 — Information disclosure: Binder-name leak across the public boundary (Low, resolved)

v1.3 introduced a per-binder physical-row inventory model (`cards.binder`
column, 5-segment composite id including the binder segment, per-binder
allocator output). Any public-facing API that naively returned the internal
`Card`/`OrderItem` shape would leak the operator's binder organization map
(e.g., `a01`..`a14`, `bulk drawers`, `unsorted`) into HTML, JSON, buyer
emails, and structured logs. While binder names are organizational labels
rather than credentials or PII, the leak embarrasses the seller and
unnecessarily reveals their physical collection layout to every visitor.

- **Surface:**
  - `GET /` (storefront HTML + serialized React Server Component props)
  - `GET /cart` (cart page client state hydrated from server props)
  - `POST /api/checkout` success response (`CheckoutResponse.order`)
  - `POST /api/checkout` stock-conflict response (`StockConflict.cardId` +
    `available`)
  - Buyer order-confirmation email HTML body
  - Structured logs emitted from public routes (`checkout.placed`,
    `checkout.constraint_violation`)
- **Mitigation:**
  - Type-split via `PublicCard` / `AdminCard` in `src/lib/types.ts` (Phase 20
    D-05). The aggregated query
    `getCardsAggregated()` returns `AdminCard[]`; the storefront shell
    consumes only `PublicCard[]` after the boundary destructure
    `{ binders, ...rest }`.
  - Per-route invariant tests (Phase 20 D-07) assert
    `JSON.stringify(publicProps).includes("binder") === false`:
    - `src/app/__tests__/page-invariant.test.ts:101-107` —
      `AGG-02 invariant: cards prop passed to StorefrontShell contains no
      binder/binders trace`
    - `src/app/cart/__tests__/page-invariant.test.ts` — same shape for the
      cart server component
    - `src/app/api/checkout/__tests__/route.test.ts` — the success and
      stock-conflict response shapes are pinned binder-free
  - `StockConflict.available` is the SUM across binders for the aggregated
    key (Phase 18 D-06), never per-binder. The `cardId` is the 4-segment
    aggregated id (`${setCode}-${collectorNumber}-${finish}-${condition}`),
    never the 5-segment per-binder id.
  - `PublicOrderData` / `PublicOrderItem` (Phase 20 D-07) strip `binder` from
    `OrderItem[]` before the response leaves `route.ts`.
- **Severity:** **Low** — binder name is an organizational label, not a
  credential or PII; leak embarrasses but doesn't expose the seller's
  collection map (per `22-CONTEXT.md` D-02 verbatim).
- **Status:** **Resolved by v1.3** (Phase 18 D-06 + Phase 20 D-05/D-07).

## Resolved deferrals

### D-DOS-01 — Import preview rate-limit (Medium → Resolved)

See `15-SECURITY-REVIEW.md § D-DOS-01` for the original deferral. Phase 15
recorded that `POST /api/admin/import/preview` was admin-gated but NOT
rate-limited; the route accepts arbitrarily many CSV files and triggers an
`enrichCards()` Scryfall pass with up to ~150 outbound HTTP requests per call
(per the `maxDuration = 300` comment).

**Why v1.3 amplifies the cost.** The Phase 19 picker contract changed the
preview payload: the parser now groups every uploaded row into a
`BinderSummary[]` before responding, and the operator's real-world export
contains 12,749 rows (`22-CONTEXT.md` D-08). The parse step is bounded
(`src/lib/__tests__/csv-parser-perf.test.ts` pins it at < 2s for the full
12,749 rows; see Plan 22-02), but the Scryfall enrichment pass downstream
remains the unbounded variable. A buggy client loop or a compromised admin
session that fired the preview repeatedly could:

1. Cost real money on Scryfall API quota (free, but rate-limited at 100/min;
   exhausting it blocks legitimate imports).
2. Saturate the function with up to 300s-long workloads.

**The fix.** `enforceRateLimit({ key: clientKeyFromRequest(request,
auth.user.email), config: RATE_LIMIT_BUCKETS.ADMIN_BULK })` is now invoked
immediately AFTER `requireAdmin()` returns the session and BEFORE
`request.formData()` (so the expensive parse + Scryfall pass are gated by
the rate-limit). On 429, a structured warn log emits with event
`admin.import_preview.rate_limited` and the route returns the rate-limit
Response. Pattern matches `src/app/api/admin/import/commit/route.ts:121-138`
verbatim.

- **File:** `src/app/api/admin/import/preview/route.ts`
- **Bucket:** `ADMIN_BULK` (20 hits / 60s window)
- **Test coverage:** `src/app/api/admin/import/__tests__/preview.test.ts`
  (3 new tests pinning the 401-before-rate-limit ordering, the 429
  short-circuit before parser/stream, and the under-limit happy path).
- **Phase 19 D-19 acknowledgment:** Phase 19 explicitly did NOT add this
  rate-limit because the import_commit route already had it, and Phase 19's
  scope was the picker contract not the security delta. Phase 22 owns this
  fix per `22-CONTEXT.md` D-03.
- **Status:** **Resolved by Phase 22** (Plan 22-01 Tasks 1 + 2).

## Unchanged deferrals

The following Phase 15 deferrals remain unchanged in v1.3. None were
amplified by the v1.3 surface changes. Per `22-CONTEXT.md` D-04 they are
revisitable in the v1.4+ Operations milestone if priorities shift.

| ID         | Phase 15 status        | v1.3 amplification | Rationale for staying deferred                                                                                                                                                       | Revisit milestone           |
|------------|------------------------|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------|
| S-01       | Deferred Medium        | none               | Single-admin friend-store; case-mismatch lockout is documented in the health page and not a v1.3-introduced regression. Lowercasing both sides is a one-liner the v1.4+ ops pass can pick up. | v1.4+ Operations milestone  |
| D-DOS-02   | Documented Low (15-01) | none               | Postgres `rate_limit_hits` table grows slowly under friend-store traffic; the 1% per-insert opportunistic prune (`PRUNE_OLDER_THAN_MS = 5min`) keeps it bounded. A periodic cron is wanted before wider sharing. | v1.4+ Operations milestone  |
| D-DOS-03   | Documented Medium      | none               | XFF spoofing only matters off-Vercel. v1.3 still ships exclusively to Vercel (per STATE.md). The leftmost-trust comment in `src/lib/rate-limit.ts:583-606` documents the migration recipe. | v1.4+ if non-Vercel deploy  |
| I-DISC-03  | Surfaced Medium (UI)   | none               | `notificationFailuresLast24h: null` in the health JSON + admin UI labels the tile "Unknown — log drain not yet wired". v1.3 added no new notification failure paths. | v1.4+ log-drain phase       |

## Multi-binder concurrent-proof

The single most important regression test in v1.3 (`22-CONTEXT.md`
specifics) — if the multi-binder allocator concurrent-proof flakes, the
load-bearing concurrency invariant (lock by aggregated key, never oversell,
never partially fulfill) is broken.

### Test file

`src/db/__tests__/orders.concurrent.test.ts` — env-gated on
`TEST_DATABASE_URL`. When `TEST_DATABASE_URL` is unset, the suite
`describe.skip`s with a `console.warn` so CI and local-dev paths without a
configured test DB don't fail noisily.

### Scenario coverage mapping (CONTEXT D-05)

The planner mapped the 5 CONTEXT D-05 scenarios to the existing test
artifacts shipped by Phases 11, 16, and 18:

| CONTEXT D-05 scenario                              | Test artifact                                                                              | Coverage evidence                                                                                                                                            |
|----------------------------------------------------|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1. Single-binder regression (last-copy race)       | `src/db/__tests__/orders.test.ts` (Phase 11 baseline)                                       | Pre-existing single-binder concurrent-proof. Verified unchanged by Phase 22-01.                                                                             |
| 2. Multi-binder split (winner takes 3 of 4; SUM=1) | `src/db/__tests__/orders.concurrent.test.ts` Variant 1                                      | `expect(finalSum).toBe(1)` at line 247. CONTEXT D-05 wording said SUM=0 for `(A02:2 + A05:2)` x2 buyers — mathematically impossible; corrected to SUM=1.    |
| 3. Multi-binder oversell-prevention (SUM=0 spirit) | `src/db/__tests__/orders.concurrent.test.ts` Variant 2                                      | `expect(finalSum).toBe(0)` at line 346. Honors-spirit form via `(A02:2 + A05:1)` x2 buyers — winner takes all 3, loser conflicts.                            |
| 4. Allocator pick-order determinism                | `src/db/__tests__/orders.concurrent.test.ts` Variant 1 line 228                              | `expect(success.order.items[0].binder).toBe('a02')` — smallest-first + lex tiebreak.                                                                          |
| 5. CHECK constraint trip                            | `src/db/__tests__/schema.test.ts` Phase 16 quantity CHECK pin                                | `it("declares cards_quantity_check CHECK constraint (Phase 16 BIND-04 / D-08)")` at line 58. Schema-level pin verifies the constraint is declared.           |

NO new test code was added by Plan 22-01 to the concurrent-proof suite. Plan
22-01's Task 3 was a verification + runbook task: read the existing
`orders.concurrent.test.ts` end-to-end to confirm the 5-scenario mapping,
then run the suite 5 times consecutively against `TEST_DATABASE_URL` to
satisfy the `22-CONTEXT.md` D-06 flake bar.

### 5x flake-check evidence

**Status: BLOCKED — operator action required.** No `TEST_DATABASE_URL` is
provisioned in the local execution environment, and Claude Code cannot
provision a Neon test branch from inside the agent (the operator must use
their Neon dashboard to create a branch and export the connection URL into
the shell).

The harness itself is verified clean: the existing 2 `orders.concurrent`
tests appear in the baseline `npm test` summary as the "2 skipped" entries
when `TEST_DATABASE_URL` is unset (the env-gated `describe.skip` is the
correct behavior, not a regression). The structural verification of the
5-scenario mapping above is complete; only the live 5x execution against a
real Postgres test branch remains.

The 5x flake check runbook (Runbook section below) is documented for the
operator to execute post-merge.

### Runbook — 5x flake check (operator action)

1. **Provision a Neon test branch** (operator action — never use the
   production `DATABASE_URL`; the test INSERTs, decrements, and DELETEs
   rows):
   - Log into the Neon dashboard
   - Click `Branches` → `New Branch from production` (use the most recent
     timestamp)
   - Copy the connection URL

2. **Export `TEST_DATABASE_URL` in the local shell:**

   ```bash
   export TEST_DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
   ```

   **NEVER** point this at the production `DATABASE_URL`. The test mutates
   rows.

3. **Run the suite 5 times consecutively** (no JS-level loop required;
   sequential shell invocations are fine for the flake bar):

   ```bash
   for i in 1 2 3 4 5; do
     echo "=== Run $i ==="
     npx vitest run src/db/__tests__/orders.concurrent.test.ts 2>&1 | tail -5
     echo "exit: $?"
   done
   ```

4. **Acceptance:** every run reports exit code 0 AND `2 passed`. If any run
   fails or flakes, that is a hard failure of v1.3 — the load-bearing
   allocator concurrency invariant is broken; escalate before any wider
   release.

5. **Post-execution:** paste the captured `tail -5` blocks back into this
   document under a `### 5x flake-check raw output` section, then update the
   "Status: BLOCKED" line above to "Status: PASSED 5/5".

### Testcontainers fallback (CI-friendly)

Per `22-CONTEXT.md` D-05 option (b): Testcontainers (`@testcontainers/postgresql`)
spins up a throwaway Postgres in Docker, applies the `drizzle-kit` schema,
and tears down afterward. Heavier than Neon-branch (Docker daemon required,
~10s spin-up cost per test file) but avoids the operator-handshake step. Not
adopted in v1.3 because the Neon-branch path is faster for the friend-store
operator and CI is not yet a constraint at this milestone.

## Summary of follow-ups

Self-contained restatement of all Phase 15 follow-ups plus the v1.3 deltas.
Status column reflects post-Phase 22 state.

| ID         | Severity | Status                              | Owner                  |
|------------|----------|-------------------------------------|------------------------|
| S-01       | Medium   | Deferred (v1.4+ Operations)         | follow-up              |
| D-DOS-01   | Medium   | **Resolved by Phase 22**            | this phase (Plan 22-01) |
| D-DOS-02   | Low      | Documented (15-01); deferred v1.4+  | follow-up              |
| D-DOS-03   | Medium   | Documented; deferred (Vercel-only)  | follow-up              |
| I-DISC-03  | Medium   | Surfaced (UI); deferred v1.4+       | log-drain phase        |
| I-DISC-05  | Low      | **Resolved by v1.3**                | this milestone (Phases 18+20) |
| R-01       | Low      | Docs (README backup); done in 15-02 | done                   |

All **High** items remain resolved (Phase 15 baseline + Phase 22 delta).
The remaining items are defense-in-depth or self-foot-guns that require an
attacker who already has admin credentials, or are deferred to the v1.4+
Operations milestone where they fit naturally with log-drain and ops
hardening work.

For the current friend-store threat model (one admin, small known friend
group, no payment data on the box) these are acceptable to ship.

## Phase 22 outcome

Phase 22-01 delivers:

- The v1.3 STRIDE delta document (this file).
- A new I-DISC-05 finding recording the binder-name privacy boundary,
  resolved by the v1.3 type-split (Phase 18 + Phase 20).
- The resolution of Phase 15's deferred D-DOS-01 import-preview
  rate-limit (`enforceRateLimit({ config: RATE_LIMIT_BUCKETS.ADMIN_BULK })`
  post-`requireAdmin()` in `/api/admin/import/preview`, with 3 new
  regression tests).
- Verification that the 4 unchanged Phase 15 deferrals remain unchanged
  and unamplified by v1.3.
- Verification that the multi-binder concurrent-proof harness covers all
  5 CONTEXT D-05 scenarios via existing Phase 11 + Phase 16 + Phase 18
  test artifacts.
- A documented 5x flake-check runbook for the operator to execute
  post-merge against a Neon test branch.

The 5x flake-check execution itself is BLOCKED on operator provisioning
of a Neon test branch.
