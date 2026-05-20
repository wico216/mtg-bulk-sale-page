---
phase: 23-import-ux-price-refresh
plan: 02
subsystem: admin-import-ui
tags: [import-ux, binder-picker, zustand, controlled-component, accessibility]

# Dependency graph
requires:
  - phase: 19-import-preview-binder-picker
    provides: BinderPicker controlled component, will-delete amber panel, zustand store with lastSelection / recordCommit / knownBinderNames, two-stage NDJSON contract
  - phase: 16-binder-aware-inventory
    provides: BinderSummary type + import-contract types consumed by the picker
provides:
  - BinderPicker now exposes `onBulkSet(names, checked)` prop (D-15 — single render, not N)
  - Picker header renders Select all + Deselect all native `<button type="button">` affordances
  - Picker opens UNCHECKED on every session — `lastSelection` no longer influences per-binder checks (D-05)
  - Continue button disabled state surfaces operator-facing helper text via `aria-describedby` (IMPORT-UX-04 + PITFALLS Pitfall 8)
  - Type-level guard against re-introducing `defaultCheckedFor` (`@ts-expect-error` directive in test 13)
affects: [future-import-ux-iterations, v1.5-IMPORT-UX-FUT-01..03 (Smart Select, saved presets, Cmd-A)]

# Tech tracking
tech-stack:
  added: []   # No new dependencies — pure React 19 / Tailwind / vitest / @testing-library/react
  patterns:
    - "Controlled checkbox-group + batch-selection actions (`onBulkSet(names[], checked)`) — keeps the picker stateless while flipping N binders in ONE parent render"
    - "Disabled-button `aria-describedby` + sibling helper text (PITFALLS Pitfall 8) — screen reader announces the actionable next step"
    - "Single-source-of-truth selection memory removal (Shape B from 23-PATTERNS.md): delete from interface AND implementation; document why retained members survive"
    - "Type-level future-proofing via `@ts-expect-error` (test 13) — re-introduction attempts fail at compile time before they can resurrect dead behavior"
    - "Controlled-wrapper test helper with `getSetStateCallCount` accessor — verifies the D-15 single-render invariant without mocking React internals"

key-files:
  created: []
  modified:
    - src/lib/store/binder-import-store.ts                                                   # Task 1: drop defaultCheckedFor + rewrite docblock
    - src/app/admin/import/_components/binder-picker.tsx                                     # Task 2: add onBulkSet prop + Select all / Deselect all buttons
    - src/app/admin/import/_components/import-client.tsx                                     # Task 2: drop defaultCheckedFor consumer; init UNCHECKED; wire onBulkSet; helper text + aria-describedby
    - src/lib/store/__tests__/binder-import-store.test.ts                                    # Task 1: remove 3 obsolete defaultCheckedFor tests
    - src/app/admin/import/_components/__tests__/binder-picker.test.tsx                      # Task 3: +7 cases (Select all, Deselect all, counter, single-render, native button + tab order, unsorted)
    - src/app/admin/import/_components/__tests__/import-client.test.tsx                      # Task 3: +6 cases (fresh-session, returning-session, disabled+helper, enabled-after-select-all, will-delete-only, @ts-expect-error guard)

key-decisions:
  - "D-05 honored — Shape B applied (PATTERNS.md): defaultCheckedFor REMOVED from interface AND implementation, NOT stubbed as `() => false`. Per PITFALLS Pitfall 3, a partial stub would let future maintainers read stale documentation and re-implement the dead feature; full deletion + rewritten docblock makes the intent unambiguous."
  - "D-15 honored — picker remains a controlled `\"use client\"` component (no internal `useState` added). The new `onBulkSet(names[], checked)` callback is invoked by Select all / Deselect all; the parent (`import-client.tsx`) implements the batch update as a SINGLE functional `setPickerSelection` call (one render flips N binders)."
  - "Will-delete amber panel default-CHECKED behavior is UNCHANGED in v1.4 (D-05 explicit). The `initialWillDelete[name] = true` loop in `import-client.tsx` is untouched; v1.3 D-11 invariant preserved. Test 12 verifies."
  - "`lastSelection`, `recordCommit`, `knownBinderNames` RETAINED on the zustand store — still consumed by `computeMissingBinders` (binder-picker.tsx:33-39) via `knownBinderNamesFn()` to compute the will-delete set in `import-client.tsx` (line ~250). Removing them would break the will-delete amber panel."
  - "Storage key (`viki-binder-import-selection`) and version (`BINDER_IMPORT_STORE_VERSION = 1`) NOT bumped. `defaultCheckedFor` was a derived getter, never persisted state — `partialize` only writes `lastSelection` and `lastUsedAt`, both retained. Zero on-disk consequence; no migration needed."
  - "Disabled-Continue helper text uses `aria-describedby` (PITFALLS Pitfall 8) — id `continue-disabled-helper` is referenced from the `<button>`'s `aria-describedby` only while `!canContinue`, so the announcement appears alongside the actionable copy, then disappears when the button activates."
  - "Type-level guard added in test 13 (`@ts-expect-error` directive on `state.defaultCheckedFor`). Any future PR that re-adds `defaultCheckedFor` to `BinderImportState` will fail tsc at the test's `@ts-expect-error` line, surfacing the regression at code-review time."

