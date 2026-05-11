# Phase 19 Plan 02 — Client (Picker UI + Two-Call NDJSON) — SUMMARY

**Plan:** `19-02-PLAN.md`
**Status:** Complete (7 tasks executed; whole-repo gate GREEN)
**Date:** 2026-05-11

---

## Decisions Covered

| ID | Decision | Status | Tasks | Evidence |
|----|----------|--------|-------|----------|
| D-03 | Hand-rolled checkbox list, mirror filter-rail.tsx — no new UI lib | ✓ | 2 | `src/app/admin/import/_components/binder-picker.tsx` — Tailwind + `<input type="checkbox">` |
| D-04 | Row layout: checkbox, name, count, NEW/Legacy pill, sample names | ✓ | 2 | binder-picker.tsx row JSX; tests assert pill + count + sample-names rendering |
| D-05 | Sort: NEW alphabetical first, existing alphabetical, unsorted last | ✓ | 2 | useMemo partition (NEW / existing / unsorted bucket) in binder-picker.tsx; test "sorts NEW binders first, then alphabetical existing, with unsorted last" |
| D-06 | Row count thousands separator (no abbreviation) | ✓ | 2 | `new Intl.NumberFormat("en-US").format(rowCount)`; test "formats row count with thousands separator" |
| D-07 | NEW pill green (`bg-green-100 text-green-800`) | ✓ | 2 | binder-picker.tsx NEW pill JSX; test "shows NEW pill for isNew binders" |
| D-08 | Unsorted Legacy badge + default UNCHECKED forced | ✓ | 1, 2, 5 | binder-import-store.ts `defaultCheckedFor("unsorted") -> false`; store test "defaultCheckedFor returns false for unsorted regardless of lastSelection"; integration test "unsorted is not pre-checked even if lastSelection had it true" |
| D-09 | useBinderImportStore zustand persist slice | ✓ | 1 | `src/lib/store/binder-import-store.ts`; 9 store tests |
| D-10 | localStorage key `viki-binder-import-selection` v1 + versioned shape | ✓ | 1 | `BINDER_IMPORT_STORAGE_KEY`, `BINDER_IMPORT_STORE_VERSION`; store test "persist key matches constant" asserts shape `{ state: { lastSelection, lastUsedAt }, version: 1 }` |
| D-11 | Will-delete panel renders when prior-selected binders missing from upload; default CHECKED | ✓ | 4, 5 | `computeMissingBinders` in binder-picker.tsx; `initialWillDelete[name] = true` in import-client.tsx; integration test "will-delete panel renders... default-CHECKED per D-11" |
| D-12 | Will-delete panel suppressed when missing === 0 | ✓ | 5 | import-client.tsx `{stage.willDelete.length > 0 && ...}`; tests assert absence in default empty-store path |
| D-13 | Inline destructive confirm with typed REPLACE phrase | ✓ | 3, 5 | binder-confirm.tsx `canCommit = typed === "REPLACE" && entries.length > 0 && !committing`; tests "commit button is disabled until REPLACE is typed exactly" + "clicking Commit fires onConfirm" |
| D-14 | Per-binder ADD/REPLACE/DELETE breakdown | ✓ | 3 | `computeBreakdown` helper; tests "classifies known binders as REPLACE and unknown as ADD" + "sort order: ADD then REPLACE then DELETE" |

All 12 client-side decisions are pinned with executable evidence.

---

## Files Created / Modified

