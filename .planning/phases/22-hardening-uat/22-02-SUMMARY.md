# Plan 22-02 — Summary (perf pin + UAT runbook)

**Wave:** 2 (Phase 22, v1.3 final phase)
**Date completed:** 2026-05-11
**Status:** Complete

## Outcomes by task

### Task 1 — Generate the synthetic 12,749-row Manabox CSV fixture (D-08)

**Files created:**
- `scripts/generate-large-fixture.ts` (NEW) — tsx-runnable Node script
- `test-fixtures/large-export.csv` (NEW; generated) — 12,750 lines (1
  header + 12,749 data rows)

**Deterministic-seed approach:** No `Math.random()`. Every field
distribution is driven by simple modular arithmetic over the row index
(e.g., `pickCondition(idx)` keys off `idx % 100`; `pickFoil(idx)` likewise;
`pickBinder(idx)` likewise). This guarantees byte-identical output across
runs.

**Distribution stats (deterministic):**
- Set codes: 10 fictional codes (`tst`, `fix`, `syn`, `fak`, `bug`, `lab`,
  `cli`, `dev`, `qa1`, `qa2`) round-robin across the 12,749 rows.
- Set names: paired 1:1 with set codes (`Test Set`, `Fixture Set`, ...).
- Binder names: 15 fictional names (`a01`..`a14` + `unsorted`) — most rows
  in `a01`..`a09` (~60%), fewer in `a10`..`a14` (~35%), ~5% in `unsorted`.
- Conditions: `near_mint` ~50%, `lightly_played` ~25%, `moderately_played`
  ~15%, `heavily_played` ~7%, `damaged` ~3%.
- Foil/finish: `normal` ~94%, `foil` ~5%, `etched` ~1% (Phase 17 D-01
  literal coverage).
- Rarities: `common` ~60%, `uncommon` ~25%, `rare` ~12%, `mythic` ~3%.
- Quantity: 1-4 (uniform mod 4 + 1).
- Card names: `Test Card 1`..`Test Card 12749` (unmistakably synthetic per
  Phase 17 D-11 privacy).
- Binder Type: literal `binder` for every row (per Phase 17 D-04 — anything
  else is parsed as a non-binder row and skipped).

**File details:**
- Path: `test-fixtures/large-export.csv` (relative to repo root)
- Size: **907.7 KB** (929,478 bytes) — leaner than the planner's 2MB
  estimate because the synthetic data uses short fictional names. The size
  is irrelevant to the perf pin (which asserts row-count + parse time, not
  bytes).
- Lines: **12,750** (1 header + 12,749 data; matches `wc -l` exactly)
- SHA256: `e58a4c3aa8185d99c1dc44586a725dd2b13cd4e5c35f4bafcf09612c73c081e9`
  (verified byte-identical across 2 consecutive runs)
- Header: canonical Phase 17 column order
  `Name,Set code,Set name,Collector number,Condition,Quantity,Foil,Rarity,Binder Name,Binder Type`

**Privacy:** zero real customer data, zero real card names, zero real
binder names from the operator's collection (Phase 17 D-11).

### Task 2 — Add the parser perf pin (D-07)

**File created:** `src/lib/__tests__/csv-parser-perf.test.ts` (NEW; co-located
with `csv-parser-content.test.ts` per CONTEXT D-07).

**Single it() block:**
- Reads `test-fixtures/large-export.csv` via `readFileSync` + path resolved
  from `import.meta.dirname` (Node 20+ via @types/node@^20).
- Calls `parseManaboxCsvContent(csv)` (the SINGULAR string-input form —
  NOT the plural `parseManaboxCsvContents` which expects
  `Array<{fileName, content}>`).
- Measures `performance.now()` delta around the parse call.
- Asserts `expect(result.cards.length).toBeGreaterThan(12_000)` AND
  `expect(elapsed).toBeLessThan(2_000)`.
- Defensive: if the fixture is missing, the test fails with a clear pointer
  to the regenerator script (rather than silently passing).

**Perf result on the runner machine:** 38ms (verified via
`npx vitest run --reporter=verbose`). That's 50x under the 2,000ms HARD-03
bound — comfortable headroom for slower CI runners. If the bound ever
flakes on slow CI, an `HARD03_PERF_BUDGET_MS` env override is documented as
a future relaxation (not implemented now since we have 50x headroom).

**Default-run:** the test runs as part of `npm test` — NOT skipped, NOT
env-gated. The file appears in the test summary as the +1 file (45 → 46
files, of which 1 remains skipped under unset `TEST_DATABASE_URL`).

### Task 3 — Verify Playwright absence (D-10) + manual UAT fallback (D-09)