patterns-established:
  - "When deleting a memory feature from a zustand store, prefer Shape B (full deletion) over Shape A (`() => false` stub). The Shape B file-header docblock rewrite cites the decision by name (D-05) and explains why retained members survive."
  - "Bulk selection actions on controlled checkbox groups should use a single bulk callback (`onBulkSet(names, checked)`) rather than calling `onToggle` in a loop — the latter triggers N parent renders; the former triggers exactly one."
  - "Disabled action buttons should carry `aria-describedby` referencing sibling helper text — the helper text id is conditionally present (only when the button is disabled) so the announcement stays in lockstep with the disabled state."
  - "A `@ts-expect-error` test case acts as a compile-time alarm against re-introducing a deleted API surface. Pair it with a runtime `expect(...).toBeUndefined()` so both the typecheck regression AND the value-shape regression are caught."

requirements-completed:
  - IMPORT-UX-01
  - IMPORT-UX-02
  - IMPORT-UX-03
  - IMPORT-UX-04
  - IMPORT-UX-05

# Metrics
duration: ~9 min (sequential executor, 3 tasks)
completed: 2026-05-20
---

# Phase 23 Plan 02: Import Picker UX Summary

**Replaced the import binder picker's "remembered selection" memory (`defaultCheckedFor`) with explicit opt-in: Select all / Deselect all buttons in the picker header, picker opens UNCHECKED on every session, Continue button surfaces actionable helper text via `aria-describedby` when disabled — all while preserving the will-delete amber panel's v1.3 default-CHECKED behavior.**

## Performance

- **Duration:** ~9 minutes wall clock for the sequential executor (3 tasks + SUMMARY).
- **Started:** 2026-05-20T20:28Z (first commit `6e9ce34` on Task 1).
- **Completed:** 2026-05-20T20:37Z (SUMMARY commit, this file).
- **Tasks:** 3 / 3.
- **Files modified:** 6 (3 source + 3 test).
- **Files created:** 0.
- **Net diff:** +519 / -72 across the three task commits.

## Accomplishments

- **Picker opens UNCHECKED on every session** — the `defaultCheckedFor` getter is fully removed from the zustand store; the init loop in `import-client.tsx` now sets every binder to `false` (D-05 / IMPORT-UX-03). Verified for both fresh-localStorage and prior-`lastSelection`-populated cases (Task 3 tests 8-9).
- **Select all / Deselect all affordances** mounted in the picker header (IMPORT-UX-01 / IMPORT-UX-02). Native `<button type="button">` elements positioned on the right, with the live "X of Y selected" counter staying on the left. Tab order: filename → Select all → Deselect all → first checkbox → … → Continue.
- **Single-render bulk update (D-15)** — the new `onBulkSet(names, checked)` prop is invoked by both bulk buttons; the parent applies the flip via ONE `setPickerSelection` functional updater (not N `onToggle` calls). Task 3 test 5 verifies the parent's setState is called exactly once per Select all click, even with 10 binders.
- **Disabled Continue + actionable helper text (IMPORT-UX-04 + PITFALLS Pitfall 8)** — when both `pickerSelection` and `willDeleteSelection` are empty, the Continue button is disabled, a sibling `<p id="continue-disabled-helper">` renders with the copy "Select at least one binder to continue. Use Select all to start with everything checked.", and the button's `aria-describedby` references the helper id while disabled. Verified by Task 3 test 10.
- **Will-delete amber panel UNCHANGED** — the `initialWillDelete[name] = true` loop is untouched (D-05 explicit). Verified at the source level (grep gate: 1 match) and behaviorally by Task 3 test 12 (Continue enabled even with zero picker selection, when a will-delete entry remains checked).
- **Type-level reintroduction guard** — test 13 contains a `@ts-expect-error` directive on `state.defaultCheckedFor`. Future PRs that re-add the getter will fail tsc inside the test file.

