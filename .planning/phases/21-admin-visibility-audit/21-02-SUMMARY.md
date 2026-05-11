---
phase: 21-admin-visibility-audit
plan: 02
status: complete
date: 2026-05-11
---

# Plan 21-02 SUMMARY — Order Detail [binder] Annotation + Audit Metadata Rendering

## What landed

Two admin-visibility surfaces now reflect Phase 19's scoped-binder
import contract and Phase 18's per-binder allocator output:

1. **Order detail `[binder]` pill** — every order line item renders
   `<span data-binder-pill>[{item.binder}]</span>` inline with the
   card name. Sourced exclusively from `item.binder` (the
   `order_items.binder` snapshot loaded by `getOrderById()`); NEVER
   joined to live `cards`. Survives re-imports that delete the source
   row. Multi-binder same-card lines render as multiple rows
   (React key now `${cardId}-${binder}-${quantity}`); legacy pre-v1.3
   rows render `[unsorted]` literally via the same template.
2. **Audit page `inventory.import_commit` expander** — a new client
   island `<ImportCommitDetails>` is mounted only for
   `inventory.import_commit` rows. Collapsed by default with a
   one-line summary `Replaced N binders (R rows)` and a
   `Show details` button; expanded view renders five sections per
   CONTEXT D-10 (Selected binders, New, Missing, Per-binder counts
   with `→` arrow, Total inventory after). Other action types keep
   the existing `metadataPreview()` rendering unchanged. A
   type-guard at the boundary gracefully degrades legacy
   pre-Phase-19 import_commit rows to inline preview rendering.

## Tasks completed (6/6)

| # | Task | Commit |
|---|------|--------|
| 1 | OrderDetail [binder] pill (D-05/D-06/D-07/D-08) | `7d5b74b` |
| 2 | OrderDetail tests pin pill rendering (5 tests) | `fc9114a` |
| 3 | ImportCommitDetails client island (D-09/D-10 expander) | `f58c99c` |
| 4 | Wire ImportCommitDetails into AuditTable (D-09/D-11) | `de47fba` |
| 5 | AuditTable tests pin expander behavior (8 tests) | `632f490` |
| 6 | Repo gate: tests + tsc + build green | (this) |

## Test results

- Baseline (after Plan 21-01): 447 passed + 2 skipped (449) across 42 files
- After Plan 21-02: **460 passed + 2 skipped (462)** across 44 files
- Net delta (this plan): +13 tests across +2 files
  - `order-detail.test.tsx` — 5 tests (D-05, D-06, D-07, D-08 pinned)
  - `audit-table.test.tsx` — 8 tests (collapsed default, expand,
    collapse, → arrow, dual (none) labels, D-11 fallback,
    graceful degradation)
- Phase 21 cumulative net delta: +17 tests across +3 files
  (admin-cards-binder-filter + order-detail + audit-table)

## Verification gate

- `npx vitest run` → 460/462 pass, 0 fail
- `npx tsc --noEmit` → 0 errors
- `npm run build` → succeeds (Next 16 production build)
- `git diff --check` → clean

## Critical decisions (no deviation)

- **`[binder]` reads from `item.binder` SNAPSHOT, NEVER joined to live
  `cards`.** Verified by Test 4 (D-06): a deliberately mismatched
  cardId still renders `[a02]` proving the rendering reads the
  snapshot, not a join. Grep proof: zero hits for
  `cards.binder|join.*cards|leftJoin.*cards` in `order-detail.tsx`
  source code (only the explanatory comment mentions the prohibition).
- **Multi-binder same-card lines render as multiple rows.** React key
  changed from `${cardId}-${quantity}` to `${cardId}-${binder}-${quantity}`
  so two OrderItem rows with the same name/cardId-prefix but different
  binder/cardId-suffix reconcile as distinct DOM nodes. Verified by
  Test 3 (`a02Pill` !== `a05Pill`).
- **Historical pre-v1.3 rows render `[unsorted]` explicitly.** Same
  template — the Phase 16 D-09 migration default is `binder='unsorted'`
  so `getOrderById` always returns a string. No conditional branch.
- **`ScopedImportAuditMetadata` only captures `totalCardsAfterImport`**;
  the expander renders `Total inventory after: N` only (no
  `before → after` math).
- **Single-select per-row state isolation.** Each `<ImportCommitDetails>`
  has its own `useState(expanded)`. Test 3 verifies the toggle round-trip
  on a single row; multiple rows would behave independently because
  each instance has its own state slot.

## Planner deviations honored

3. **`ImportCommitDetails` extracted as separate client island.**
   `audit-table.tsx` stays a server component (grep confirms zero
   `"use client"` directive). The interactive expander is isolated
   in its own file with `"use client"` at the top.
4. **Expanded audit view shows "Total inventory after: N" only.**
   `ScopedImportAuditMetadata` only captures `totalCardsAfterImport`,
   not `totalCardsBeforeImport`. Render only the AFTER value (more
   honest than fabricating a before from the per-binder deltas).

## Open questions resolved in-flight

1. **Show/Hide text button vs chevron icon** → text button. The
   pattern is already used elsewhere ("Clear filters", "Sign out");
   chevron icons would be visual noise for a per-row toggle.
2. **Per-binder counts list element** → `<ul class="ml-4 mt-1
   list-disc">` with `<li class="font-mono">` — readable,
   accessibility-compliant (semantic list), and keeps each binder
   count on its own line.
3. **Per-row state isolation** → verified by Test 3 (toggle round-trip).
   useState slots per component instance — no explicit independence
   test added because React's component model already guarantees this
   and the test would be redundant.
4. **Dark-mode `[binder]` pill color** → `dark:bg-zinc-800
   dark:text-zinc-300` matches the established StatusBadge pattern.

## Requirements satisfied

- **ADM-01**: order detail [binder] annotation on every line item,
  snapshot-sourced ✓ (Tasks 1 + 2)
- **ADM-03**: audit page renders new ScopedImportAuditMetadata fields
  ✓ (Tasks 3 + 4 + 5)

## Decisions traceability

| Decision | Status | Where |
|----------|--------|-------|
| D-05 | ✓ | Task 1 Tailwind class set verbatim; Task 2 Test 1 asserts the classes |
| D-06 | ✓ | Task 1 reads `item.binder`; Task 2 Test 4 pins behavior with deliberately mismatched cardId |
| D-07 | ✓ | Task 1 React key disambiguates by binder; Task 2 Test 3 asserts two distinct pills |
| D-08 | ✓ | Task 1 same template; Task 2 Test 2 asserts `[unsorted]` literal |
| D-09 | ✓ | Task 4 routes inventory.import_commit to ImportCommitDetails |
| D-10 | ✓ | Task 3 collapsed-by-default expander; Task 5 Tests 1, 2, 3 pin both states + toggle |
| D-11 | ✓ | Task 4 conditional preserves metadataPreview; Task 5 Test 7 pins this |

## Out of scope (deferred per CONTEXT)

- ADM-FUT-01 through ADM-FUT-04 (research P2 deferrals → v1.3.x)

## Next

Phase 21 complete. Phase 22 (Hardening & UAT) executes against this
baseline.

---

*Plan 21-02 SUMMARY — created 2026-05-11*
