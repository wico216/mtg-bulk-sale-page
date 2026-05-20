---
phase: 23-import-ux-price-refresh
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - src/app/admin/audit/_components/audit-table.tsx
  - src/app/admin/health/_components/__tests__/refresh-prices-button.test.tsx
  - src/app/admin/health/_components/refresh-prices-button.tsx
  - src/app/admin/health/page.tsx
  - src/app/admin/import/_components/__tests__/binder-picker.test.tsx
  - src/app/admin/import/_components/__tests__/import-client.test.tsx
  - src/app/admin/import/_components/binder-picker.tsx
  - src/app/admin/import/_components/import-client.tsx
  - src/app/api/admin/health/__tests__/route.test.ts
  - src/app/api/admin/health/route.ts
  - src/app/api/admin/prices/refresh/__tests__/route.test.ts
  - src/app/api/admin/prices/refresh/route.ts
  - src/app/api/cron/refresh-prices/__tests__/route.test.ts
  - src/app/api/cron/refresh-prices/route.ts
  - src/db/__tests__/admin-health.test.ts
  - src/db/admin-health.ts
  - src/db/queries.ts
  - src/lib/__tests__/price-refresh.test.ts
  - src/lib/enrichment.ts
  - src/lib/price-refresh.ts
  - src/lib/store/__tests__/binder-import-store.test.ts
  - src/lib/store/binder-import-store.ts
  - vercel.json
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: fixed
fixed_at: 2026-05-20T17:08:00Z
fixed_findings:
  - CR-01
  - WR-01
  - WR-02
  - WR-03
  - WR-04
  - WR-05
deferred_findings:
  - IN-01
  - IN-02
  - IN-03
  - IN-04
test_baseline:
  before: "540 passed, 2 skipped, 0 failed"
  after: "543 passed, 2 skipped, 0 failed (+3 new tests for CR-01/WR-02/WR-03)"
---

# Phase 23: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

The Phase 23 implementation delivers both vertical slices (Plan 23-01 price-refresh
service + cron/admin routes + health surface; Plan 23-02 picker UX changes)
and is structurally consistent with the PATTERNS.md spec. Auth gating, env
fail-closed behavior, audit-action enum extension, `getPrice` export, and the
single-render `onBulkSet` invariant are correctly implemented and well-tested.

However, the price-refresh "single-flight" advisory lock — load-bearing per
D-08 / Pitfall 4 — is **inoperative in production** because of the neon-http
driver's per-call session model. The lock is acquired on a transient HTTP
session that closes the instant the `SELECT pg_try_advisory_lock(...)` query
returns, so the lock is released BEFORE the actual refresh work runs. This is
a BLOCKER. The remaining findings are non-blocking quality issues (timing-attack
surface on the cron Bearer comparison, redundant store mutation, late `useRef`
declaration, and a couple of doc-vs-behavior drifts).

The test suite passes locally with the bug present because the advisory-lock
behavior is mock-asserted only (D-01 Tier-1 scope) and the mock returns a
single boolean per process. The bug surfaces only under real concurrent
invocation against Neon — exactly the scenario the lock was supposed to
prevent.

## Critical Issues

### CR-01: Advisory lock provides ZERO single-flight protection under neon-http (D-08 invariant violated)

**File:** `src/lib/price-refresh.ts:89-102`
**Issue:** `runPriceRefresh` acquires `pg_try_advisory_lock(hashtext('cron.refresh_prices'))`
via `db.execute(...)` on the neon-http driver. The project's own PITFALLS.md
(line 494) and the inline comment at price-refresh.ts:92-95 both state:
"`pg_advisory_lock` is auto-released at session end on Neon (`neon-http` opens
a fresh session per request)."

The neon-http driver opens a **new HTTP session for every `db.execute()` /
`db.select()` call** — not just once per `runPriceRefresh` invocation. Verified
in `src/db/client.ts`: `drizzle(process.env.DATABASE_URL!, { schema })` with
the `drizzle-orm/neon-http` import is the HTTP-based variant, which is
stateless by design.

Execution trace inside one `runPriceRefresh` call:
1. Line 96: `db.execute(SELECT pg_try_advisory_lock(...))` → session A opens,
   acquires lock 1234, session A **closes**, lock 1234 **released by Postgres**.