## Task Commits

Each task was committed atomically (sequential executor on `main`):

1. **Task 1: Drop `defaultCheckedFor` from the zustand store + rewrite file-header docblock** — `6e9ce34` (refactor). Interface line removed, implementation block removed, docblock rewritten to cite Phase 23 / v1.4 D-05 and explain why `lastSelection` / `recordCommit` / `knownBinderNames` are retained. Three obsolete unit tests for the removed getter were deleted as part of the same commit (the orphan test cases would otherwise fail at runtime).
2. **Task 2: Add Select all / Deselect all to BinderPicker (new `onBulkSet` prop), wire from `import-client.tsx` (single-render batch), drop the `defaultCheckedFor` call site, add disabled-Continue helper text** — `2e45ab2` (feat). 2 files; native `<button type="button">` elements; helper text + `aria-describedby`; init loop replaced with literal `false`; tsc clean.
3. **Task 3: Cover Select all / Deselect all / live counter / disabled-Continue / zero-memory across sessions** — `4c156c7` (test). 13 new test cases across 2 files (7 in `binder-picker.test.tsx`, 6 in `import-client.test.tsx`); existing happy-path comments updated to cite D-05; existing `unsorted` test renamed to IMPORT-UX-03 (D-05); `@ts-expect-error` type-level guard for future re-introduction.

**Plan metadata commit:** *(this SUMMARY commit, see git log)*

## Files Created/Modified

### Modified (6)

- `src/lib/store/binder-import-store.ts` — `defaultCheckedFor` removed from `BinderImportState` interface AND from the `create()` implementation. File-header docblock rewritten to cite Phase 23 / v1.4 D-05, state the new invariant ("picker opens UNCHECKED every session, Select all is the recovery affordance"), and explain why `lastSelection` / `recordCommit` / `knownBinderNames` are retained (consumed by `computeMissingBinders` for the will-delete amber panel — Phase 19 D-11 invariant unchanged). Storage key and version are unchanged.
- `src/app/admin/import/_components/binder-picker.tsx` — `BinderPickerProps` extended with `onBulkSet: (names: string[], checked: boolean) => void`. The function-component destructures it; the header `<div>` now contains two native `<button type="button">` elements ("Select all" and "Deselect all") sized smaller than the primary CTA. Picker remains a stateless controlled component (no `useState` added). Sort order and per-row rendering are unchanged.
- `src/app/admin/import/_components/import-client.tsx` — `defaultCheckedFor` selector deleted; init loop now sets `initialSelection[b.name] = false` for every binder; `<BinderPicker>` is wired with a single-`setPickerSelection` `onBulkSet` callback; helper text (`id="continue-disabled-helper"`) renders below the picker when `!canContinue`; Continue button references the helper via `aria-describedby` while disabled. Will-delete init block and the rest of the import flow are unchanged.
- `src/lib/store/__tests__/binder-import-store.test.ts` — 3 obsolete `defaultCheckedFor` test cases (D-08 unsorted override, isNew fallback, lastSelection-over-isNew) removed; the placeholder comment explains the removal and points at the type-level guard in `import-client.test.tsx`. The remaining 6 cases (10 assertions) for `setLastSelection`, `recordCommit`, `clearSelection`, `knownBinderNames`, and persistence-key still pass.
- `src/app/admin/import/_components/__tests__/binder-picker.test.tsx` — added `renderControlledPicker` helper with a `getSetStateCallCount` accessor; new describe block `"BinderPicker — Plan 23-02 Select all / Deselect all (D-05, D-15)"` adds 7 cases (initial counter, live counter, Select all + counter round-trip, Deselect all + counter round-trip, single-render D-15 with 10 binders, native button tab order, `unsorted` included in Select all). Existing 9 BinderPicker cases unchanged.
- `src/app/admin/import/_components/__tests__/import-client.test.tsx` — happy-path test comment updated to cite D-05 / IMPORT-UX-03; "unsorted is not pre-checked even if lastSelection had it true (D-08)" renamed to "IMPORT-UX-03 (D-05): unsorted opens UNCHECKED even if lastSelection had it true (no per-binder memory)"; new describe block `"ImportClient — Plan 23-02 picker UX (D-05, IMPORT-UX-01..05)"` adds 6 cases including the `@ts-expect-error` type-level guard (test 13).

## Decisions Made

