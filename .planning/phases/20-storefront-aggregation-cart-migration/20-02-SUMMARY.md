---
phase: 20-storefront-aggregation-cart-migration
plan: 02
status: complete
date: 2026-05-11
---

# Plan 20-02 SUMMARY — Client-Side Cart Reconciliation & Migration Toast

## What landed

The client-side half of v1.3 Phase 20:

- The persisted cart store now carries a `version: string` sentinel
  (initial value `"1.3"`) that survives reloads.
- Two new helpers in `src/lib/store/cart-store.ts`: `markCartMigrated()`
  and `needsCartMigration(state)`.
- A new informational `CartMigrationToast` component (D-12) — buyer-
  facing, neutral-styled (NOT success/error), 6000ms auto-dismiss with
  a manual × button.
- The existing Phase 10-03 silent-removal `useEffect` in cart-page-
  client is extended into a 5-step reconciliation pipeline (D-08)
  covering segment-strip, transfer-and-clamp, current-stock clamp,
  silent-drop fallback, and the one-time toast.
- The toast renders in BOTH the empty-state branch (D-15) and the
  cart-with-items branch.

## Tasks completed (4/4)

| # | Task | Commit |
|---|------|--------|
| 1 | cart-store version sentinel + helpers (TDD) | `37fac43` |
| 2 | CartMigrationToast component (TDD) | `765ca62` |
| 3 | cart-page-client 5-step pipeline + toast wiring (TDD) | `cf9af60` |
| 4 | Repo gate: tests + tsc + build green | (this) |

## Test results

- After Plan 20-01: 423 passed + 2 skipped (425) across 38 files
- After Plan 20-02: **443 passed + 2 skipped (445)** across 41 files
- New tests in 20-02: cart-store (8) + cart-migration-toast (4) +
  cart-reconciliation (8) = +20
- All existing tests still passing

## Verification gate

- `npx vitest run` → 443/445 pass
- `npx tsc --noEmit` → 0 errors
- `npm run build` → succeeds (Next 16 production build, all routes
  compiled including the swapped server pages from Plan 20-01)
- `git diff --check` → clean

## Reconciliation pipeline (5 steps)

The new `useEffect` in `src/app/cart/cart-page-client.tsx` executes after
hydration and:

1. **STEP 0 — snapshot**: `[...startState.items.entries()]` so mid-loop
   store mutations don't invalidate the iterator.
2. **STEP 1 — segment-strip**: cart keys with 5 hyphen segments
   (`setCode-collectorNumber-finish-condition-binder` from v1.2) are
   reduced to the 4-segment aggregated candidate
   (`setCode-collectorNumber-finish-condition`).
3. **STEP 2 — transfer-and-clamp**: if the candidate exists in cardMap,
   add the stale-key qty to the existing aggregated qty (handling
   multiple legacy keys for the same logical card), clamp via
   `setQuantity`'s third arg to the current aggregated maxStock, then
   `removeItem(staleKey)`.
4. **STEP 3 — current-stock clamp**: for already-aggregated keys whose
   qty exceeds current cardMap stock (Pitfall 11 mid-session-stock-drop
   case), `setQuantity(key, currentAggregatedQty)`.
5. **STEP 4 — silent-drop fallback**: any remaining unmatchable entry
   (legacy 5-segment with no candidate, or 4-segment not in cardMap) is
   `removeItem`'d — preserves Phase 10-03 D-13 verbatim.
6. **STEP 5 — toast + sentinel**: if `needsCartMigration` was true at
   the start of the effect, set `showMigrationToast = true` and call
   `markCartMigrated()`. The shouldFireToast guard ensures the toast
   never re-fires across re-renders.

## Critical decisions honored

- **Reconciliation is an effect-based extension**, NOT a Zustand
  `migrate` hook (Pitfall 5 — the migrate hook runs synchronously
  before hydration completes and cannot read `cardMap` which is built
  from server-fetched data). The effect runs after hydration with
  `cardMap` in scope.
- **Toast is rendered in both empty-cart and cart-with-items branches**
  via `<>` Fragment wrappers. The hydration-loading skeleton branch
  does NOT render the toast (the reconciliation effect hasn't run
  yet).
- **Toast variant is neutral** (var(--ink) on var(--bg) with
  var(--border-strong)), NOT the green/red success/error palette of the
  admin Toast — this is informational, not feedback.
- **6000ms auto-dismiss** (longer than the 4000ms admin success toast)
  because the message is informational + actionable.
- **One-time guarantee** — the `needsCartMigration` check captured at
  effect start AND the immediate `markCartMigrated()` call together
  ensure the toast fires exactly once per buyer per browser. A
  refresh (or a re-render mid-session) finds `version === '1.3'` and
  the predicate returns false.

## Toast wiring

The toast is rendered conditionally on `showMigrationToast` state. Its
`onDismiss` callback sets `showMigrationToast(false)`. The component
also auto-fires `onDismiss` after 6000ms via its internal `setTimeout`,
which is correctly cleaned up on unmount. The `useEffect` that fires the
toast adds it to the deps list so re-renders triggered by the
reconciliation mutations don't loop (the `shouldFireToast` flag is
captured ONCE at the top of the effect from `startState`, then guarded).

## Files modified (final)

| File | Change |
|------|--------|
| src/lib/store/cart-store.ts | + version field, partialize widening, markCartMigrated, needsCartMigration |
| src/lib/store/__tests__/cart-store.test.ts | NEW — 8 tests for sentinel + helpers |
| src/components/cart-migration-toast.tsx | NEW — D-12 informational toast |
| src/components/__tests__/cart-migration-toast.test.tsx | NEW — 4 tests for render/dismiss/timeout/cleanup |
| src/app/cart/cart-page-client.tsx | 5-step reconciliation; toast rendering in empty + items branches |
| src/app/cart/__tests__/cart-reconciliation.test.tsx | NEW — 8 reconciliation contract tests |

## Phase 20 (both plans) test summary

- Baseline (Phase 19): 403 + 2 skipped = 405 / 36 files
- After Plan 20-01: 423 + 2 skipped = 425 / 38 files (+20)
- After Plan 20-02: **443 + 2 skipped = 445 / 41 files** (+20)
- Total Phase 20 additions: **+40 tests** (+5 files)

## Smoke test scenarios (manual; not automated)

These match D-15's expectations and complement the reconciliation tests
above. They document the buyer experience but do not require running.

1. **Legacy v1.2 cart with 5-segment keys** — first load shows the
   migration toast once; reload no longer shows it; cart entries are
   the 4-segment aggregated keys with summed quantities clamped to
   current stock.
2. **First-ever visit (no localStorage)** — the toast fires once over
   an empty cart (D-15 edge); a refresh shows no toast.
3. **Existing v1.3 cart with qty > current stock** — silent clamp;
   no toast.

## Next: Phase 20 complete

Both plans 20-01 (server) and 20-02 (client) are GREEN. Phase 20
satisfies AGG-01 (storefront aggregation), AGG-02 (binder names never
appear in any public surface — type-enforced + per-route invariants),
and AGG-03 (legacy v1.2 cart keys reconcile forward with one-time
informational toast). STATE.md and ROADMAP.md updates can advance the
phase to "done" via the manager workflow.