**Verification result:** `grep -E '"@?playwright' package.json` returns
exit 1 (no match). Playwright is NOT in dependencies or devDependencies.

**Decision (per CONTEXT D-09 + D-10 + planner-verified state):** ship the
HARD-03 picker latency target (3-second picker render after upload click)
as a manual UAT step in scenario 1 of `22-HUMAN-UAT.md`. The manual UAT
uses DevTools Network tab `Time` column on the NDJSON request's first
chunk arrival as the measurement mechanism.

**Why no Playwright:** heavy commitment requiring CI Chromium downloads,
browser binary caching, and a separate test pipeline. The friend-store
deployment cadence and final-milestone-hardening scope do not justify the
addition.

**No files modified by Task 3.** Task 4 carries the picker-latency UAT
step.

### Task 4 — Author 22-HUMAN-UAT.md with 5 scenarios (D-11 / D-12)

**File created:** `.planning/phases/22-hardening-uat/22-HUMAN-UAT.md`
(NEW; mirrors 15-HUMAN-UAT.md format).

**Frontmatter:**
- status: `pending` (operator updates to `complete` after running scenarios)
- phase: `22-hardening-uat`
- source: `[22-VERIFICATION.md]` (forward reference)
- started/updated: `2026-05-11T04:00:00Z`
- deployment_url: `https://wikos-spellbinder.vercel.app`

**Scenario walk:**

1. **Operator-on-autopilot binder picker** (HARD-03 picker latency clause +
   HARD-04 picker UX) — operator opens admin/import, drags
   `test-fixtures/large-export.csv` (synthetic) OR a real export, uploads.
   Times the picker render via DevTools Network tab `Time` column on the
   NDJSON first-chunk arrival (must be ≤ 3000ms). Selects a subset of
   binders, commits with REPLACE confirmation (Phase 19 D-06). Re-uploads
   the same CSV, verifies the picker pre-checks the previously-selected
   binders (Phase 19 D-04 IMP-02). Re-uploads a TRIMMED CSV omitting one
   binder, verifies WILL DELETE panel (Phase 19 D-05 IMP-04).

2. **v1.2 → v1.3 cart hydration** (Phase 20 D-08/D-09/D-10/D-13) — operator
   injects a v1.2-shape cart into `localStorage` (key `viki-cart` —
   verified via `src/lib/store/cart-store.ts:79`; the pre-v1.3 schema
   persisted only `items` with no `version` field). Reloads `/cart`,
   observes the one-time migration toast (Phase 20 D-10), verifies
   reconciliation under aggregated keys (Phase 20 D-08), verifies quantity
   clamp (Phase 20 D-09), confirms zero console errors. Reloads again to
   verify the toast does NOT re-fire (Phase 20 D-13 sentinel advance).
   _Deviation note:_ planner cited cart-storage key `cart-storage`; actual
   key is `viki-cart` per `src/lib/store/cart-store.ts:79` — substituted
   per orchestrator instructions.

3. **CHECK constraint trip detection** (Phase 16 BIND-04 + Phase 18 D-08) —
   operator uses Neon SANDBOX SQL editor (explicit warning: NEVER run UPDATE
   against production) to insert a sandbox card, attempts
   `UPDATE cards SET quantity = -1`, verifies the `cards_quantity_check`
   constraint violation. Attempts a checkout against that card, verifies
   HTTP 503 (Phase 18 D-08 — distinct from 409 stock_conflict). Verifies
   `checkout.constraint_violation` log event in Vercel logs. Confirms
   recoverability via successful follow-up UPDATE.

4. **Public-page binder leak grep** (I-DISC-05 / AGG-02) — operator runs
   `curl` against `GET /`, `GET /cart`, `POST /api/checkout` (success
   shape) AND `POST /api/checkout` (stock_conflict shape with deliberately
   oversize quantity), captures all 4 bodies into `/tmp/`. Runs
   `grep -i -E '(a01|a02|...|bulk drawers|unsorted)'` against all 4
   captured bodies; pass criterion is ZERO hits. Operator substitutes the
   actual binder set names per their collection.

5. **Multi-binder concurrent checkout** (HARD-01 live verification) —
   operator seeds a sandbox card split across 2 binders summing to 3
   (`a02:2 + a05:1`) via Neon SQL editor, fires 5 simultaneous POSTs to
   `/api/checkout` requesting qty=1 each via shell `for ... & done; wait`
   burst, asserts exactly 3 successes (200) + 2 stock_conflicts (409),
   verifies `SUM(quantity) = 0` across both binder rows, confirms no row
   has `quantity < 0` (CHECK trip would surface as 503, not 409 — so
   distinguishable). Cleanup via `DELETE` on order_items + orders + cards.

