# Phase 22: Hardening & UAT - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Closing phase for v1.3. Document the security delta (new I-DISC-05 binder leak finding; resolve the deferred D-DOS-01 import preview rate-limit since v1.3 amplifies its per-call cost). Extend the Phase 11 concurrent-checkout proof harness with a multi-binder scenario. Pin parser performance (`parseManaboxCsvContents(12_749) < 2000ms`). Document and run live-deployment UAT scenarios against `wikos-spellbinder.vercel.app` (or a v1.3 staging URL).

</domain>

<decisions>
## Implementation Decisions

### STRIDE delta document (locked by research)
- **D-01:** New file `.planning/phases/22-hardening-uat/22-SECURITY-REVIEW.md`. Mirrors the format of Phase 15's `15-SECURITY-REVIEW.md`. References Phase 15 as the baseline; documents only the v1.3 deltas.
- **D-02:** New finding **I-DISC-05** — binder name privacy. Records:
  - Surface: every public-facing API (GET /, GET /cart, POST /api/checkout success and stock_conflict) + buyer confirmation email + structured logs from public routes
  - Mitigation: PublicCard/AdminCard type split (Phase 20 D-05); per-route invariant tests asserting `JSON.stringify(response).includes('binder') === false` (Phase 20 D-07); StockConflict.available is SUM across binders (Phase 18 D-06)
  - Severity: Low (binder name is an organizational label, not credential or PII; leak embarrasses but doesn't expose the seller's collection map)
  - Status: resolved by v1.3
- **D-03:** **Resolve D-DOS-01** (deferred Medium from Phase 15) — `/api/admin/import/preview` is admin-authed but not rate-limited. v1.3 amplifies per-call cost (parser groups 12,749 rows into BinderSummary[] before responding). Add `enforceRateLimit({ key, config: RATE_LIMIT_BUCKETS.ADMIN_BULK })` AFTER `requireAdmin()` in the preview route. Phase 22 owns this; Phase 19 explicitly didn't (Phase 19 D-19).
- **D-04:** Other Phase 15 deferrals (S-01 case-sensitive admin email; D-DOS-02 rate_limit_hits TTL; D-DOS-03 XFF spoofing; I-DISC-03 notification failure queryability) remain UNCHANGED. None are amplified by v1.3 changes; revisit in v1.4+ Operations milestone if priorities shift.

### Multi-binder concurrent-proof harness
- **D-05:** Extend `src/db/__tests__/orders.test.ts` (or wherever the Phase 11 concurrent-proof test lives — planner finds) with multi-binder scenarios:
  1. **Single-binder baseline (regression)** — 1 row with quantity 1; two parallel `placeCheckoutOrder({ X: 1 })`; assert one success + one stock_conflict; verify Phase 11 invariant still holds
  2. **Multi-binder split** — 2 rows: `(X, A02, 2)` and `(X, A05, 2)`; two parallel `placeCheckoutOrder({ X: 3 })`; assert one success (consumes 3 across A02+A05) + one stock_conflict (`available: 1`); verify SUM(quantity)=0 afterward
  3. **Multi-binder oversell-prevention** — 3 rows: `(X, A02, 2)` + `(X, A05, 2)` + `(X, A07, 2)`; three parallel `placeCheckoutOrder({ X: 3 })`; assert exactly two succeed; third returns stock_conflict; total decremented = 6
  4. **Allocator pick-order determinism** — `(X, A02, 1)` + `(X, A05, 5)`; sequential `placeCheckoutOrder({ X: 1 })`; assert A02 (smallest) consumed first; then `placeCheckoutOrder({ X: 1 })` consumes A05
  5. **CHECK constraint trip** — manually corrupt a row to `quantity = -1` in a sandbox DB → assert the route catches and returns HTTP 503 (Phase 18 D-08)
- **D-06:** Tests use the existing `withTestDB` (or whatever pattern the Phase 11 test uses — planner verifies). Cleanup is mandatory; no test pollution.