2. Line 108: `db.select().from(cards)` → session B opens (lock no longer held),
   reads rows, session B closes.
3. Line 197: `db.execute(UPDATE cards ...)` → session C opens (lock no longer
   held), runs UPDATE, closes.
4. Line 212: `await createAdminAuditEntry(...)` → session D opens, inserts
   audit row, closes.

A concurrent caller (cron-vs-manual race, Vercel at-least-once double delivery,
or a stuck-clicking operator) hitting line 96 between calls 1 and 4 in the
first invocation will get `acquired = true` because the first session has
already released the lock. Both callers proceed to full refresh + duplicate
audit-row writes. This is the exact failure mode Pitfall 4 was meant to
prevent ("Two `price_refresh_started` audit rows with overlapping timestamps;
Scryfall 429 rate-limit warnings clustered at the cron firing window").

The bug is invisible to the existing test suite because Case 8
(`price-refresh.test.ts:363`) only exercises the `acquired === false` branch
via a single hoisted `state.advisoryAcquired` flag — there is no test that
verifies the lock is held FOR THE DURATION of the work, and the D-01 Tier-1
scope explicitly excludes the live-DB advisory-lock integration test.

**Fix:** The lock must persist across all subsequent DB operations in the
same logical refresh. Two viable approaches:

Option A (preferred) — drop neon-http, use a session-pooled driver for this
one path. The lock then naturally lives for the duration of the connection.
This crosses the STACK.md neon-http invariant and is a larger change.

Option B (smaller blast radius) — replace advisory-lock single-flight with a
row-based sentinel that survives across HTTP sessions. Use an
`INSERT ... ON CONFLICT DO NOTHING RETURNING id` on a dedicated single-row
`price_refresh_lock` table whose row is deleted in `finally`:

```sql
-- one-time migration:
CREATE TABLE price_refresh_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- acquire (in runPriceRefresh):
INSERT INTO price_refresh_lock (id) VALUES (1) ON CONFLICT DO NOTHING RETURNING id;
-- if no row returned → another run is in flight → throw PriceRefreshLockedError

-- release (must run in finally{}):
DELETE FROM price_refresh_lock WHERE id = 1;
```

With a stale-lock guard (e.g. `WHERE acquired_at < NOW() - INTERVAL '10 minutes'`
in the INSERT's CONFLICT clause or a periodic cleanup) to recover from a
process crash that leaves a stuck row — which Pitfall 4's "warning signs"
note as the failure mode for sentinel-based approaches. This option directly
addresses the "secondary signal" path described at PITFALLS.md:466.

Whichever path is chosen, the `unchanged/updated/failed/skipped` counts in
the test suite remain correct — the bug is in concurrency control, not in
classification. But the in-code comment at price-refresh.ts:92-95 must be
rewritten to match reality: the current comment promises a guarantee the
code does not deliver.

## Warnings

### WR-01: Bearer-token comparison is non-constant-time (timing-attack surface on cron auth)

**File:** `src/app/api/cron/refresh-prices/route.ts:44`
**Issue:** `authHeader !== \`Bearer ${cronSecret}\`` is a JS string `!==` —
short-circuits at the first differing byte. The PITFALLS.md threat model treats
the cron secret as load-bearing ("Bearer-only is the load-bearing guard").
While a remote timing attack against a network-distant V8 string comparison is
practically infeasible for a 256-bit hex secret, the same defense-in-depth
posture that gates the secret behind `Bearer ${...}` formatting in the first
place should use constant-time comparison.

**Fix:** Use `crypto.timingSafeEqual` after length-equalization. Example:

```typescript
import { timingSafeEqual } from "node:crypto";

function bearerMatches(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const expected = `Bearer ${secret}`;
  // Length-equalize to keep timingSafeEqual valid; mismatched lengths fail.
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

// In handler:
if (!cronSecret || !bearerMatches(authHeader, cronSecret)) { /* 401 */ }
```

### WR-02: `runPriceRefresh` re-throws non-lock errors without releasing partial state; no `try/finally` around the lock

**File:** `src/lib/price-refresh.ts:96-226`
**Issue:** Tied to CR-01 but distinct: even if the advisory-lock model worked
correctly, there is no `try/finally` between lock acquire (line 96) and the
function's normal exit. If `fetchCardsByScryfallIds` throws (Scryfall outage),
or any of the chunked UPDATE statements fail (e.g. a transient Neon blip), the
function propagates the error to the route handler and the audit row is never
written. With the (broken) lock model, the lock would also remain held for the
remainder of the (already-closed) session. With a fix-forward to a sentinel-row
or transaction-bound mechanism (per CR-01), missing `finally` becomes a real
stuck-lock liability.

The "warning signs" callout in PITFALLS.md Pitfall 4 explicitly lists
"`pg_try_advisory_lock` not released on crash" as a Performance Trap to address.

**Fix:** Wrap the lock-acquire-through-audit-write in `try { ... } finally
{ /* release */ }`. With Option B from CR-01:

```typescript
const acquired = /* INSERT...ON CONFLICT DO NOTHING RETURNING id */;
if (!acquired) throw new PriceRefreshLockedError();
try {
  // ... read, classify, UPDATE, audit
} finally {
  await db.execute(sql`DELETE FROM price_refresh_lock WHERE id = 1`);
}
```

The audit row should also be written inside the try block (currently at line
212) so that a failed refresh STILL records the partial summary — otherwise
the only signal of a failed refresh is the structured logger, which is
non-queryable from the admin Audit page.

### WR-03: `updated` count is "rows intended to be updated", not "rows actually updated" — audit metadata can overstate

**File:** `src/lib/price-refresh.ts:179-204`
**Issue:** `updated++` (line 180) is incremented at row-classification time,
BEFORE the chunked UPDATE actually runs. If any chunk fails (constraint
violation, transient connection drop), the audit row at line 212 reports an
inflated `updated` count that doesn't match the database. The function would
throw and the audit write would be skipped — but only if the UPDATE itself
throws synchronously. neon-http UPDATE calls return an `UpdateResult`-like
object with `rowCount`; the current code discards that result.

The misalignment between the in-memory counter and the actual DB write is the
exact category of bug the v1.3.5 retrospective flagged in another path
(silent-skip patterns).

**Fix:** Sum the `rowCount` returned by each `db.execute(UPDATE ...)` call
and use that as the canonical `updated` figure. Pattern:

```typescript
let updatedActual = 0;
for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
  const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE);
  const valuesSql = sql.join(/* ... */);
  const result = await db.execute<{ rowCount?: number }>(sql`
    UPDATE cards SET price = v.price, updated_at = NOW()
    FROM (VALUES ${valuesSql}) AS v(id, price)
    WHERE cards.id = v.id
  `);
  // neon-http exposes affectedRows / rowCount; use whichever the driver
  // populates and assert it equals chunk.length in dev to catch drift.
  updatedActual += result.rowCount ?? chunk.length;
}
// Then write updatedActual (not updated) to the audit row.
```

### WR-04: Redundant `setLastSelection` call after `recordCommit` performs the same mutation

**File:** `src/app/admin/import/_components/import-client.tsx:480-483`
**Issue:** `recordCommit(newSelection)` (line 480) already sets
`lastSelection: { ...selection }` and `lastUsedAt` in one `set()` call
(`binder-import-store.ts:56-60`). The very next line calls
`setLastSelection(newSelection)`, which performs the same `lastSelection`
mutation but WITHOUT updating `lastUsedAt` — this is a no-op for `lastSelection`
content (already set to the same value by `recordCommit`) and a regression for
`lastUsedAt` semantics if `setLastSelection` is ever changed to preserve it.

The justification comment ("we set explicitly so a future store schema change
doesn't drift") is defensive but ends up coupling the import flow to BOTH
store actions; a future maintainer reading the store contract would reasonably
remove `setLastSelection` to slim the API, and this site would break silently.

**Fix:** Drop line 483 (`setLastSelection(newSelection);`). If the defensive
posture is important, leave a comment at the `recordCommit` call instead:

```typescript
// recordCommit handles BOTH lastSelection and lastUsedAt in one set();
// do NOT also call setLastSelection — that would clobber lastUsedAt logic
// if the store schema changes.
recordCommit(newSelection);
```

### WR-05: `filesByStageRef` declared mid-component, used by handlers defined earlier in the file

**File:** `src/app/admin/import/_components/import-client.tsx:519` (declaration)
vs. `src/app/admin/import/_components/import-client.tsx:298, 512` (uses)
**Issue:** `const filesByStageRef = useRef<File[] | null>(null);` is declared
on line 519, AFTER `handleConfirmPicker` (defined line 272-409, uses ref at
line 298) and `handleCancel` (line 503-513, mutates ref at line 512). This
works only because `useRef` is a hook call (runs at the top of each render in
declaration order) AND the handlers are closures that don't execute until
later events fire — by the time any handler runs, all `useRef` calls in the
component body have completed.

But the code reads as a TDZ violation at first glance. More importantly, if a
maintainer reorders or extracts handlers, they have to mentally re-derive that
the late-declared ref is still in scope. The existing `abortControllerRef` at
line 134 is the correct location pattern.

**Fix:** Move the `useRef<File[] | null>(null)` declaration to line 135 next
to `abortControllerRef`. Delete the explanatory comment block at lines 515-518
(it's an apology for the misplacement, not load-bearing context).

## Info

### IN-01: Doc-vs-behavior drift — `getPrice`'s "explicit overwrite" comment overstates Scryfall's guarantee

**File:** `src/lib/price-refresh.ts:170-172` and `src/lib/enrichment.ts:114-128`
**Issue:** The inline comment at price-refresh.ts:170-172 says "`priceUsd ===
null` IS a legitimate explicit overwrite per D-10 (Scryfall explicitly returned
`prices.usd === null`)." But `getPrice` returns `null` in two cases: (1) the
finish-specific field and ALL fallbacks are null/undefined; (2) the chosen
field is non-null but `parseFloat` produced `NaN`. Case (2) is not "Scryfall
explicitly returned null" — it's "Scryfall returned a string we couldn't parse".

For inventory price refresh this distinction probably doesn't matter (both
cases legitimately yield `price = null`), but the comment claims a stronger
contract than the helper provides.

**Fix:** Reword the comment block:

```typescript
const priceCents =
  // priceUsd === null means either Scryfall reported no usable price for
  // this finish (and no fallback finish had one) OR the price string was
  // unparseable. Both cases are treated as a legitimate write of null per
  // D-10 — distinct from "Scryfall didn't know about this card", which is
  // caught by the !scryfallMap.has(...) branch above.
  priceUsd === null ? null : Math.round(priceUsd * 100);
```

### IN-02: Per-row `price_refresh.not_found` logging could blow log volume on a fully-unmapped inventory

**File:** `src/lib/price-refresh.ts:155-160`
**Issue:** Every not_found row produces a `logEvent({ level: "info", ... })`
call with `metadata: { cardId, scryfallId }`. With ~12,749 inventory rows
(per CONTEXT) and ~11 known etched/obscure outliers, daily log volume is
fine. But if Scryfall has a partial-outage day (e.g. returns 200 with an
empty list for a whole `/cards/collection` batch), the failure mode is N
log lines for every row in that batch — potentially every day until the
inventory is re-mapped.

**Fix:** Either (a) downgrade the per-row log to debug level (most loggers
filter debug in prod), or (b) aggregate into a single
`price_refresh.not_found_batch` line with `failedIds: string[]` (still
bounded by Phase 14 audit-sanitization rules). Option (b) is more
operator-friendly because the failure pattern is visible in one log entry.

```typescript
// Aggregate at the end of the for-loop, then one log call:
const notFoundIds: string[] = [];
for (const row of rows) {
  // ... if (!scryfallMap.has(row.scryfallId)) { failed++; notFoundIds.push(row.scryfallId); continue; }
}
if (notFoundIds.length > 0) {
  logEvent({
    level: notFoundIds.length > 50 ? "warn" : "info",
    event: "price_refresh.not_found_batch",
    route: "lib/price-refresh",
    metadata: { count: notFoundIds.length, sample: notFoundIds.slice(0, 20) },
  });
}
```

### IN-03: `if (acquired !== true)` is unnecessarily strict for a boolean Postgres column

**File:** `src/lib/price-refresh.ts:99-102`
**Issue:** `lockResult.rows[0]?.acquired` is typed as `boolean` via the
`db.execute<{ acquired: boolean }>` generic. neon-http deserializes Postgres
`BOOLEAN` as JS `true`/`false`. The strict `!== true` check would treat
`undefined` (no rows returned — should never happen with `SELECT
pg_try_advisory_lock(...)`) as "not acquired" and throw `PriceRefreshLockedError`.
This is correct fail-closed behavior, but the strict check obscures intent.

This finding becomes moot once CR-01 is fixed (the lock mechanism changes
entirely), so flagged Info rather than Warning.

**Fix:** Use `if (!acquired)` — equivalent for `boolean | undefined` and reads
as "we didn't get the lock". Comment the intent if defending against the
`undefined` case matters.

### IN-04: `vercel.json` cron schedule comment-of-record lives in CONTEXT.md, not in `vercel.json`

**File:** `vercel.json:1-7`
**Issue:** The cron schedule choice (D-07: "02:00 PT / 04:00 CT / 05:00 ET —
off-peak globally") is documented only in CONTEXT.md. JSON doesn't support
inline comments, but the `vercel.json` schema does allow arbitrary top-level
fields — and `$schema` is already present. A future maintainer reading just
`vercel.json` has no way to see the rationale.

**Fix:** Either (a) add a sibling `README.md` note in repo root referencing
the cron file and rationale, or (b) move the cron config into
`vercel.json5`-style if Vercel supports it (it does not as of 2026-05). The
simplest mitigation is a `// vercel.json` lead-comment in the README that
points at the rationale's location. Lowest-priority polish.

---

## Fix Log

**Fixed at:** 2026-05-20T17:08:00Z
**Fixer:** Claude (gsd-code-fixer)
**Scope:** 1 critical + 5 warnings (IN-01..IN-04 deferred — out of scope this run)
**Test baseline:** 540 → 543 passed (+3 new tests), 2 skipped (unchanged), 0 failed

### CR-01 — Replace broken advisory lock with row-based lease

**Commit:** `779fc3a fix(23): CR-01 replace broken advisory lock with row-based lease in price_refresh_lock`

**Approach chosen:** Option B (row-based lease in a new `price_refresh_lock`
table). Option A (drop neon-http for this path) crosses the STACK.md
neon-http invariant and would require a connection-pooler driver alongside
the existing HTTP driver — a larger surface area for a single-flight fix.
The `pg_try_advisory_xact_lock` variant was considered but ruled out
against the driver: the rate-limit module's CR-01 comment in
`src/lib/rate-limit.ts:386-394` explicitly documents that the neon-http
driver does NOT support multi-statement transactions or session-level
advisory locks ("each db.execute is an independent HTTP call with
auto-commit"), so wrapping the refresh in a transaction is not an
available option without changing the driver.

**Implementation:**
- New `price_refresh_lock` table: single row with `id INTEGER PRIMARY KEY
  CHECK (id = 1)` + `acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- Lazy-created on first call via `CREATE TABLE IF NOT EXISTS` mirroring
  `createPostgresRateLimitStore.ensureTable()` (no drizzle migration).
- Acquire via atomic upsert:
  `INSERT INTO price_refresh_lock (id, acquired_at) VALUES (1, NOW())
   ON CONFLICT (id) DO UPDATE SET acquired_at = NOW()
   WHERE price_refresh_lock.acquired_at < (NOW() - INTERVAL '10 minutes')
   RETURNING id`
  Zero rows returned ⇒ throw `PriceRefreshLockedError`.
- Release via `DELETE FROM price_refresh_lock WHERE id = 1` in `finally`
  (covers WR-02's release-on-error requirement at the same time).
- 10-minute stale-lease recovery threshold safely above the 300s
  `maxDuration` ceiling and well above the observed ~26s cold-cache
  refresh.

**Test updates:** hoisted mock state renamed `advisoryAcquired` →
`lockAcquired`; mock recognises the new acquire SQL by string match.
Case 8 updated description to reflect the new mechanism.

### WR-01 — Constant-time Bearer comparison on cron route

**Commit:** `2c76c42 fix(23): WR-01 use timingSafeEqual for cron Bearer comparison`

Added `bearerMatches(authHeader, secret)` helper using
`node:crypto.timingSafeEqual` after length-equalization. Length mismatch
returns false immediately (revealing only the well-known header
shape "Bearer <hex>", not secret material). Equal-length case uses
`Buffer.from + timingSafeEqual` for the byte-level compare.

The existing 7 cron route tests pass unchanged:
- Case 1 (missing header) → early return
- Case 2 (wrong value with different length) → length-mismatch fast-path
- Case 4 (valid Bearer) → equal-length true path

### WR-02 — Audit-on-failure + try/finally release

**Commit (release):** `779fc3a` (folded into CR-01 — the lock cannot be
correct without `finally` release).
**Commit (audit-on-failure):** `cbf1a55 fix(23): WR-02 write partial audit row on refresh failure; lease release in finally`

Counters (`updated/unchanged/failed/skipped`) hoisted OUT of the try
block so the catch block can read them. Catch writes a partial-summary
audit row with the same locked-scalar D-04 metadata shape
`{trigger, updated, unchanged, failed, skipped, durationMs}` — no
new keys, no error-message leak, 4KB cap preserved. The catch swallows
its own write errors so an audit-write blip never masks the original
refresh error.

New tests:
- Case 9: Scryfall rejection mid-refresh ⇒ partial audit row written
  with the partial `skipped` count, then original error re-thrown.
- Case 10: lease release (`DELETE FROM price_refresh_lock`) appears in
  captured SQL on BOTH success AND failure paths, proving the finally
  block runs unconditionally.

### WR-03 — `updated` count reflects driver rowCount, not classification intent

**Commit:** `0611e69 fix(23): WR-03 use driver rowCount as the canonical updated count`

Removed the `updated++` increment at classification time. The chunked
UPDATE loop now reads `result.rowCount` from each chunk and sums into
`updated`, falling back to `chunk.length` only when the driver doesn't
populate rowCount (unit-test mocks). Production neon-http always
populates `rowCount` via FullQueryResults
(`@neondatabase/serverless` index.d.ts:277).

Hoisted mock state extended with `updateRowCount: number | null`; new
Case 11 sets `updateRowCount = 1` while classifying 2 rows for update,
asserts `summary.updated === 1` (driver value, not classification
intent), and verifies the audit metadata.updated + audit.targetCount
both carry the driver value.

### WR-04 — Dropped redundant `setLastSelection` mirror

**Commit:** `f62f05f fix(23): WR-04 drop redundant setLastSelection mirror after recordCommit`

`recordCommit(newSelection)` already handles both `lastSelection` and
`lastUsedAt` in one `set()` call. Removed the follow-up
`setLastSelection(newSelection)` call AND its now-unused selector
subscription at the top of the component. Replaced the defensive
comment with a single-source-of-truth explanation. All 14 import-client
tests pass unchanged.

### WR-05 — Hoisted `filesByStageRef` to top of component body

**Commit:** `ec70578 fix(23): WR-05 hoist filesByStageRef useRef to top of component body`

Moved `const filesByStageRef = useRef<File[] | null>(null)` up next to
`abortControllerRef` so both hook calls live at the top of the component
body. The original mid-component declaration worked at runtime (useRef
runs in declaration order during setup; handlers don't read the ref
until events fire) but read as a TDZ violation at first glance and was
fragile against refactors that reordered handlers. Comment moved with
the declaration and rewritten to document the WR-05 hoist rationale
instead of apologizing for the old misplacement.

### Deferred (out of scope for this run)

- **IN-01** — `getPrice` doc-vs-behavior drift. Comment rewording only;
  no functional impact.
- **IN-02** — Per-row `price_refresh.not_found` log volume. Tractable
  separately when log volume becomes a concern; current ~12k row
  inventory size makes this premature.
- **IN-03** — Moot: the strict `if (acquired !== true)` check it
  flagged is gone with the CR-01 lock replacement.
- **IN-04** — `vercel.json` rationale lives in CONTEXT.md, not in
  `vercel.json`. Lowest-priority polish; defer to a docs sweep.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Fixed: 2026-05-20T17:08:00Z_
_Fixer: Claude (gsd-code-fixer)_