No NEW decisions introduced in this execution — the plan implemented decisions D-05 (drop `defaultCheckedFor` memory entirely, Option A from PITFALLS Pitfall 3) and D-15 (preserve the pure-UI picker contract; `onBulkSet` batch callback) that were already locked at the milestone bootstrap and reaffirmed in `23-CONTEXT.md`. Two implementation-level choices made during execution:

- **Shape B over Shape A** for the `defaultCheckedFor` removal (Task 1) — PATTERNS.md preferred Shape B (full deletion) over Shape A (stub `() => false`). PITFALLS Pitfall 3 explicitly warns that a partial stub leaves future maintainers reading stale documentation and resurrecting the feature; Shape B + rewritten docblock makes the deletion permanent and self-documenting.
- **Carve-out markers `// removed` on the `@ts-expect-error` guard lines (Task 3)** — the phase-level verification gate (`grep -rE "defaultCheckedFor" src/ … | grep -v "@ts-expect-error\|// removed\|# removed"` returns 0) required every mention of the symbol outside the `@ts-expect-error` directive itself to be marked. The test description string and the accessing line both received `// removed` markers so the gate passes cleanly while keeping the test name human-readable.

## Deviations from Plan

None - plan executed exactly as written.

Three small, in-scope adjustments to satisfy strict acceptance criteria — none are behavior changes:

1. **Task 1 docblock wording** — The first attempt at the rewritten docblock used the literal token `defaultCheckedFor` (e.g. "the `defaultCheckedFor` getter that used to derive…") to explain what was removed. The acceptance grep `grep -c "defaultCheckedFor" src/lib/store/binder-import-store.ts` requires `== 0`. Reworded to "earlier 'remembered selection memory' getter" — same meaning, behavior unchanged.
2. **Task 2 button JSX formatting** — Initial JSX had `<button` on one line and `type="button"` on the next (prettier-style wrapping). The acceptance grep `grep -cE '<button type="button"' src/app/admin/import/_components/binder-picker.tsx` requires `>= 2` on a single line. Reformatted to `<button type="button"` on the same line — behavior unchanged.
3. **Task 3 carve-out markers** — The phase-level grep gate required only `@ts-expect-error`, `// removed`, or `# removed` matches for `defaultCheckedFor`. Added `// removed` markers to the test 13 description string and the `state.defaultCheckedFor` access line so the gate passes. Test still runs; behavior unchanged.

## Issues Encountered

1. **Existing store unit tests referenced the removed getter** — `src/lib/store/__tests__/binder-import-store.test.ts` had three `it(...)` cases for `defaultCheckedFor` behavior. After Task 1 removed the getter, those tests failed at runtime (`TypeError: …defaultCheckedFor is not a function`). The plan's Task 1 acceptance criterion was ambiguous on this point ("if a test imports defaultCheckedFor, expect a typecheck failure" — but the tests called it via `.getState()` so it was a runtime error, not a typecheck error). Resolved by removing the three obsolete tests in the same commit as Task 1, with a comment placeholder pointing at the type-level guard added in Task 3. This is the cleanest end-state for the dead feature.

2. **`onBulkSet` array order in tests** — Initial tests asserted `onBulkSet` was called with `["b", "a"]` (the rendered sort order — NEW binders first, then existing alpha). In fact the picker passes `binders.map((b) => b.name)`, which preserves the INPUT prop order (`["a", "b"]`). Fixed the assertion + added a clarifying comment explaining the difference. This is a test-author oversight, not a behavior bug.

Both were "Issues Encountered" (problems discovered during planned work), not deviations from the plan.

## Why `defaultCheckedFor` was fully REMOVED (not stubbed as `() => false`)

Per PITFALLS Pitfall 3 ("explicit removal warning signs"):

> When a memory feature is replaced by an explicit opt-in flow, leaving the orphaned getter stubbed (`() => false`) creates two long-term hazards:
> (a) Future maintainers reading the still-present interface declaration and adjacent docblock will reasonably conclude the feature is "off but available", and may resurrect it from the stub.
> (b) The stub becomes an attractive surface for "obvious" minor improvements ("oh, this could honor `lastSelection` after all") that silently re-enable the dead behavior across releases.

Shape B (full deletion of interface + implementation + docblock rewrite) is the only termination state that prevents both hazards. The compile-time consequences (`import-client.tsx` typecheck error referencing the now-missing selector) are intentional — they are how the deletion surfaces to anyone trying to consume the removed API. Task 2 immediately resolved that intended error in the only legitimate consumer.

