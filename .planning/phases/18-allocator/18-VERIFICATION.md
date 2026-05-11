---
phase: 18-allocator
status: human_needed
verified_at: 2026-05-11
verified_by: gsd-executor (autonomous)
---

# Phase 18 — VERIFICATION

## Verdict

**Status:** `human_needed`

**Why human_needed:** All automated checks pass (tsc, full unit-test suite, build, four load-bearing greps). The single most important test in the milestone — the multi-binder concurrent-proof (D-07 Variants 1+2) — requires a real Postgres connection (`TEST_DATABASE_URL`) and a 5x flake check that the executor cannot perform safely. The executor has only the production `DATABASE_URL` available, which is explicitly off-limits for tests that INSERT, decrement, and DELETE rows.

The structural invariants are enforced by the source-shape regression test in `src/db/__tests__/orders.test.ts` (asserts every CTE marker + the negative grep proofs are impossible to silently regress). The behavioural invariants — "two concurrent buyers, one wins, one conflicts, never overselling" — are pinned by the orders.concurrent.test.ts file but currently SKIP gracefully without a configured test DB.

---

## Automated Checks (PASSED)

| Check | Command | Result |
|-------|---------|--------|
| Type check | `npx tsc --noEmit` | GREEN |
| Unit tests | `npm test` (vitest run) | 335 passed + 2 skipped (337 total); +10 net new vs baseline 327 |
| Production build | `npm run build` | GREEN — all 30 routes compile |
| Whitespace | `git diff --check` | clean |
| Grep 1 (positive) | `grep "FOR UPDATE OF cards" src/db/orders.ts` | 3 matches (lines 418, 426 [JSDoc], 488 [SQL]) |
| Grep 2 (negative, scoped to placeCheckoutOrder body) | no `id IN (\|pickPlan\|preallocate\|preAllocate` | 0 matches (PITFALLS Pitfall 1 prevented) |
| Grep 3 (positive) | `grep "binderSourceCount" src/app/api/checkout/route.ts` | 2 matches (lines 180, 191) |
| Grep 4 (positive) | `grep -E "23514\|cards_quantity_check" src/app/api/checkout/route.ts` | 4 matches (lines 17, 25, 32, 123) |

---

## 14-Decision Coverage

All 14 CONTEXT decisions (D-01..D-14) are satisfied with concrete evidence pointers in `18-01-SUMMARY.md`. No gaps.

---

## Human Verification Required

### 1. D-07 multi-binder concurrent-proof — 5x flake check

**Why this matters:** The plan flags this as "the SINGLE MOST IMPORTANT regression test in the milestone." If it flakes, the load-bearing concurrency invariant is broken and the milestone cannot ship.

**Runbook:**

```bash
# Step 1 — Provision a Neon test branch (or local Postgres). NEVER point at prod.
#   Neon dashboard → branches → new branch → name: "v1.3-test"
#   Copy the connection string (will look like: postgresql://...@...neon.tech/neondb?sslmode=require).
export TEST_DATABASE_URL="postgresql://...@...test-branch.../neondb?sslmode=require"

# Step 2 — Push the v1.3 schema to the test branch (one-time setup):
#   - Run the existing v1.3 migration (Phase 16 produced it):
DATABASE_URL="$TEST_DATABASE_URL" npm run migrate:v1.3

# Step 3 — Confirm the schema is current:
DATABASE_URL="$TEST_DATABASE_URL" npx drizzle-kit introspect:pg --config drizzle.config.ts | grep -E "binder|finish"

# Step 4 — Run the concurrent-proof tests once to confirm both variants pass:
TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run src/db/__tests__/orders.concurrent.test.ts

# Step 5 — Run 5 times in a row to confirm non-flakiness (REQUIRED for D-07 sign-off):
for i in 1 2 3 4 5; do
  echo "=== Concurrent-proof run $i/5 ==="
  TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run --no-coverage src/db/__tests__/orders.concurrent.test.ts
  if [ $? -ne 0 ]; then
    echo "FAIL on run $i — STOP and investigate flake mode"
    exit 1
  fi
done
echo "All 5 runs passed — D-07 sign-off complete"
```

**Expected:** 2/2 passed each run, 0 failures across all 5 runs.

**If any run fails:** Document the flake mode (which assertion failed, what `final SUM` was actually observed, whether the winner / loser determination differed from run-to-run) and route as `gaps_found` with a follow-up plan to fix the flake source.

