# Plan 22-01 — Summary (STRIDE delta + concurrent-proof + import preview rate-limit)

**Wave:** 1 (Phase 22, v1.3 final phase)
**Date completed:** 2026-05-11
**Status:** Complete (concurrent-proof 5x flake-check BLOCKED on operator
provisioning of `TEST_DATABASE_URL`; structural verification done)

## Outcomes by task

### Task 1 — Pin import preview rate-limit behavior (TDD)

Added 3 new tests to the existing `src/app/api/admin/import/__tests__/preview.test.ts`
(NOT a new `preview/__tests__/route.test.ts` as planner cited — see deviation
D-LOC below). Added rate-limit + logger mocks via `vi.hoisted`, reset in
`beforeEach`, default-allow.

**Tests added:**

1. `rate-limit runs AFTER auth so an unauthenticated caller still sees 401, not 429 (E-PRIV-02)` —
   pins ordering: when `requireAdmin()` returns 401 Response, `enforceRateLimit`
   is NEVER called (`expect(enforceRateLimitMock).not.toHaveBeenCalled()`).
2. `returns 429 with Retry-After when rate-limited and does NOT call parser or open stream (D-DOS-01)` —
   pre-mocks `enforceRateLimitMock` to return a 429 Response; asserts response
   `status: 429`, `Retry-After: "30"` header, `parseManaboxCsvContents` NOT
   called, `enrichCards` NOT called, AND a structured warn log emits with
   event `admin.import_preview.rate_limited`, actor `admin@example.com`,
   route `/api/admin/import/preview`.
3. `auth + under-limit proceeds normally (200 + application/x-ndjson)` —
   default-allow rate limit; happy path proceeds; asserts `enforceRateLimitMock`
   called exactly once + parser called exactly once + `Content-Type:
   application/x-ndjson`.

**TDD red-green proof:** before Task 2 patched the route, tests 2 + 3 failed
red (route returned 200 every time / `enforceRateLimitMock` never invoked);
after Task 2 they passed green.

### Task 2 — Apply rate limit to import preview route (D-03 / D-DOS-01 resolution)

**Insertion site:** `src/app/api/admin/import/preview/route.ts` after
`if (auth instanceof Response) return auth;` (was line 58 in baseline; now
between lines 64 and 84). Imports added at the top:

```ts
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent } from "@/lib/logger";
```

Plus the `const ROUTE = "/api/admin/import/preview";` literal mirroring
`commit/route.ts:16`.

**Rate-limit block (verbatim mirror of commit/route.ts:121-138, with
event name swapped):**

```ts
const rateLimited = await enforceRateLimit({
  key: clientKeyFromRequest(request, auth.user.email),
  config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
});
if (rateLimited) {
  logEvent({
    level: "warn",
    event: "admin.import_preview.rate_limited",
    route: ROUTE,
    actor: auth.user.email,
  });
  return rateLimited;
}
```

**Behavior:** the 429 short-circuits BEFORE `request.formData()`, BEFORE
`parseManaboxCsvContents`, BEFORE `enrichCards` — the entire point of
resolving D-DOS-01 in v1.3 (per `22-CONTEXT.md` D-03). Bucket is
`ADMIN_BULK` (20 hits / 60s window).

### Task 3 — Verify multi-binder concurrent-proof harness (5x flake check)

**Status: BLOCKED on operator action.** `TEST_DATABASE_URL` is not set in
the local execution environment, and Claude Code cannot provision a Neon
test branch from inside the agent.

**Structural verification (complete):**

The 5 CONTEXT D-05 scenarios map to existing test artifacts as the planner
described:

| Scenario                                         | Test artifact                                                                               | Pin                                                                                                                |
|--------------------------------------------------|---------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| 1. Single-binder regression                      | `src/db/__tests__/orders.test.ts` (Phase 11 baseline)                                        | Pre-existing single-binder concurrent-proof (verified unchanged)                                                   |
| 2. Multi-binder split (winner takes 3 of 4; SUM=1) | `src/db/__tests__/orders.concurrent.test.ts` Variant 1                                       | `expect(finalSum).toBe(1)` line 247                                                                                |
| 3. Multi-binder oversell-prevention (SUM=0)      | `src/db/__tests__/orders.concurrent.test.ts` Variant 2                                       | `expect(finalSum).toBe(0)` line 346                                                                                |
| 4. Allocator pick-order determinism              | `src/db/__tests__/orders.concurrent.test.ts` Variant 1 line 228                              | `expect(success.order.items[0].binder).toBe('a02')`                                                                 |
| 5. CHECK constraint trip                         | `src/db/__tests__/schema.test.ts` Phase 16 quantity CHECK pin                                | `it("declares cards_quantity_check CHECK constraint (Phase 16 BIND-04 / D-08)")` line 58                            |

**No new test code added** by Plan 22-01 to the concurrent-proof suite (per
plan acceptance criteria). The 2 `orders.concurrent` tests appear in the
baseline `npm test` summary as the "2 skipped" entries when
`TEST_DATABASE_URL` is unset (correct env-gated `describe.skip` behavior).

**Runbook (captured in 22-SECURITY-REVIEW.md):** Neon dashboard branch
provisioning, `export TEST_DATABASE_URL=...` (NEVER production), 5x
sequential `npx vitest run` invocations, captured tail-5 evidence, hard
escalation path if any run flakes.

### Task 4 — Author 22-SECURITY-REVIEW.md (D-01 / D-02 / D-04 / D-05 / D-06)

**File:** `.planning/phases/22-hardening-uat/22-SECURITY-REVIEW.md` (NEW).

**Section walk:**

1. **Header** — Reviewer / Date / Scope identifying this as the v1.3 STRIDE
   delta over Phase 15.
2. **Surface inventory delta** — table listing only v1.3-amplified surfaces:
   import/preview now rate-limited, import/commit unchanged but binder-aware,
   checkout multi-binder-aware, public storefront/cart/checkout response
   shapes PublicCard-typed per Phase 20 D-05/D-07.
3. **New findings** — I-DISC-05 (binder-name leak; Low; resolved by v1.3)
   with the four-bullet structure: Surface, Mitigation (Phase 20 D-05/D-07
   + Phase 18 D-06 file citations), Severity (Low + verbatim CONTEXT D-02
   rationale), Status (resolved by v1.3).
4. **Resolved deferrals** — D-DOS-01 with reference to Phase 15 baseline,
   v1.3 amplification rationale (12,749-row parse + unbounded Scryfall
   pass), the fix (`enforceRateLimit` in preview/route.ts), test coverage
   (preview.test.ts), Phase 19 D-19 acknowledgment.
5. **Unchanged deferrals** — table with 4 rows (S-01, D-DOS-02, D-DOS-03,
   I-DISC-03) each with Phase 15 status, v1.3 amplification = none, rationale
   for staying deferred, revisit in v1.4+ Operations milestone.
6. **Multi-binder concurrent-proof** — test file path, env-gating contract,
   the 5-scenario coverage mapping table, BLOCKED status for the 5x
   flake-check execution, the operator runbook with explicit shell commands,
   Testcontainers fallback note.
7. **Summary of follow-ups** — extends Phase 15's table with I-DISC-05
   (Resolved by v1.3) and D-DOS-01 status updated to (Resolved by Phase 22);
   the other Phase 15 rows are restated unchanged for self-contained
   readability.

### Task 5 — Full Plan 22-01 verification