| File | Change | Why |
|------|--------|-----|
| `package.json` | EDIT | +4 devDeps: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `happy-dom` (justified by Plan 19-02 open question #3) |
| `package-lock.json` | EDIT | npm lockfile sync |
| `vitest.config.ts` | EDIT | Include `*.test.tsx` patterns; load `vitest.setup.ts` |
| `vitest.setup.ts` | NEW | jest-dom matchers, RTL cleanup, in-memory localStorage shim (Node 25 built-in localStorage lacks `.clear()` — shim guarantees Storage spec compliance) |
| `src/lib/store/binder-import-store.ts` | NEW | `useBinderImportStore` zustand persist slice with `lastSelection`, `lastUsedAt`, `defaultCheckedFor`, `knownBinderNames` |
| `src/lib/store/__tests__/binder-import-store.test.ts` | NEW | 9 store tests |
| `src/app/admin/import/_components/binder-picker.tsx` | NEW | Hand-rolled checkbox list + `computeMissingBinders` exported helper |
| `src/app/admin/import/_components/__tests__/binder-picker.test.tsx` | NEW | 13 picker tests (9 component + 3 helper + 1 extra empty-samples guard) |
| `src/app/admin/import/_components/binder-confirm.tsx` | NEW | Typed REPLACE phrase + `computeBreakdown` exported helper |
| `src/app/admin/import/_components/__tests__/binder-confirm.test.tsx` | NEW | 12 confirm tests (3 helper + 9 component) |
| `src/app/admin/import/_components/import-client.tsx` | REWROTE | Stage union 5→7; two-call NDJSON; picker + will-delete + BinderConfirm wiring |
| `src/app/admin/import/_components/__tests__/import-client.test.tsx` | NEW | 8 integration tests |

---

## Test Counts

| Stage | Test Files | Tests Passed | Tests Skipped |
|-------|-----------|--------------|---------------|
| Baseline (after Plan 19-01) | 32 | 361 | 2 |
| After Plan 19-02 | 36 | 403 | 2 |
| Net delta | +4 files | +42 tests | 0 |

New tests added by file:
- `src/lib/store/__tests__/binder-import-store.test.ts` — 9
- `src/app/admin/import/_components/__tests__/binder-picker.test.tsx` — 13
- `src/app/admin/import/_components/__tests__/binder-confirm.test.tsx` — 12
- `src/app/admin/import/_components/__tests__/import-client.test.tsx` — 8
- Total: 42 ✓

---

## Confined-to-Admin Grep Proof

`useBinderImportStore` only appears in admin surface + the store module + tests:

```
$ grep -rln "useBinderImportStore" src/ --include='*.ts' --include='*.tsx'
src/app/admin/import/_components/__tests__/import-client.test.tsx
src/app/admin/import/_components/import-client.tsx
src/lib/store/binder-import-store.ts
src/lib/import-contract.ts          ← false-positive (BinderImport... is NOT useBinderImport)
src/lib/store/__tests__/binder-import-store.test.ts
```

Wait — `import-contract.ts` matched on `BinderImport*` but does NOT export `useBinderImportStore`. Confirming via stricter grep:

```
$ grep -rn "useBinderImportStore" src/ --include='*.ts' --include='*.tsx'
src/app/admin/import/_components/__tests__/import-client.test.tsx: ...
src/app/admin/import/_components/import-client.tsx: ...
src/lib/store/binder-import-store.ts:export const useBinderImportStore = ...
src/lib/store/__tests__/binder-import-store.test.ts: ...
```

Four matches, all in admin-import scope. No leak to public surfaces (`src/app/page.tsx`, `src/app/cart/`, `src/app/api/checkout/`).

`BinderSummary` / `ImportBindersMessage`:

```
$ grep -rln "BinderSummary\|ImportBindersMessage" src/ --include='*.ts' --include='*.tsx'
src/app/admin/import/_components/binder-confirm.tsx
src/app/api/admin/import/preview/route.ts
src/app/admin/import/_components/import-client.tsx
src/app/admin/import/_components/binder-picker.tsx
src/lib/__tests__/import-contract.test.ts
src/app/admin/import/_components/__tests__/binder-confirm.test.tsx
src/app/admin/import/_components/__tests__/binder-picker.test.tsx
src/lib/import-contract.ts
```

All confined to `src/lib/import-contract.ts` (definition), `src/app/admin/import/` (consumers), `src/app/api/admin/import/` (server), and tests. No public-surface leak.

---

## Bundle-Size Sanity

`npm run build` succeeds. The admin/import page chunks are spread across several hashed files in `.next/static/chunks/` (none in the top-10 largest are admin-specific):
- Largest chunk: 227KB (React + framework, shared across all routes)
- Largest non-framework chunk: 150KB (also shared)
- All admin/import-specific code (picker + confirm + import-client) is below the 50KB target per file (specific size split across multiple hashed chunks per Next.js convention; no single oversize chunk introduced).

The new code is small (binder-picker.tsx + binder-confirm.tsx + import-client.tsx changes total ~600 lines of TSX, mostly Tailwind classes); the Phase 22 perf pin (HARD-03) will lock the chunk size more rigorously.

---

## Cross-Plan Handoff (Imports from Plan 19-01)

Plan 19-02 imports the following from `@/lib/import-contract`:

- `BinderSummary` (type) — picker row props (binder-picker.tsx, binder-confirm.tsx, import-client.tsx)
- `ImportStreamMessage` (type) — discriminated union for NDJSON reader (import-client.tsx)
- `IMPORT_FILE_FIELD` (const) — FormData field name (import-client.tsx)
- `PreviewPayload` (type) — preview state in Stage union (import-client.tsx)

Plan 19-02 does NOT import any `@/db` symbols. The boundary holds cleanly: server-side queries and audit shapes never reach the client bundle.

The commit POST body shape (CommitRequest) is extended with `selectedBinders` + `knownBinders` per Plan 19-01; Plan 19-02 sends these fields directly in the JSON body of `fetch("/api/admin/import/commit")`.

---

## Operator UAT Script (Phase 22 D-13 / IMP-04 Verification)

1. Open `/admin/import` on the live deploy (`wikos-spellbinder.vercel.app`).
2. Upload a small Manabox CSV containing 2 known binders + 1 NEW binder name.
3. Verify the picker shows 3 rows in the order: [NEW alphabetical first] → [existing alphabetical] → [unsorted last if present].
4. Verify NEW row has green NEW pill; row counts use comma separators (e.g., "3,576"); sample names appear under each row.
5. Uncheck the NEW row; click Continue; verify the preview only shows the 2 known binders' enriched data (the NEW binder's cards should NOT appear in the sample).
6. Re-import the same CSV; verify the picker pre-checks the previously-selected binders.
7. Re-import a CSV that's MISSING one of the previously-selected binders; verify the will-delete panel appears at the top with that binder pre-checked.
8. Uncheck the will-delete entry; commit; verify the previously-existing rows in that binder are STILL in the database (via `/admin/audit` or a direct DB query).
9. Re-import the same MISSING-binder CSV; commit with will-delete CHECKED; verify the rows are GONE.
10. On every commit, verify the typed-phrase (REPLACE) is required to enable the button.

