---
phase: 15-production-hardening
reviewed: 2026-05-10T00:00:00Z
depth: standard
iteration: 2
files_reviewed: 26
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
  - src/app/api/admin/cards/__tests__/bulk-delete-route.test.ts
  - src/app/api/admin/cards/__tests__/route.test.ts
  - src/app/api/admin/health/__tests__/route.test.ts
  - src/app/api/admin/import/__tests__/commit.test.ts
  - src/app/api/admin/orders/__tests__/route.test.ts
  - src/app/api/checkout/__tests__/rate-limit-integration.test.ts
  - src/app/api/checkout/__tests__/route.test.ts
  - src/db/__tests__/admin-health.test.ts
  - src/lib/__tests__/logger.test.ts
  - src/lib/__tests__/rate-limit.test.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 15: Code Review Report (Iteration 2)

**Reviewed:** 2026-05-10
**Depth:** standard
**Iteration:** 2 (post-fix re-review of iter1's 4 Critical + 8 Warning findings)
**Files Reviewed:** 26
**Status:** issues_found

## Summary

The iter1 fix commits land cleanly. All four prior Critical findings are
genuinely resolved:

- **CR-01 (rate-limit TOCTOU)**: now uses a single-statement CTE
  `checkAndRecord` on Postgres and a synchronous atomic path on the
  in-memory store. The in-memory `Promise.all(20)` concurrency test
  passes at exactly `limit` admissions.
- **CR-02 (poisoned store promise)**: `getDefaultRateLimitStore` now
  resets `defaultStorePromise` on rejection and falls back to a memory
  store, with a defense-in-depth `enforceRateLimit` try/catch that
  fail-opens rather than 500-ing the route.
- **CR-03 (notification PII log)**: the `console.log("[ORDER]", …)`
  line is replaced with a redacted `logEvent` carrying only orderRef +
  aggregate counts.
- **CR-04 (admin order routes re-throwing)**: `PATCH /api/admin/orders/[id]`
  and `POST /api/admin/orders/[id]/cancel` now both return structured
  500 JSON, covered by new "returns 500 JSON when X throws" tests.

The eight prior Warnings are also addressed: XFF leftmost-trust is
documented as Vercel-specific (WR-01); `rate_limit_hits` now has both an
opportunistic per-hit prune and a tracked schema entry (WR-02); the
in-memory store's prune-on-read mutation is now blessed by the
interface contract (WR-03); the smoke script's destructive-probe
rationale is explicit in code comments (WR-04); the SELLER_EMAIL
non-null assertion is replaced with a runtime guard (WR-06); the
health endpoint returns 503 on DB outage (WR-07); and Postgres
constraint-violation messages are scrubbed of email/phone-shaped PII
by `safeErrorSummary` (WR-08).

What remains is a smaller set of follow-ups:

1. The Postgres `checkAndRecord` docstring **overclaims atomicity**.
   The CTE compresses a two-statement race into one statement, but
   Postgres MVCC snapshot semantics still admit concurrent inserts at
   the limit boundary because there is no row-level lock that
   serializes them. The improvement is real but not "exactly one extra
   at the boundary" as the comment claims (WR-A).
2. The CR-04 "5xx → JSON" invariant is applied to `orders/*` but
   **not consistently** to `admin/cards/[id]` PATCH/DELETE,
   `admin/cards` GET, or `admin/orders/[id]` GET. A DB error or a
   malformed JSON body in those handlers still bubbles to Next's
   default HTML 500 and breaks the admin UI's `fetch().then(r=>r.json())`
   consumer (WR-B).
3. The Postgres atomic path's returned `count` reflects the
   pre-insert snapshot (since all subqueries in the CTE share one
   snapshot), so `remaining` is off-by-one relative to the in-memory
   store after a successful allow. Cosmetic, but the two stores were
   advertised as semantically identical (WR-C).
4. The redacting logger walks metadata with `Object.entries`, which
   invokes property getters. A metadata object whose getter throws
   crashes `redact()` and bubbles past the route handler (WR-D).

Three of the prior Info-tier items (IN-01 duplicated `envChecks`,
IN-02 unguarded concurrent `ensureTable()`, IN-03 missing `parseInt`
radix and validation in `GET /api/admin/cards`) were intentionally
deferred and are still present; re-noted here for traceability.

## Critical Issues

_None._

## Warnings

### WR-A: Postgres `checkAndRecord` docstring overclaims atomicity — concurrent inserts at the limit boundary can still slip through

**File:** `src/lib/rate-limit.ts:385-464` (comment + implementation)

**Issue:** The new docstring claims:

> Postgres holds an internal row-lock on the index range during the
> INSERT. Concurrent callers race for that lock and the second one's
> COUNT(*) sees the first one's insert. … at most one extra hit can
> slip through.

This is not how plain Postgres INSERTs behave. There is no unique
constraint or exclusion constraint on `rate_limit_hits`, so two
concurrent INSERTs are not serialized by index/range locks. Both
transactions read at their own MVCC snapshot, both see the same
pre-state `COUNT(*)`, and both insert. The CTE compresses the
count+insert into one statement, which **shortens** the race window
compared with the two-step path (one HTTP round-trip on neon-http
vs two), but it does not eliminate it. Under high concurrency on
multiple serverless instances the boundary can admit
`limit + N_concurrent` hits, not `limit + 1`.

In practice the residual race is narrow (neon-http serializes
roundtrips at the HTTP layer per-instance), and for the friend-store
threat model this is fine. But the comment will mislead a future
operator who reads it and assumes the limit is exact.

The in-memory test (`rate-limit.test.ts:165-193`) exercises the path
with `Promise.all(20)` and asserts exactly 5 admissions — this passes
only because JS is single-threaded and `checkAndRecord` on the memory
store runs to completion before the next callback. It does NOT prove
the Postgres path's atomicity.

**Fix:** One of:

```ts
// Option A: add a per-key advisory lock inside checkAndRecord to truly
// serialize concurrent callers for the same (bucket, key).
await db.execute(sql`
  SELECT pg_advisory_xact_lock(hashtextextended(${`${bucket}|${key}`}, 0))
`);
// then the existing CTE
```

```ts
// Option B: revise the comment to be honest about residual concurrency.
// "Reduces the race window to a single statement; concurrent callers on
//  multiple serverless instances may still admit `limit + N` requests
//  at the boundary. This is the strongest guarantee available on
//  neon-http without a transactional driver, and is acceptable for the
//  current threat model — but is not an exact-limit guarantee."
```

If keeping the current behavior, add a Postgres-store concurrency test
that asserts the actual observed admission count under N concurrent
callers, so the comment and the test agree on what's guaranteed.

---

### WR-B: CR-04 "5xx → JSON" invariant is not applied to `admin/cards/[id]`, `admin/cards` GET, or `admin/orders/[id]` GET

**File:** `src/app/api/admin/cards/[id]/route.ts:25-72, 76-96`, `src/app/api/admin/cards/route.ts:12-48`, `src/app/api/admin/orders/[id]/route.ts:35-50`

**Issue:** The iter1 fix added try/catch + JSON 500 to
`admin/orders/[id]` PATCH and `admin/orders/[id]/cancel` POST, but the
same hazard is still present in four sibling admin handlers:

1. **`PATCH /api/admin/cards/[id]`** — `await request.json()` at
   line 26 has no try/catch. Posting `body: "not-json"` throws a
   `SyntaxError` that bubbles past the handler. `updateCard(...)` at
   line 67 likewise has no surrounding catch; a DB error becomes a
   raw Next 500 HTML page. Compare with
   `admin/cards/bulk-delete/route.ts` which carefully catches both.
2. **`DELETE /api/admin/cards/[id]`** — `deleteCard(...)` at line 89
   has no try/catch. Same hazard.
3. **`GET /api/admin/cards`** — `getAdminCards(...)` at line 38 has
   no try/catch. Same hazard.
4. **`GET /api/admin/orders/[id]`** — `getOrderById(...)` at line 43
   has no try/catch.

The admin UI consumes these endpoints with `fetch().then(r => r.json())`;
an HTML 500 response causes a `SyntaxError: Unexpected token < in
JSON` in the client and the admin sees a blank error overlay instead
of a usable error message. The CR-04 commit message ("match the 5xx →
JSON invariant the rest of the admin routes uphold") is contradicted by
these four routes.

**Fix:** Apply the same pattern as `orders/[id]/route.ts` (lines 132-148)
to each handler. For PATCH:

```ts
let body: unknown;
try {
  body = await request.json();
} catch {
  return Response.json({ error: "Invalid JSON body" }, { status: 400 });
}
// …validate…
try {
  const updated = await updateCard(id, updates, { actorEmail: result.user.email });
  if (!updated) return Response.json({ error: "Card not found" }, { status: 404 });
  return Response.json({ success: true, card: updated });
} catch (err) {
  logError({
    event: "admin.card_update.failed",
    route: "/api/admin/cards/[id]",
    actor: result.user.email,
    error: err,
    metadata: { cardId: id },
  });
  return Response.json(
    { error: "Card update failed — card unchanged" },
    { status: 500 },
  );
}
```

For GET handlers, wrap the helper call in try/catch and return
`Response.json({ error: "…" }, { status: 500 })` on failure. Add the
matching "returns 500 JSON when the helper throws" tests, mirroring
the existing test at `orders/__tests__/route.test.ts:402-416`.

---

### WR-C: Postgres atomic path returns the pre-insert `count`, so `remaining` is off-by-one relative to the in-memory store

**File:** `src/lib/rate-limit.ts:440-464`, compared with `src/lib/rate-limit.ts:263-290`

**Issue:** In `checkAndRecord` on Postgres, the outer `SELECT COUNT(*)`
in the CTE runs in the same statement-level snapshot as the gating
`COUNT(*)` inside the `INSERT … WHERE` predicate. Postgres CTE
semantics guarantee that all sub-statements see the same snapshot, so
the returned `total` reflects the count **before** the just-inserted
row, even when `inserted=1`. The docstring on `checkAndRecord`
explicitly states the opposite:

> Returned `count` is the number of hits in the window AFTER the
> conditional insert (i.e. if `allowed=true` it includes the new hit;
> if `allowed=false` it is the pre-existing count).

The in-memory store does honor that contract: it returns
`preInsertCount + 1` when allowed. So callers of `checkRateLimit`
that read `remaining` see different values on the two stores for the
same input:

- Memory: `allowed=true, count=preInsertCount+1` → `remaining =
  limit - count` (correct: hits remaining after this admit).
- Postgres: `allowed=true, count=preInsertCount` → `remaining =
  limit - count` (one too high — does not account for the row that
  just landed).

For limit=10 after 9 successful admissions plus the 10th, memory
returns `remaining=0`, Postgres returns `remaining=1`. Only cosmetic
today because no caller examines `remaining`, but the routes already
log decisions, and any future consumer of the field (rate-limit
headers, observability) will misbehave on Postgres.

**Fix:** In the Postgres path, add 1 to `total` when `inserted > 0`,
to match the documented "post-insert count" contract:

```ts
const count = inserted > 0 ? total + 1 : total;
return {
  allowed: inserted > 0,
  count,
  earliestMs,
};
```

Or, alternatively, change the in-memory store to also return the
pre-insert count and update the docstring to say "pre-insert count".
Either is fine; the requirement is that both stores agree.

A unit test that asserts `count` for both stores at the same
(limit, pre-state, insert outcome) would pin this down.

---

### WR-D: `redact()` evaluates property getters without a guard — a throwing getter on a metadata value crashes the logger

**File:** `src/lib/logger.ts:95-104`

**Issue:** `redact` deep-clones the metadata tree via `Object.entries(value)`,
which **invokes every property getter** on the object. A metadata
object with a getter that throws (e.g., a Proxy, a class instance with
a lazy property that hits a closed DB connection) will propagate the
throw out of `redact` → `logEvent`/`logError` → past the route's
try/catch when the logger is called from inside the catch handler.
The CR-04 fix means most admin routes now log inside a catch — a
throwing-getter metadata value would unwind from the catch handler
itself, surfacing as a generic Next 500.

The toJSON path IS guarded (`try { ... toJSON() ... } catch { return
"[UNSERIALIZABLE]"; }`), so this is a near-miss: the same defense was
not extended to `Object.entries`.

Note `JSON.stringify(payload)` at line 178 has the same hazard for
nested non-redacted primitives (e.g., a BigInt in metadata throws
`TypeError: Do not know how to serialize a BigInt`). Less likely to
hit in current code but worth fixing in the same patch.

**Fix:** Wrap the Object.entries walk in try/catch with a fallback,
and guard the final `JSON.stringify`:

```ts
function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "object" && value !== null && "toJSON" in value && ...) {
    // existing toJSON guarded path
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    try {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = shouldRedactKey(k) ? REDACTED : redact(v, depth + 1);
      }
    } catch {
      return "[UNSERIALIZABLE]";
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, payload: Record<string, unknown>): void {
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({ level, event: "log.serialize_failed", timestamp: new Date().toISOString() });
  }
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
```

Add a test that passes `{ get x() { throw new Error("boom"); } }` as
metadata and asserts the logger emits one line without throwing.

---

## Info

### IN-A: `envChecks()` is still duplicated across the health route and the health page (carryover from iter1 IN-01)

**File:** `src/app/admin/health/page.tsx:27-43`, `src/app/api/admin/health/route.ts:42-57`

**Issue:** Same env-var names and "configured | missing" logic written
in two places. A future env addition has to be updated in both.
Intentionally deferred in iter1; flagged for traceability.

**Fix:** Move into a shared helper, e.g. `src/lib/admin-health/checks.ts`.

---

### IN-B: `ensureTable()` lacks a per-instance memoised promise (carryover from iter1 IN-02)

**File:** `src/lib/rate-limit.ts:307-323`

**Issue:** Concurrent first calls all observe `tableEnsured=false` and
all fire two `CREATE` statements. SQL is idempotent so correctness is
fine, but the cold-start burst pays `2N` round-trips instead of `2`.

**Fix:**

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

### IN-C: `parseInt` calls in `GET /api/admin/cards` lack a radix argument and don't validate the parsed number (carryover from iter1 IN-03)

**File:** `src/app/api/admin/cards/route.ts:17-18`

**Issue:** `parseInt(url.searchParams.get("page") ?? "1")` — no
radix, no `Number.isFinite` check. `?page=foo` produces `NaN`. The
helper presumably defends itself but the route is the right place
to enforce input validation symmetric with how PATCH validates
price/qty.

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

### IN-D: `getAdminHealthSnapshot` reports `database: "error"` when SELECT 1 succeeds but a per-table MAX read fails

**File:** `src/db/admin-health.ts:45-71`, `src/app/api/admin/health/route.ts:65-81`

**Issue:** The helper short-circuits with `database: "error"` only
when the SELECT 1 probe fails. If SELECT 1 succeeds but one of the
three subsequent `Promise.all` reads rejects (e.g., a missing table
during a partial migration, a transient timeout on a single query),
`getAdminHealthSnapshot()` throws — and the route's outer catch then
sets `database: "error"` and returns 503. That's actually the right
HTTP-level outcome (the system IS unhealthy), but the field name
"database: error" mischaracterizes the situation: the connection is
fine, a specific table read failed.

This is more of a labeling nit than a bug. Operators reading the
admin health page will see "Database: Error" with hint "SELECT 1
failed" — which is misleading.

**Fix:** Catch per-table read failures inside `getAdminHealthSnapshot`
and return `database: "ok"` with `null` timestamps and a separate
diagnostic field:

```ts
const results = await Promise.allSettled([
  lastTimestamp(sql`SELECT MAX(created_at) AS last_at FROM orders`),
  lastTimestamp(sql`SELECT MAX(committed_at) AS last_at FROM import_history`),
  lastTimestamp(sql`SELECT MAX(created_at) AS last_at FROM admin_audit_log`),
]);
return {
  database: "ok",
  lastOrderAt: results[0].status === "fulfilled" ? results[0].value : null,
  lastImportAt: results[1].status === "fulfilled" ? results[1].value : null,
  lastAuditAt: results[2].status === "fulfilled" ? results[2].value : null,
};
```

Then a separate flag (`tableReadFailures: number`) drives whether the
admin page surfaces a warning, and the route can decide on 503 vs
200 independently of `database: "ok"`.

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2_
