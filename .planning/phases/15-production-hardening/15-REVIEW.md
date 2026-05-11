---
phase: 15-production-hardening
reviewed: 2026-05-10T00:00:00Z
depth: standard
iteration: 3
files_reviewed: 19
files_reviewed_list:
  - scripts/smoke-production.ts
  - src/app/admin/health/page.tsx
  - src/app/admin/layout.tsx
  - src/app/api/admin/cards/[id]/route.ts
  - src/app/api/admin/cards/bulk-delete/route.ts
  - src/app/api/admin/cards/route.ts
  - src/app/api/admin/health/route.ts
  - src/app/api/admin/import/commit/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/app/api/admin/orders/[id]/route.ts
  - src/app/api/checkout/route.ts
  - src/db/admin-health.ts
  - src/db/schema.ts
  - src/lib/logger.ts
  - src/lib/notifications.ts
  - src/lib/rate-limit.ts
  - src/app/api/admin/cards/__tests__/route.test.ts
  - src/app/api/admin/orders/__tests__/route.test.ts
  - src/lib/__tests__/logger.test.ts
  - src/lib/__tests__/rate-limit.test.ts
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: issues_found
---

# Phase 15: Code Review Report (Iteration 3 — final)

**Reviewed:** 2026-05-10
**Depth:** standard
**Iteration:** 3 (re-review after WR-A..WR-D fixes)
**Status:** issues_found (Info-tier only — carryovers)

## Summary

All four iter-2 Warnings are correctly resolved. No new Critical or Warning
surfaces were introduced by the fixes.

- **WR-A (Postgres atomicity docstring)** — fixed in `22e5ca8`. The
  rewritten docstring at `src/lib/rate-limit.ts:385-433` no longer claims
  Postgres row/range locks serialize concurrent INSERTs. It now states
  honestly: "Plain Postgres INSERTs against a table with NO unique/
  exclusion constraint … are NOT serialized by row or range locks", that
  "the boundary may still admit `limit + N` hits", and names two concrete
  remediation paths (UNIQUE on a synthetic slot column; or
  `pg_advisory_xact_lock` under a transactional driver). The in-memory
  exact-limit test is now explicitly flagged as proving only the shared
  plumbing, not the Postgres atomicity.

- **WR-B (5xx → JSON invariant across admin handlers)** — fixed in
  `efe9652`. All four previously-uncovered sibling handlers now wrap their
  helper calls in try/catch and return structured 500 JSON: `PATCH
  /api/admin/cards/[id]` (also adds the missing JSON-body parse guard →
  400 JSON), `DELETE /api/admin/cards/[id]`, `GET /api/admin/cards`,
  `GET /api/admin/orders/[id]`. Each catch path calls `logError` with
  route + actor + id metadata for parity. Matching "returns 500 JSON when
  X throws" tests were added to both test files.

- **WR-C (Postgres `count` off-by-one)** — fixed in `22e5ca8` at
  `src/lib/rate-limit.ts:488`: `const count = inserted > 0 ? total + 1 :
  total;`. The Postgres path now returns post-insert count, matching the
  in-memory store's contract; `remaining = limit - count` is now
  consistent across both stores.

- **WR-D (throwing-getter / BigInt logger crash)** — fixed in `a96ca19`.
  `redact()` now wraps the `Object.entries(value)` call (handles a
  Proxy whose `ownKeys` trap throws) AND each per-key recursive call
  (descendant getters degrade locally to `"[UNREADABLE]"` rather than
  unwinding the whole tree). Top-level BigInt is coerced to a tagged
  string at the leaf, and `emit()` wraps `JSON.stringify` with a
  `safeStringifyReplacer` plus a fallback minimal-line emission. Three
  defensive tests cover the throwing-getter case, the BigInt case, and
  a circular-reference smoke. The defense-in-depth here matters: CR-04
  routed admin failures through a catch block that calls `logError`, so
  a throwing-getter metadata value would have unwound the catch handler
  itself into the generic Next 500 the CR-04 fix was meant to prevent.

No regressions detected. The four carryover Info items from iter-2 are
still present and still intentionally deferred — re-listed below for
traceability so the final phase-summary can decide whether to address
any of them as part of phase close-out.

## Critical Issues

_None._

## Warnings

_None._

## Info

### IN-A: `envChecks()` is still duplicated across the health route and the health page (carryover)

**File:** `src/app/admin/health/page.tsx:27-43`, `src/app/api/admin/health/route.ts:42-57`

**Issue:** Same env-var names and "configured | missing" logic written
in two places. Future env additions require both call sites updated.

**Fix:** Extract to `src/lib/admin-health/checks.ts` and import from both.

---

### IN-B: `ensureTable()` lacks a per-instance memoised promise (carryover)

**File:** `src/lib/rate-limit.ts:307-323`

**Issue:** Concurrent first calls all observe `tableEnsured=false` and
each fire two `CREATE` statements. SQL is idempotent so correctness is
fine; cold-start burst pays `2N` round-trips instead of `2`.

**Fix:** Memoise via a single in-flight promise:

```ts
let ensureTablePromise: Promise<void> | null = null;
async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS ...`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS ...`);
      tableEnsured = true;
    })();
  }
  return ensureTablePromise;
}
```

---

### IN-C: `parseInt` calls in `GET /api/admin/cards` lack a radix argument and don't validate the parsed number (carryover)

**File:** `src/app/api/admin/cards/route.ts:17-18`

**Issue:** `parseInt(url.searchParams.get("page") ?? "1")` — no radix, no
`Number.isFinite` check. `?page=foo` produces `NaN`. The helper likely
defends itself, but route-level input validation is symmetric with how
PATCH validates price/qty and would prevent surprising downstream
behaviour.

**Fix:**

```ts
const page = Math.max(
  1,
  Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
);
const limit = Math.min(
  500,
  Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50),
);
```

---

### IN-D: `getAdminHealthSnapshot` reports `database: "error"` when SELECT 1 succeeds but a per-table MAX read fails (carryover)

**File:** `src/db/admin-health.ts:45-71`, `src/app/api/admin/health/route.ts:65-81`

**Issue:** Labeling nit. The helper short-circuits to `database: "error"`
only on a SELECT 1 failure. If a per-table `Promise.all` read rejects
(missing table during a partial migration; single transient timeout),
the helper throws and the route's outer catch surfaces `database:
"error"` with hint "SELECT 1 failed" — misleading when the connection is
fine and only one table read failed.

**Fix:** Use `Promise.allSettled` for the three per-table reads and
report `database: "ok"` with `null` timestamps + a separate
`tableReadFailures` diagnostic; let the route decide on 503 vs 200
independently.

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 3 (final)_
