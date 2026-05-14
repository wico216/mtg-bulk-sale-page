---
title: Provision TEST_DATABASE_URL and run Phase 18 concurrent-proof harness
priority: next
created: 2026-05-13
promoted_from: STATE.md "Deferred Items" (v1.3 milestone close)
reason_for_promotion: |
  v1.3.5 hotfix (commit b60977b) fixed an invalid-SQL regression in the
  Phase 18 allocator (`FOR UPDATE is not allowed with window functions`,
  SQLSTATE 0A000). That bug would have been caught immediately by the
  multi-binder concurrent-proof harness — described in its own source
  file as "the single most important test in the milestone per CONTEXT
  D-07" — but the harness is env-gated on TEST_DATABASE_URL and was
  never provisioned. Two prod incidents within 48h (v1.3.1 Scryfall
  rate-limit self-DOS would also have benefited from real-DB integration
  coverage, even if it wasn't this specific harness) justify making this
  the active next operator task.
---

# Provision TEST_DATABASE_URL + run concurrent-proof harness

## Why

`src/db/__tests__/orders.concurrent.test.ts` covers the load-bearing
concurrency invariant for `placeCheckoutOrder`:

- Lock by `(set_code, collector_number, finish, condition)` aggregated key
- Never oversell
- Never partially fulfill
- Two parallel `placeCheckoutOrder({ X: 3 })` calls against seeded
  multi-binder stock — exactly one ok=true, exactly one stock_conflict,
  conserved total stock.

The suite skips with a warning when `TEST_DATABASE_URL` is unset. As of
v1.3.5 it has never run against a real Postgres in this project's CI.

## Steps

### 1. Create a Neon test branch

In the Neon console (or via `neonctl`):

- Source: production branch (or a recent main snapshot).
- Name suggestion: `test-concurrent-proof`.
- Capture the **branch connection string** (it looks like
  `postgresql://user:pass@ep-xyz-pooler.region.aws.neon.tech/dbname?sslmode=require`).

**NEVER use the production DATABASE_URL** — the harness `INSERT`s,
decrements, and `DELETE`s rows under a `tst-…` aggregated key.

### 2. Verify locally

```
TEST_DATABASE_URL="postgresql://..." npx vitest run src/db/__tests__/orders.concurrent.test.ts
```

Expected output:

- `placeCheckoutOrder — multi-binder concurrent proof (D-07)` describe block runs (not `.skip`).
- Variant 1 + Variant 2 both pass.
- 5× flake check: `for i in $(seq 1 5); do TEST_DATABASE_URL=... npx vitest run src/db/__tests__/orders.concurrent.test.ts || break; done` — all 5 runs green.

### 3. Wire into CI

In Vercel / GitHub Actions / wherever CI runs:

- Add `TEST_DATABASE_URL` as a CI-only secret (NOT exposed to preview deploys, NOT exposed to production runtime).
- Update the test command in CI to NOT exclude `orders.concurrent.test.ts`.
- Run on every PR + on `main`.

### 4. Close out

- Update STATE.md: move this todo to `done/` (or delete the entry) and add a `## Recently Completed` bullet noting "Phase 18 concurrent-proof now runs in CI as of {date}".
- Add a note to the v1.4 milestone bootstrap (when started) that future allocator changes must keep this suite green.

## References

- Test source: `src/db/__tests__/orders.concurrent.test.ts:1-100`
- Allocator SQL: `src/db/orders.ts:438-626`
- Phase 18 plan: `.planning/phases/18-allocator/` (archived under v1.3 milestone)
- v1.3.5 incident: commit `b60977b`, debug session not created (diagnosed via log inspection after logger fix in `c3ef3ae`)