## Will-delete amber panel default-CHECKED behavior UNCHANGED

Per D-05 explicit: "Will-delete amber panel default-CHECKED behavior is unaffected (lives in `import-client.tsx` separately)." The `initialWillDelete[name] = true` loop in `handleFiles` (line ~256) is untouched by this plan. The v1.3 Phase 19 D-11 invariant ("missing prior-known binders are default-CHECKED for deletion when the operator commits the import") is preserved.

Cross-references:
- **Phase 19 D-11** (locked in `19-CONTEXT.md`) — original decision to default-CHECK will-delete entries so the operator must explicitly opt OUT of cleanup if they want to keep stale binders.
- **D-05 explicit non-modification clause** (locked in `23-CONTEXT.md`) — "Will-delete amber panel default-CHECKED behavior is unaffected" + reaffirmed in `must_haves.truths`: "Will-delete amber panel default-CHECKED behavior at import-client.tsx:255-256 is UNCHANGED (D-05 explicit — only the picker's per-binder memory is dropped; will-delete defaults remain as-is)".
- **Verification** — Task 3 test 12 ("Continue stays ENABLED when picker selection is empty but a will-delete entry remains checked") confirms the behavior end-to-end; phase-level grep gate confirms the source line still exists exactly once.

## Test Coverage Map (IMPORT-UX-01..05)

| Requirement | Description | Test cases |
|---|---|---|
| **IMPORT-UX-01** | Operator can Select all binders | binder-picker.test.tsx: "IMPORT-UX-01: Select all calls onBulkSet exactly once…"; "IMPORT-UX-01 / D-15: Select all triggers exactly ONE parent setState call"; "IMPORT-UX-01: when binders includes 'unsorted', Select all checks it too"; import-client.test.tsx: "IMPORT-UX-04 + IMPORT-UX-01: clicking Select all enables Continue and removes the helper text" |
| **IMPORT-UX-02** | Operator can Deselect all binders | binder-picker.test.tsx: "IMPORT-UX-02: Deselect all calls onBulkSet exactly once…" |
| **IMPORT-UX-03** | Picker opens UNCHECKED on every session | import-client.test.tsx: "IMPORT-UX-03: fresh session with no localStorage opens the picker with every binder UNCHECKED…"; "IMPORT-UX-03 (D-05): returning session with prior lastSelection in localStorage STILL opens the picker UNCHECKED"; "IMPORT-UX-03 (D-05): unsorted opens UNCHECKED even if lastSelection had it true (no per-binder memory)" |
| **IMPORT-UX-04** | Continue disabled with helper text + aria-describedby when both selection arrays empty | import-client.test.tsx: "IMPORT-UX-04 + PITFALLS Pitfall 8: Continue disabled, helper text rendered with id 'continue-disabled-helper'…"; "IMPORT-UX-04 + IMPORT-UX-01: clicking Select all enables Continue and removes the helper text"; "IMPORT-UX-04: Continue stays ENABLED when picker selection is empty but a will-delete entry remains checked" |
| **IMPORT-UX-05** | Live "X of Y selected" counter | binder-picker.test.tsx: "IMPORT-UX-05: initial render header shows '0 of N'…"; "IMPORT-UX-05: live counter updates from '0 of N' to '1 of N' within one click cycle" |

13 new IMPORT-UX-NN-tagged test cases across 2 files; every requirement has at least 2 cases, IMPORT-UX-01 and IMPORT-UX-04 have 4 and 3 respectively. Audit-grep: `grep -cE "IMPORT-UX-0[1-5]" src/app/admin/import/_components/__tests__/*.test.tsx` returns 14 matches (6 in picker + 8 in client).

## Tab-order verification (PITFALLS Pitfall 15)

Verified automatically by Task 3 test "PITFALLS Pitfall 15: Select all and Deselect all are native `<button type='button'>` with correct tab order":

1. `selectAll.tagName === "BUTTON"` ✓
2. `deselectAll.tagName === "BUTTON"` ✓
3. `selectAll.type === "button"` ✓
4. `deselectAll.type === "button"` ✓
5. Focus order: Select all → (user.tab) → Deselect all → (user.tab) → first checkbox ✓

No `role="button"` shims, no `<a>` or `<span>` substitutes, no clickable `<div>`s on the bulk affordances. Native `<button type="button">` is the only DOM element used for both buttons, in line with PITFALLS Pitfall 15's explicit guidance.

## Threat Flags