**Cleanup:** The tests' `afterEach` block deletes the test rows automatically, so the test database stays clean. If a run was interrupted mid-test, manually run:

```bash
DATABASE_URL="$TEST_DATABASE_URL" psql -c "DELETE FROM order_items WHERE set_code = 'tst'; DELETE FROM orders WHERE id LIKE 'ORD-D07%'; DELETE FROM cards WHERE set_code = 'tst';"
```

### 2. Manual smoke test — buyer-facing happy path (recommended)

After Phase 20 ships, do an end-to-end manual smoke test:

1. Storefront → add a card to cart that has multi-binder stock (e.g., a Lightning Bolt with copies in 2+ binders).
2. Cart → submit a quantity that requires splitting across binders (e.g., 5 copies when the largest binder has 3).
3. Confirm the checkout succeeds, the buyer sees the order confirmation page, and the seller email arrives.
4. Open the admin order detail (Phase 21 will add the `[binder]` annotation; check for now via direct DB query):
   ```sql
   SELECT card_id, quantity, binder FROM order_items WHERE order_id = 'ORD-...';
   ```
   Confirm the rows show one per binder source with the correct binder snapshots.

### 3. Manual smoke test — stock_conflict UX (recommended)

1. Storefront → add a card to cart with quantity > total available across all binders.
2. Submit checkout → confirm HTTP 409 + the existing buyer-facing message ("Some cards are no longer available.")
3. Confirm the cart and form state are preserved (Phase 11 invariant — D-14).

### 4. Log review — `binderSourceCount` field (optional, post-deploy)

After Phase 18 + 20 ship to production, grep production logs for the `checkout.order_committed` event and confirm `metadata.binderSourceCount` is present with reasonable values (1 for single-binder orders, >1 for multi-binder split orders).

---

## Cross-Phase Regression Check

**Status:** GREEN.

The full repo test suite (335 tests across 30 files) passes after Phase 18. Phase 11's four existing checkout tests are unmodified except for the legacy 2-segment `missing-card` fixture being updated to a valid 4-segment id (`xxx-999-normal-near_mint`) — this is a fixture cleanup, not a behavioural regression.

Prior phases tested: 16 (schema migration), 17 (parser etched), 11 (transactional checkout) — all green.

---

## Risk Assessment

**Low risk** for the structural invariants:
- The source-shape regression test in `orders.test.ts` makes the load-bearing pitfall (PITFALLS Pitfall 1: lock by chosen rows, not by aggregated key) impossible to silently regress.
- `parseAggregatedCardId` throws loud on stale 5-segment cart keys — defense-in-depth above Phase 20 reconciliation.
- `isCheckConstraintError` surfaces the schema-level safety-net trip as HTTP 503 + structured log, so any allocator math regression would be observable in production logs.

**Medium risk** for the concurrency invariant under high load (mitigation: human-verification 5x flake check against a real Neon branch):
- The `FOR UPDATE OF cards` row-lock pattern is well-understood Postgres semantics; ARCHITECTURE Q3 walk-through validates it for the multi-binder case.
- The window-function arithmetic is hand-traced against the (2,2,2)×{3,5,6,7} fixture matrix in 18-SPIKE-NOTES.md.
- BUT: real-world race-condition behaviour can only be verified against a real Postgres instance under simulated concurrent load (the 5x flake check in step 1 above).

**No risk identified** for backward compatibility:
- StockConflict shape unchanged (D-14).
- HTTP 409 stock_conflict response unchanged.
- Phase 11 buyer-side cart-preservation UX unchanged.
- Notification emails still iterate `order.items.map` — the new `binder` field is additive (no template references it; Phase 21 may consume it).

---

## Sign-Off Checklist (for human verifier)

- [ ] Step 1 of D-07 runbook: provisioned `TEST_DATABASE_URL` against a Neon test branch (NOT production).
- [ ] Step 4 of D-07 runbook: both Variants 1+2 pass once.
- [ ] Step 5 of D-07 runbook: both Variants pass 5 times in a row, zero flakes.
- [ ] Manual smoke 1: multi-binder happy-path checkout works end-to-end.
- [ ] Manual smoke 2: stock_conflict UX preserved (cart + form state).
- [ ] Phase 18 ships AFTER Phase 20 (cutover note in 18-01-SUMMARY.md).

When all checked, mark this file's frontmatter `status: passed` and proceed to phase completion.