| Gate                                  | Result                                                                                                                |
|---------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `git diff --check`                    | exit 0 (no whitespace errors)                                                                                          |
| `npx tsc --noEmit`                    | exit 0                                                                                                                 |
| `npm test`                            | 463 passed + 2 skipped across 45 files. Baseline was 460 passed + 2 skipped; +3 net (the 3 new TDD tests in Task 1).   |
| `npm run build`                       | exit 0                                                                                                                 |
| 5x flake-check evidence in 22-SECURITY-REVIEW.md | BLOCKED on operator action (TEST_DATABASE_URL not provisioned). Runbook captured.                                     |
| 22-SECURITY-REVIEW.md vs CONTEXT D-01..D-06 | All 7 required sections present; each decision reflected.                                                              |
| No secrets in new files               | Only a `<password>` placeholder in the Neon URL example in the runbook; no real secrets.                                |

## Deviations from CONTEXT D-01..D-06

- **D-LOC (test file location)** — Planner cited
  `src/app/api/admin/import/preview/__tests__/route.test.ts` as a NEW file.
  Actual location is the existing `src/app/api/admin/import/__tests__/preview.test.ts`
  (alongside `commit.test.ts`). Added the 3 new TDD tests + rate-limit/logger
  mock setup to that existing file rather than creating a parallel file. The
  planner's bulk-delete pattern reference also lives at
  `src/app/api/admin/cards/__tests__/bulk-delete-route.test.ts`, not at
  `src/app/api/admin/cards/bulk-delete/__tests__/route.test.ts`. This is a
  cosmetic file-layout difference that doesn't affect coverage or behavior.

- **D-06 5x flake check** — execution BLOCKED on operator-provisioned
  `TEST_DATABASE_URL`. The structural verification (5-scenario coverage
  mapping) is complete; only the live 5x execution against a real Postgres
  test branch remains. Runbook is captured in 22-SECURITY-REVIEW.md.

## Files modified / created

- `src/app/api/admin/import/preview/route.ts` — added `ROUTE` constant,
  rate-limit/logger imports, post-auth `enforceRateLimit` block (modified)
- `src/app/api/admin/import/__tests__/preview.test.ts` — added rate-limit
  + logger mocks via `vi.hoisted`; added 3 new TDD tests pinning the
  D-DOS-01 resolution (modified)
- `.planning/phases/22-hardening-uat/22-SECURITY-REVIEW.md` — v1.3 STRIDE
  delta document (NEW)
- `.planning/phases/22-hardening-uat/22-01-SUMMARY.md` — this file (NEW)

## Net test delta

- Baseline: 460 passed + 2 skipped across 44 test files (45 files total
  including the env-gated skipped one)
- After Plan 22-01: 463 passed + 2 skipped across 44 test files (45 files
  total). The 2 skipped remain `orders.concurrent.test.ts` Variants 1 + 2
  under unset `TEST_DATABASE_URL` (env-gated correct behavior).

## Success criteria checklist

- [x] HARD-02: STRIDE delta document records I-DISC-05 + resolves D-DOS-01
- [x] HARD-01 (structural): Multi-binder concurrent-proof harness verified
      to cover the 5 CONTEXT D-05 scenarios; runbook captured
- [ ] HARD-01 (live 5x flake check): BLOCKED on operator-provisioned
      `TEST_DATABASE_URL`
- [x] D-03: `/api/admin/import/preview` rate-limited post-`requireAdmin()`
      with `RATE_LIMIT_BUCKETS.ADMIN_BULK` (D-DOS-01 resolved)
- [x] D-01/D-02/D-04: I-DISC-05 + unchanged-deferrals + Phase 15 baseline
      reference present in 22-SECURITY-REVIEW.md
- [x] D-05: Phase 18's concurrent-proof tests verified to cover the 5
      CONTEXT D-05 scenarios
- [x] Existing 460 passed + 2 skipped baseline preserved or exceeded (now
      463 passed + 2 skipped)

## Next step

Execute Plan 22-02 (perf pin + UAT runbook) — Wave 2.

Operator action item (post-merge):
1. Provision Neon test branch
2. `export TEST_DATABASE_URL=<branch-url>`
3. Run the 5x flake check per the runbook in `22-SECURITY-REVIEW.md`
4. Paste raw outputs back into 22-SECURITY-REVIEW.md and update status