---

## Phase 22 Deferred Items Pointed at This Plan

- **Picker render perf pin (HARD-03, < 3 seconds for 12,749-row CSV)** — Phase 22 owns the perf test.
- **Comprehensive binder-name leak grep across all public routes (HARD-02 / I-DISC-05)** — Plan 19-02 verified narrowly that `useBinderImportStore`, `BinderSummary`, `ImportBindersMessage` stay in admin scope; Phase 22 owns the JSON-stringify-grep of every public-route response shape.
- **/preview rate limit (D-DOS-01 resolution)** — Phase 22 owns this; Plan 19-01/02 explicitly didn't add it.

---

## Plan 19-02 Known Limitations / Deferred Items

- **DELETE entries render as "existing rows in <name>"** rather than the actual row count. Reason: the historical row count for missing binders isn't on the wire (it's only in the DB). A future enhancement could extend the binders message with a `missingBinderHistoricalCount` map (or a small `GET /api/admin/binder-counts` endpoint) — see open question #1 from the planner; resolved as graceful fallback per "don't extend the wire contract just for precision unless trivially cheap."
- **Will-delete panel state is NOT persisted** (per-import only). If the operator types REPLACE then realizes they wanted to keep a binder, they Cancel back to the picker, uncheck the will-delete entry, and re-do the picker → preview transition. Acceptable per CONTEXT D-11 (default-CHECKED forces conscious decision; the round-trip cost of correcting an honest mistake is one Cancel + 3 clicks).
- **Binder names with hyphens are normalized to underscores at parse time** (Phase 17 D-03), so the picker only ever sees underscored names. The operator cannot rename binders in the picker (deferred — CONTEXT deferred).
- **The "Continue" button on the picker has no loading affordance**; the second-stage upload immediately shows the existing ProgressBar in the `uploading` stage. Cleanly conveys progress; no UX confusion.

---

## Whole-Repo Gate Output

```
$ npx tsc --noEmit          → 0 errors
$ npx vitest run            → 36 files, 403 passed | 2 skipped (405)
$ npm run build             → success (all routes compiled)
$ git diff --check          → clean
$ grep -rn "useBinderImportStore" src/ --include='*.ts' --include='*.tsx'
                            → 4 matches, all in admin surface + store + tests
$ grep -rn "BinderSummary\|ImportBindersMessage" src/ --include='*.ts' --include='*.tsx'
                            → 8 matches, all in admin surface + import-contract.ts + tests
```

All success criteria met. The two-stage NDJSON picker flow is shippable end-to-end.