### Performance pin (locked by HARD-03)
- **D-07:** New Vitest test in `src/lib/__tests__/csv-parser.test.ts` (or co-located with Phase 17's parser tests):
  ```ts
  it('parses 12,749-row Manabox CSV in under 2 seconds', () => {
    const csv = readFileSync('test-fixtures/large-export.csv', 'utf8');
    const t0 = performance.now();
    const result = parseManaboxCsvContents(csv);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2000);
    expect(result.cards.length).toBeGreaterThan(12000);
  });
  ```
- **D-08:** Test fixture: a 12,749-row synthetic CSV (NOT the operator's real file — privacy per Phase 17 D-11). Generate it once via a small script (`scripts/generate-large-fixture.ts`) and check in the result. ~2MB file in `test-fixtures/`; gitignored if too noisy, otherwise checked in.

### Picker latency target (HARD-03)
- **D-09:** Picker renders within 3 seconds of upload click. Mechanism: if Playwright is in the project, write an E2E test; if not, document as a manual UAT step in `22-HUMAN-UAT.md` and rely on operator-eye verification at deploy time.
- **D-10:** Planner verifies Playwright presence in `package.json` before deciding the mechanism.

### Live-deployment UAT (locked by HARD-04)
- **D-11:** New `.planning/phases/22-hardening-uat/22-HUMAN-UAT.md` mirroring `.planning/phases/15-production-hardening/15-HUMAN-UAT.md` format. Contains 5 scenarios:
  1. **Operator-on-autopilot binder picker** — operator imports the same Manabox CSV twice; second time, the picker remembers the last selection; the WILL DELETE panel surfaces if any binder went missing; commit confirmation requires typed REPLACE
  2. **v1.2 → v1.3 cart hydration** — buyer visits storefront with v1.2 cart in localStorage; sees the one-time toast; cart items reconcile under aggregated keys; quantities clamp to current stock; no console errors
  3. **CHECK constraint trip detection** — sandboxed DB row corrupted to `quantity = -1`; checkout API returns 503; structured log emits `checkout.constraint_violation`; recoverable
  4. **Public-page binder leak grep** — view-source on `GET /`, `GET /cart`, `POST /api/checkout` (success + stock_conflict shapes); grep for any binder name from the operator's collection (e.g., "A02", "Bulk Drawers"); zero hits
  5. **Multi-binder concurrent checkout** — burst 5 simultaneous checkouts for a card split across binders with low stock; verify exactly the right number succeed; SUM across binders matches total stock decremented
- **D-12:** UAT scenarios check off in `22-HUMAN-UAT.md` per the Phase 15 pattern. Operator runs each, records pass/fail with evidence, then signs off the milestone.

### Claude's Discretion
- Exact wording of UAT step instructions
- Whether to ship the synthetic large-fixture script as a one-off or check the generated file
- Playwright vs manual UAT for picker latency (depends on project state)
- Whether the STRIDE delta references prior STRIDE markdown via include or repeats the format

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior STRIDE review (the baseline this phase deltas against)
- `.planning/phases/15-production-hardening/15-SECURITY-REVIEW.md` — Phase 15 baseline. Phase 22 references and adds I-DISC-05 + resolves D-DOS-01.

### Prior phase context
- All v1.3 phases (16-21) — Phase 22 verifies they ship together correctly
- `.planning/phases/15-production-hardening/15-HUMAN-UAT.md` — UAT format precedent

### Existing codebase patterns to mirror / extend
- `src/db/__tests__/orders.test.ts` (Phase 11 concurrent-proof) — extension target
- `src/lib/__tests__/csv-parser.test.ts` (Phase 17 parser tests) — extension target for perf pin
- `scripts/smoke-production.ts` (Phase 15) — pattern for any v1.3 smoke additions (none required by current scope)

### Project docs
- `.planning/REQUIREMENTS.md` — HARD-01..04 are this phase's requirements
- `.planning/STATE.md` — Cross-Cutting Constraints: "Phase 22 STRIDE delta document" + "Perf pin: parseManaboxCsvContents(12_749) < 2000ms"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 11 concurrent-proof harness pattern (read source before extending)
- Phase 15 STRIDE format (mirror in 22-SECURITY-REVIEW.md)
- Phase 15 HUMAN-UAT.md format (mirror in 22-HUMAN-UAT.md)
- `enforceRateLimit` + `RATE_LIMIT_BUCKETS.ADMIN_BULK` from Phase 15 (apply to /api/admin/import/preview)
- Vitest perf-test pattern via `performance.now()` (planner verifies the convention if any)

### Established Patterns
- **STRIDE delta over baseline** — Phase 22 doesn't rewrite the security review; it documents v1.3-specific changes
- **Concurrent-proof harness** — Phase 11 baseline; Phase 22 extends with multi-binder
- **Perf pin in Vitest** — explicit `expect(elapsed).toBeLessThan(N)` assertion; cheap; surfaces regressions

### Integration Points
- **Phase 16-21** all ship together; Phase 22 tests them as a system
- Operator runs UAT scenarios on the live deployment after merge

</code_context>

<specifics>
## Specific Ideas

- The multi-binder concurrent-proof test (D-05 scenario 2) is the single most important regression test in v1.3. It MUST be in the default `npm test` run. If it ever flakes, the entire allocator's correctness story is in question.
- I-DISC-05 binder leak severity is "Low" because binder names are organizational labels, not credentials. But the type-split + invariant tests are the right defense regardless of severity, because once binder names DO leak (via one careless API change), unwinding it is much harder than preventing it.
- The HARD-04 live UAT sequence mirrors Phase 15's "real deployment + manual verification" flow. The operator already proved this works in v1.2 (15-HUMAN-UAT.md was 3/3 passed); v1.3 expands to 5 scenarios reflecting the milestone's broader surface.

</specifics>

<deferred>
## Deferred Ideas

- **External log drain integration** (Phase 15 I-DISC-03) — no v1.3 amplification; revisit in v1.4+
- **rate_limit_hits TTL job** (Phase 15 D-DOS-02) — same; revisit in v1.4+
- **XFF spoofing protection on non-Vercel deploys** (Phase 15 D-DOS-03) — no v1.3 amplification
- **Case-sensitive admin email check** (Phase 15 S-01) — single-admin store; revisit in v1.4+
- **Continuous benchmark CI for parser perf** — Phase 22 ships a single `expect(<2000ms)` test; if regressions become common, add a benchmark CI later

</deferred>

---

*Phase: 22-Hardening & UAT*
*Context gathered: 2026-05-11*