**Summary block initialized:**
- total: 5
- passed: 0
- issues: 0
- pending: 5
- skipped: 0
- blocked: 0

**Gaps:** empty (operator adds entries if any scenario uncovers a defect).

### Task 5 — Full Plan 22-02 verification

| Gate                                 | Result                                                                                      |
|--------------------------------------|---------------------------------------------------------------------------------------------|
| `git diff --check`                   | exit 0 (no whitespace errors)                                                                |
| `tsx scripts/generate-large-fixture.ts` | runs to completion; output is 12,750 lines; SHA byte-identical across 2 runs                 |
| `npx vitest run csv-parser-perf.test.ts` | passes; elapsed = 38ms (50x under the 2000ms bound)                                         |
| `npx tsc --noEmit`                   | exit 0                                                                                       |
| `npm test`                           | 464 passed + 2 skipped across 45 test files (was 463 + 2 after Plan 22-01; +1 from perf pin) |
| `npm run build`                      | exit 0                                                                                       |
| 22-HUMAN-UAT.md vs CONTEXT D-11/D-12 | All 5 scenarios present; each has expected/how-to-run/result/evidence; summary initialized   |
| No real customer/card/binder data in fixture | confirmed: fictional set codes (`tst`/`fix`/`syn`/...), fictional names (`Test Card N`), fictional binders (`a01..a14`+`unsorted`) |

## Deviations from CONTEXT D-07..D-12

- **D-08 file size** — planner's "~2MB ± 200KB" estimate was too high.
  Actual size with the synthetic short content is 907.7 KB. The size is
  not part of the perf pin acceptance (the perf pin asserts row-count >
  12,000 + parse time < 2000ms, not file bytes). The smaller-than-expected
  size is harmless and gzip-compresses cleanly in git's pack files.

- **D-12 cart storage key** — planner cited `cart-storage`. Actual key is
  `viki-cart` per `src/lib/store/cart-store.ts:79` (`name: "viki-cart"` in
  the persist config). Substituted in scenario 2's `localStorage.setItem`
  snippet per orchestrator instructions. v1.2 schema persisted only
  `items` (no `version` field); `needsCartMigration()` in cart-store.ts
  flags `version == null` as needing migration.

- **D-12 scenario 5 sandbox vs production** — planner left the operator's
  choice between staging URL vs production-with-synthetic-data. UAT
  scenario 5 explicitly recommends sandbox (Neon branch + staging
  deployment) and warns against running the burst against production.

## Files modified / created

- `scripts/generate-large-fixture.ts` (NEW) — synthetic CSV generator
- `test-fixtures/large-export.csv` (NEW; generated; checked in) —
  12,749-row synthetic Manabox CSV (~908 KB)
- `src/lib/__tests__/csv-parser-perf.test.ts` (NEW) — HARD-03 perf pin
- `.planning/phases/22-hardening-uat/22-HUMAN-UAT.md` (NEW) — 5-scenario
  operator UAT runbook
- `.planning/phases/22-hardening-uat/22-02-SUMMARY.md` (NEW) — this file

## Net test delta

- After Plan 22-01: 463 passed + 2 skipped across 44 test files (45 files
  total including the env-gated skipped one)
- After Plan 22-02: 464 passed + 2 skipped across 45 test files (46 files
  total). +1 file (csv-parser-perf.test.ts) and +1 test.

## Success criteria checklist

- [x] HARD-03 first clause: `parseManaboxCsvContent(12_749 rows) < 2000ms`
      perf pin in csv-parser-perf.test.ts (D-07/D-08); measured 38ms
- [x] HARD-03 second clause: picker render < 3 seconds documented as
      manual UAT scenario 1 step (D-09/D-10 fallback path)
- [x] HARD-04: Live-deployment UAT scenarios documented in 22-HUMAN-UAT.md
      per CONTEXT D-11/D-12 (5 scenarios, Phase 15 format)
- [x] D-08: Synthetic 12,749-row CSV fixture generated and committed at
      test-fixtures/large-export.csv
- [x] D-12: 5 UAT scenarios present (operator-on-autopilot binder picker,
      v1.2→v1.3 cart hydration, CHECK constraint trip, binder leak grep,
      multi-binder concurrent checkout)
- [x] Existing post-22-01 baseline preserved or exceeded (463 + 2 → 464 + 2)

## Next step

Operator action items (post-merge to live deployment):

1. Provision a Neon test branch and run the 5x flake check per the runbook
   in `22-SECURITY-REVIEW.md` (Plan 22-01 leftover).
2. Run the 5 UAT scenarios in `22-HUMAN-UAT.md` against the live
   deployment, record pass/fail with evidence, and update the Summary
   block counts to close the v1.3 milestone.