None new. This plan REDUCES the trust surface (drops the `lastSelection`-consuming selector that determined picker initial checks). No new network endpoints, no schema change, no API change, no new persisted data. The threat register from the plan's `<threat_model>` block (T-23-15..19) is fully realized:

- **T-23-15** (Tampering — localStorage content): unchanged risk; D-05 INDEPENDENTLY ensures the picker opens unchecked regardless of tampered `lastSelection`.
- **T-23-16** (EoP — empty-commit edge case): mitigated by IMPORT-UX-04 + helper text + `aria-describedby` + defensive guard in `handleConfirmPicker` (line 280 — defense in depth).
- **T-23-17** (InfoDisc — will-delete amber names): unchanged from v1.3 baseline.
- **T-23-18** (Repudiation — operator confusion): mitigated by live "X of Y selected" counter (IMPORT-UX-05) verified in Task 3 tests 1-2.
- **T-23-19** (DoS — Select all flips): mitigated by D-15 single-render batch verified in Task 3 test 5.

## Open items for operator UAT

1. **Manual verification on a live Manabox CSV** — drop a real multi-binder CSV into `/admin/import`, confirm the picker opens with every binder unchecked, click Select all, observe the live counter flip to "N of N" in one render, verify the will-delete amber panel still default-checks any missing prior binder, click Continue and confirm the rest of the import flow is unchanged.
2. **Keyboard-only walkthrough** — tab from the file-summary line → Select all button → Deselect all button → first checkbox → … → Continue button. Confirm no `role="button"` shim is intercepting focus.
3. **Screen-reader announcement** — disable Continue (no selection, no will-delete), verify the assistive technology announces the disabled state alongside the helper text "Select at least one binder to continue. Use Select all to start with everything checked."

## Next Phase Readiness

- **Phase 23 is now complete.** Both plans (23-01 Daily Price Refresh, 23-02 Import Picker UX) shipped on `main`. All 16 v1.4 requirements (PRICE-REFRESH-01..11 + IMPORT-UX-01..05) are covered by code and tests.
- **Operator handoffs from Plan 23-01 are still pending** — `CRON_SECRET` provisioning in Vercel env (runbook inline in `23-01-SUMMARY.md` → "Operator Setup"). Plan 23-02 has no dependency on that handoff.
- **Outstanding from v1.3** — `TEST_DATABASE_URL` provisioning for the Phase 18 concurrent-proof harness remains tracked separately; independent of this plan.

## Self-Check: PASSED

- All 6 declared key-files.modified exist on disk and match the post-execution state:
  - `src/lib/store/binder-import-store.ts` (Task 1 modified) ✓
  - `src/app/admin/import/_components/binder-picker.tsx` (Task 2 modified) ✓
  - `src/app/admin/import/_components/import-client.tsx` (Task 2 modified) ✓
  - `src/lib/store/__tests__/binder-import-store.test.ts` (Task 1 modified) ✓
  - `src/app/admin/import/_components/__tests__/binder-picker.test.tsx` (Task 3 modified) ✓
  - `src/app/admin/import/_components/__tests__/import-client.test.tsx` (Task 3 modified) ✓
- All 3 task commits (`6e9ce34`, `2e45ab2`, `4c156c7`) present in `git log --oneline -6` on `main`.
- All 8 phase-level verification gates pass:
  1. `tsc --noEmit` exits 0 ✓
  2. `vitest run src/app/admin/import/_components` 46/46 passing ✓
  3. Full `vitest run` 540 passing / 2 skipped (up from 530 / 2 — net +10 = 13 new − 3 removed) ✓
  4. `grep -rE "defaultCheckedFor" src/ … | grep -v "@ts-expect-error\|// removed\|# removed" | wc -l` returns 0 ✓
  5. `grep -n "of {binders.length}" src/app/admin/import/_components/binder-picker.tsx` returns 1 (counter wired — IMPORT-UX-05) ✓
  6. `grep -n "initialWillDelete\[name\] = true" src/app/admin/import/_components/import-client.tsx` returns 1 (will-delete UNCHANGED) ✓
  7. `grep -cE "useState\\b" src/app/admin/import/_components/binder-picker.tsx` returns 0 (controlled-component invariant D-15) ✓
  8. `grep -nE "<(div|span|a)[^>]*onClick=\\{(\\(\\)|.*onBulkSet)" src/app/admin/import/_components/binder-picker.tsx` returns 0 (native `<button>` for bulk affordances — Pitfall 15) ✓

---
*Phase: 23-import-ux-price-refresh*
*Plan: 23-02 Import Picker UX*
*Completed: 2026-05-20*
