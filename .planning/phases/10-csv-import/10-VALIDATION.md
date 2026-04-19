---
phase: 10
slug: csv-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (installed; `vitest.config.ts` present) |
| **Config file** | `vitest.config.ts` — includes `src/**/__tests__/**/*.test.ts`, env `node`, `@` → `./src` alias |
| **Quick run command** | `npx vitest run <path-of-file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds (current project size) |

> **Wave 0 ergonomics:** `package.json` has no `"test"` script — add `"test": "vitest run"` so `npm test` works (optional but recommended).

---

## Sampling Rate

- **After every task commit:** `npx vitest run <path-of-file-just-touched>` (< 2s)
- **After every plan wave:** `npx vitest run` (full suite, ~10s)
- **Before `/gsd:verify-work`:** Full suite green + manual smoke of `/admin/import` (upload → preview → confirm → toast → storefront)
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-XX | 01 (lib refactor) | 0 | CSV-02 | unit | `npx vitest run src/lib/__tests__/csv-parser-content.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-XX | 01 (lib refactor) | 0 | CSV-02, D-09 | unit | `npx vitest run src/lib/__tests__/enrichment-progress.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-XX | 01 (db helper) | 0 | CSV-01 | unit | `npx vitest run src/db/__tests__/replace-all-cards.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-XX | 02 (preview route) | 1 | CSV-01, CSV-02 | unit (Route Handler) | `npx vitest run src/app/api/admin/import/__tests__/preview.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-XX | 02 (commit route) | 1 | CSV-01 | unit (Route Handler) | `npx vitest run src/app/api/admin/import/__tests__/commit.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-XX | 03 (admin UI) | 2 | CSV-02, D-01..D-07, D-12, D-15 | manual smoke | browser visit to `/admin/import` | — | ⬜ pending |
| 10-03-XX | 03 (cart patch) | 2 | D-13 | component test (optional) or manual | `npx vitest run src/app/cart/__tests__/cart-page-client.test.tsx` or manual | ❌ W0 (optional) | ⬜ pending |
| 10-03-XX | 03 (storefront) | 2 | D-16 | manual smoke | visit `/` after import | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs (`10-XX-YY`) are placeholders — planner assigns concrete IDs; every task in the plan must appear in this table once plans are finalized.*

---

## Wave 0 Requirements

- [ ] `package.json` — add `"test": "vitest run"` script (optional ergonomics)
- [ ] `src/db/__tests__/replace-all-cards.test.ts` — stubs for CSV-01 (atomic batch, rollback-on-failure, empty-array deletes all)
- [ ] `src/lib/__tests__/csv-parser-content.test.ts` — stubs for CSV-02 (valid parse, per-row skip with number + reason)
- [ ] `src/lib/__tests__/enrichment-progress.test.ts` — stubs for CSV-02 + D-09 (onProgress invoked N times in order, scryfallMisses[] populated)
- [ ] `src/app/api/admin/import/__tests__/preview.test.ts` — stubs for 401, non-`.csv` rejection, NDJSON progress+result stream shape
- [ ] `src/app/api/admin/import/__tests__/commit.test.ts` — stubs for 401, missing-payload rejection, `replaceAllCards` invocation
- [ ] (Optional) `src/app/cart/__tests__/cart-page-client.test.tsx` — stubs for D-13 (stale IDs silently removed)

*Vitest already installed — no framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-drop zone accepts file and shows name | D-03 | Browser interaction | `pnpm dev` → `/admin/import` → drop a Manabox CSV → filename visible |
| Live "X / Y cards enriched" counter renders during preview | D-09 | Visual streaming | Upload CSV → watch counter tick up during enrichment |
| Preview summary + 20-card sample + expandable skipped-rows section | CSV-02, D-05 | Visual layout | Upload CSV → confirm all three zones render |
| Confirm button label includes delta "replace N with M" | D-12 | Visual copy check | Upload CSV → verify button text shows current-count→new-count |
| Post-commit redirect to `/admin` + toast "Imported N cards (M skipped)" | D-15 | Visual flow | Click Confirm → land on `/admin` with toast |
| Storefront reflects new inventory after import | CSV-01, D-16 | Cross-page flow | After commit, visit `/` → new cards present, removed cards gone |
| Stale cart items from prior inventory silently disappear | D-13 | Cross-session flow | Add item to cart → import CSV that removes that card → revisit `/cart` → item is gone (no banner) |
| Cancel from preview returns to blank `/admin/import` | D-07 | Visual flow | Upload → click Cancel → back at empty drag-drop |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`npx vitest run` only, never `npx vitest`)
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
