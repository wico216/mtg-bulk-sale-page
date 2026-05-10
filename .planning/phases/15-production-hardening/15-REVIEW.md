---
phase: 15-production-hardening
reviewed: 2026-05-10T00:00:00Z
depth: standard
files_reviewed: 25
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
  critical: 4
  warning: 8
  info: 5
  total: 17
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-05-10
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Phase 15 lands a credible production-hardening surface: a sliding-window
rate limiter with a pluggable Postgres/memory store, a structured logger
with key-substring redaction, a read-only smoke script, and an admin
health endpoint/page. Auth ordering on admin routes is consistently correct
(`requireAdmin()` first, then `enforceRateLimit()` — so auth bugs surface as
401/403, not 429). The checkout route correctly rate-limits before parsing
the body. Test coverage of the new contracts (auth ordering, 429 retry-after
headers, redaction, env-value non-leakage) is unusually thorough.

Several real defects remain. The most serious are (1) a TOCTOU race in
`checkRateLimit` that lets concurrent requests exceed the configured limit
on serverless cold paths, (2) a permanently-poisoned default-store promise
in `getDefaultRateLimitStore` that turns a transient DB failure into a
permanent denial of service, (3) two admin routes re-throwing instead of
returning a JSON 500 (breaks the route's stated error contract and surfaces
the unfiltered error to Next's default error page), and (4) the
pre-existing `console.log("[ORDER]", JSON.stringify(order))` in
`notifications.ts` continues to dump full buyer PII (email, items, prices)
in plaintext to Vercel function logs — the new structured-logger story
documents "never log raw request bodies" but this exception was carried
forward unchanged. There are also operational concerns (unbounded
`rate_limit_hits` row growth, X-Forwarded-For trust documentation) and
a stated-contract violation in the in-memory store (`countHits` mutates
state despite the interface comment saying it must not).

## Critical Issues

### CR-01: `checkRateLimit` has a TOCTOU race — concurrent requests can exceed the configured limit

**File:** `src/lib/rate-limit.ts:87-116`
**Issue:** The decision is computed by reading `countHits` and then writing
`recordHit` in separate awaited steps. Between the two awaits, another
concurrent invocation (same `(bucket, key)`) can observe the same `count`
and also be admitted. On serverless platforms multiple concurrent function
instances are the norm, and a public-checkout flood from a single IP will
routinely race here. With limit=10 the system can admit 10 + N concurrent
callers when N requests are in flight at the boundary, then over the
remainder of the window the table holds 10+N hits and `count >= limit`
blocks normally — so the breach is bounded but real. The same race exists
in the in-memory store but is harder to trigger because JS is single-threaded
per instance; the Postgres-backed store is the real-world hazard because
multiple serverless instances each run their own awaits.

The doc comment on `RateLimitStore.countHits` ("Must not mutate state")
and the deliberate "do not record a hit when blocked" rule both depend on
count-then-record being atomic, which it isn't here.

**Fix:** Make the decision atomic per `(bucket, key)`. Two options:

```ts
// Option A: single atomic SQL that inserts + returns the post-insert count.
// In Postgres store recordHit:
const result = await db.execute<{ count: number }>(sql`
  WITH ins AS (
    INSERT INTO rate_limit_hits (bucket, key, hit_at)
    VALUES (${bucket}, ${key}, ${at})
    RETURNING 1
  )
  SELECT COUNT(*)::int AS count
  FROM rate_limit_hits
  WHERE bucket = ${bucket} AND key = ${key} AND hit_at > ${threshold}
`);
// Then have checkRateLimit branch on the returned count and *delete the row
// it just inserted* if it exceeded the limit, OR redesign the API so
// `record` returns `{ allowed, count }` and checkRateLimit no longer does
// the read-then-write dance.

// Option B: serialize per-key with a Postgres advisory lock around
// count + insert.
await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${bucket}|${key}`}))`);
```

Whichever you pick, document that count-and-record are atomic and add a
concurrent-requests test (run N `Promise.all` calls at the limit boundary
and assert exactly `limit` were admitted).

---

### CR-02: `getDefaultRateLimitStore` poisons its memoised promise on failure — one bad cold start denies service forever

**File:** `src/lib/rate-limit.ts:247-257`
**Issue:** `defaultStorePromise` is set on the first call to whatever
`createPostgresRateLimitStore()` returns. If the first call rejects (DB
unreachable at boot, `DATABASE_URL` typo, `ensureTable` fails), every
subsequent call **awaits the same rejected promise** and rejects with the
same error — for the lifetime of the function instance. There is no
recovery path short of an instance restart. Compounding this: `enforceRateLimit`
does not catch this rejection. In an admin route, the rejection unwinds
past `enforceRateLimit`, past the route handler (most admin routes have
no outer try/catch around the rate-limit call), and Next.js returns a
generic 500. The admin user sees a hard failure where the correct
behavior would be either (a) allow the request (fail-open with a logged
warning) or (b) deny cleanly with 503.

Same shape for `postgresStoreSingleton` — but that one is set INSIDE the
function, after `ensureTable` is configured, so on first call it's
actually fine; it only becomes a problem because `defaultStorePromise`
caches the surrounding awaited promise.

**Fix:** Don't cache rejected promises; or wrap the store creation so
failures fall back to the memory store with a clear log:

```ts
export function getDefaultRateLimitStore(): Promise<RateLimitStore> {
  if (defaultStorePromise) return defaultStorePromise;
  if (process.env.DATABASE_URL) {
    defaultStorePromise = createPostgresRateLimitStore().catch((err) => {
      // Don't poison the cache; reset so the next call can retry.
      defaultStorePromise = null;
      logError({ event: "rate_limit.store_init_failed", error: err });
      // Fail-open with an in-memory store rather than denying every request.
      return createMemoryRateLimitStore();
    });
  } else {
    defaultStorePromise = Promise.resolve(createMemoryRateLimitStore());
  }
  return defaultStorePromise;
}
```

Also catch inside `enforceRateLimit` so a store-level throw never bubbles
up to the route as a 500:

```ts
try {
  const store = args.store ?? (await getDefaultRateLimitStore());
  const decision = await checkRateLimit({ ... });
  if (decision.allowed) return null;
  return Response.json({ ... }, { status: 429, headers: { "Retry-After": ... } });
} catch (err) {
  // Defense-in-depth: rate-limit-store failure must never deny service.
  logError({ event: "rate_limit.enforce_failed", error: err });
  return null; // fail-open
}
```

---

### CR-03: `notifications.ts` writes full order data (buyer email, items, prices) to plaintext logs

**File:** `src/lib/notifications.ts:24`
**Issue:**

```ts
console.log("[ORDER]", JSON.stringify(order));
```

This is invoked on every checkout commit. `order` includes `buyerEmail`,
`buyerName`, the free-form `message`, and the full items array (card IDs,
prices, quantities). It bypasses the new redacting `logEvent`/`logError`
helpers entirely. Phase 15-01 explicitly added a redaction story to the
plan ("never log raw request bodies… auth headers, cookies, API keys")
and `src/app/api/checkout/__tests__/rate-limit-integration.test.ts:144-148`
asserts the new structured logs don't leak `viki@example.com` — but this
line goes to `console.log` directly, dumping the buyer's email as PII in
Vercel function logs, where retention is opaque and shared across the
team.

The comment "D-18: backup record" suggests this was deliberate at the
time, but it is inconsistent with the Phase 15 redaction story and with
the smoke script's claim that "No secret values are printed".

**Fix:** Replace with a redacted `logEvent`. If a true business-level
"backup record" is still wanted, route it through a separate audit table
(you already have `admin_audit_log`) rather than function logs:

```ts
logEvent({
  level: "info",
  event: "notification.order_received",
  route: "lib/notifications",
  metadata: {
    orderRef: order.orderRef,
    totalItems: order.totalItems,
    totalPrice: order.totalPrice,
    itemCount: order.items.length,
    // Intentionally omit buyerEmail, buyerName, message, item names.
  },
});
```

If you need to preserve the legacy "[ORDER] {…}" shape for an external
log drain that's already parsing it, gate it behind an env flag (e.g.
`LOG_FULL_ORDER_PAYLOAD=1`) and default it off.

---

### CR-04: `PATCH /api/admin/orders/[id]` and `POST /api/admin/orders/[id]/cancel` re-throw on DB error instead of returning a JSON 500 — breaks the route's documented error contract

**File:** `src/app/api/admin/orders/[id]/route.ts:140`, `src/app/api/admin/orders/[id]/cancel/route.ts:106`
**Issue:** Both handlers catch the underlying DB error, log it, and then
`throw err`. Every other admin route in this phase (bulk-delete, delete-all,
import commit) returns a `Response.json({ error: "…inventory unchanged" }, { status: 500 })`
on failure. Re-throwing here means:

1. The client sees Next.js's default error page (HTML, not JSON) and any
   `fetch().then(r => r.json())` consumer (the admin UI) explodes on the
   HTML body.
2. Depending on Next.js / runtime version the rethrown error may surface
   the raw `error.message` and stack in the dev overlay and in production
   error reporting — i.e., the same information the new logger goes out
   of its way to redact may end up in another channel.
3. The pattern is inconsistent across the codebase; reviewers /
   maintainers cannot trust that "5xx → JSON" is invariant.

**Fix:** Return a structured 500 JSON like the other routes:

```ts
} catch (err) {
  logError({
    event: "admin.order_workflow.failed",
    route: ROUTE,
    actor: result.user.email,
    error: err,
    metadata: { orderId: id },
  });
  return Response.json(
    { error: "Order update failed — order unchanged" },
    { status: 500 },
  );
}
```

Same change in `cancel/route.ts` (with appropriate copy). Add a test that
asserts a `mockUpdateOrderWorkflow.mockRejectedValue(...)` produces a 500
JSON, mirroring the existing test in `cards/__tests__/bulk-delete-route.test.ts`
("returns 500 with unchanged-inventory copy when deletion fails").

---

## Warnings

### WR-01: `clientKeyFromRequest` trusts the leftmost `X-Forwarded-For` token — bypassable on non-Vercel infra; not documented as Vercel-specific

**File:** `src/lib/rate-limit.ts:277-285`
**Issue:** `xff.split(",")[0]?.trim()` takes the leftmost token, which is
the convention on Vercel (Vercel's edge prepends the real client IP).
But:

- On any non-Vercel deployment (local Docker, behind nginx without
  `real_ip_recursive` configured, behind Cloudflare without
  `cf-connecting-ip` handling), the leftmost token is **client-supplied
  and trivially spoofable**: a malicious client sets
  `X-Forwarded-For: 1.1.1.1, 2.2.2.2, …` and rotates the leading value
  to bypass per-IP buckets.
- The fallback to `x-real-ip` then to `"unknown"` collapses all
  unknown-IP traffic into one shared bucket. That bucket is then
  trivially DoS-able (one bad actor can exhaust the public checkout
  bucket for everyone behind any proxy that strips XFF).
- Nothing in the code comment ties this implementation to Vercel
  specifically. If the project ever moves to another host this becomes
  an unannounced auth-bypass surface.

**Fix:**

- Add a code comment that this implementation **requires** the Vercel
  edge to be the source of XFF, and reject (or fail-closed) when XFF
  is absent in production.
- Prefer Vercel's `x-real-ip` header if available (Vercel sets both;
  `x-real-ip` is harder to spoof because the edge overwrites it).
- Consider falling the "unknown" bucket back to a per-route global
  bucket with a much lower limit (e.g., divide the configured limit
  by 10) so an attacker who strips proxy headers can't get a free
  pass.

### WR-02: `rate_limit_hits` table grows unbounded — never pruned

**File:** `src/lib/rate-limit.ts:182-194` (no DELETE/cleanup anywhere)
**Issue:** Every `recordHit` inserts a row. There is no scheduled
cleanup, no per-call sweep, no TTL. Over months on a Postgres database
with realistic public-checkout traffic this table will grow into
millions of rows. The `(bucket, key, hit_at DESC)` index keeps the
`countHits` query bounded, but disk usage, `VACUUM` cost, and
`pg_stat_statements` clutter all grow linearly.

A second concern: there is no migration file for this table
(no `drizzle/migrations` directory exists). The table is created
lazily by `CREATE TABLE IF NOT EXISTS` in `ensureTable()`. That means
the table exists in your production schema only after the first hit
of the first deployed instance, and its schema is invisible to
`drizzle-kit` — schema changes will have to be hand-coordinated.

**Fix:**

- Add a periodic cleanup. Cheapest: on each `recordHit`, opportunistically
  delete rows older than the longest configured window (e.g.,
  `DELETE FROM rate_limit_hits WHERE hit_at < NOW() - INTERVAL '5 minutes'`
  with `LIMIT 1000`). Run with low probability per call (e.g., 1 in 100)
  to amortize cost. Or schedule a Vercel Cron Job (`vercel.json`) that
  hits a `/api/admin/maintenance/rate-limit-prune` route.
- Move the table definition into `src/db/schema.ts` and a real migration
  so it's tracked by drizzle-kit.

### WR-03: In-memory store violates documented "must not mutate state" contract

**File:** `src/lib/rate-limit.ts:128-153`
**Issue:** `RateLimitStore.countHits` and `earliestHit` are documented as
"Must not mutate state". The memory implementation calls `pruneAndGet`
which `splice`s expired entries out of the stored array (line 142). Today
this is observationally a no-op (only entries that would never be returned
get removed), but the contract is now wrong and a future store
implementation that takes the doc comment at face value will be subtly
inconsistent. The same `pruneAndGet` is called from three different
methods, so a future bug here can corrupt counts.

**Fix:** Either (a) update the JSDoc to say "May prune entries that fall
outside the window but must not otherwise mutate state", or (b) make
`pruneAndGet` a pure read that filters without splicing, and prune only
in `recordHit`.

### WR-04: Smoke script DELETEs against production even on default ("read-only") mode

**File:** `scripts/smoke-production.ts:199-221`
**Issue:** The header comment claims "Default mode is READ-ONLY and
guard-focused. It never mutates production data unless a future flag
explicitly enables that". The code then issues an unauthenticated
`DELETE /api/admin/cards`. The argument is that `requireAdmin()` returns
401 before any state is touched — and that's correct in the happy case.
But:

1. The whole point of a smoke script is to probe a deployment that
   might be **misconfigured**. If the smoke runs against a deployment
   where the auth guard is broken (env vars missing, OAuth misconfigured,
   middleware not deployed), the DELETE is a destructive call from a
   script whose docstring says it doesn't make destructive calls.
2. Operators reading the script header will trust the "READ-ONLY" claim
   and may run this against more than one environment.

**Fix:** Use a safer probe verb that still exercises the guard. Two
options:

```ts
// Option A: HEAD instead of DELETE -- still hits requireAdmin().
method: "HEAD",

// Option B: GET (existing GET route also returns 401 via requireAdmin).
method: "GET",
```

Or, if you must keep DELETE, change the docstring to "Default mode is
guard-focused and assumes auth guards are correct" so the failure mode
is at least visible to the operator.

### WR-05: `enforceRateLimit` errors are not caught at the call site — store failure becomes a route 500

**File:** `src/app/api/admin/cards/route.ts:50-92`, similar pattern in every admin route
**Issue:** Tied to CR-02 but worth calling out at every admin route.
Most admin handlers look like:

```ts
const rateLimited = await enforceRateLimit({ ... });
if (rateLimited) return rateLimited;
try { /* business logic */ } catch (err) { /* 500 JSON */ }
```

If `enforceRateLimit` throws (DB outage, network blip on the rate-limit
store, ensure-table DDL failure), the throw bypasses the route's
try/catch entirely — Next.js returns a generic 500 HTML page or a
serverless function error. The route's invariant "rate-limit failure
should never trump auth result or business logic" is violated silently.

**Fix:** Either (a) catch around `enforceRateLimit` per route, or (b)
catch inside `enforceRateLimit` (preferred, see CR-02).

### WR-06: `notifications.ts` uses non-null assertion on `SELLER_EMAIL` — runtime crash if env is missing

**File:** `src/lib/notifications.ts:30, 56`
**Issue:** `to: [sellerEmail!]` and `replyTo: sellerEmail!` assume
`SELLER_EMAIL` is set. The new health endpoint will flag it as "missing",
but at runtime if a deploy ships without `SELLER_EMAIL`, `sellerEmail`
is `undefined` and `to: [undefined]` is passed to Resend. Resend will
reject; we land in the `sellerError` branch and the whole order fails
the seller-notify and returns `{ both: false }`. The order itself
already committed, so the buyer placed a successful order but the
seller never finds out and the buyer never gets a confirmation either.

Pre-existing, but Phase 15 added the health-endpoint signal that's
supposed to surface this — the runtime code still doesn't validate.

**Fix:** Validate env at module load (or first call) and degrade
cleanly:

```ts
if (!sellerEmail) {
  logError({
    event: "notification.seller_email_unconfigured",
    route: "lib/notifications",
    error: new Error("SELLER_EMAIL is not set"),
    metadata: { orderRef: order.orderRef },
  });
  return result; // both false; checkout route already handles partial
}
```

### WR-07: `/api/admin/health` returns 200 OK even when DB is unreachable

**File:** `src/app/api/admin/health/route.ts:96-109`
**Issue:** When `snapshot.database === "error"` the response body has
`ok: false` and `checks.database: "error"` but the HTTP status is 200.
External monitors (Pingdom, Datadog HTTP checks, Vercel Uptime, etc.)
typically alert on status code, not body content. A DB outage will not
trip an HTTP-status-based monitor.

**Fix:** Return 503 when overall `ok` is false, while keeping the
detailed body for human consumers:

```ts
return Response.json(body, { status: ok ? 200 : 503 });
```

Then update `scripts/smoke-production.ts` to expect 401 for the
unauthenticated probe (already does) and document that an authenticated
"all good" check should be a 200.

### WR-08: `safeErrorSummary` exposes raw `error.message` — Postgres errors can echo query parameter values including PII

**File:** `src/lib/logger.ts:111-127`
**Issue:** The logger redacts metadata keys but `error.message` is
copied verbatim. Postgres driver errors frequently include the failing
query and bound parameter values in their message (e.g., a unique-
constraint violation on `orders.buyer_email` produces something like
`duplicate key value violates unique constraint "orders_buyer_email_key": Key (buyer_email)=(viki@example.com) already exists`).
That message is then logged unchanged via `logError`. The
"no PII in logs" claim documented in 15-01 quietly fails on the
common-case error path.

**Fix:** Either (a) cap `message.length` and run the key-substring
redaction over `error.message` too (limited utility — values are not
keyed), or (b) add a known-Postgres-error filter that strips
`Key (...) = (...)` clauses, or (c) explicitly document this caveat
in the logger header and the security review.

---

## Info

### IN-01: `envChecks()` is duplicated across the health route and the health page

**File:** `src/app/admin/health/page.tsx:27-43` and `src/app/api/admin/health/route.ts:42-57`
**Issue:** Same logic, same env var names, same return type, written twice.
A future env var rename or check addition has to be done in two places
and will drift.

**Fix:** Move `envChecks()` and `isPresent()` into a single helper
(e.g., `src/lib/admin-health/checks.ts`) and import from both call
sites.

### IN-02: `ensureTable()` runs DDL on every cold-start path with no per-instance guard against concurrent firsts

**File:** `src/lib/rate-limit.ts:179-195`
**Issue:** `tableEnsured` is set after `db.execute` resolves; concurrent
first calls all observe `tableEnsured=false`, all fire the two `CREATE`
statements. SQL is idempotent so the result is correct, but you pay
2×N round-trips on first burst.

**Fix:** Memoise the first `ensureTable()` promise:

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

### IN-03: `parseInt` calls in cards `GET` and orders routes lack radix and don't validate the parsed number

**File:** `src/app/api/admin/cards/route.ts:17-18`
**Issue:** `parseInt(url.searchParams.get("page") ?? "1")` — no radix
argument (lint-flag in many configs) and no `Number.isFinite` check.
A request with `?page=foo` produces `NaN`, which then flows into
`getAdminCards`. The helper presumably defends itself (the test in
`route.test.ts` doesn't exercise this), but the route is the right
place to enforce input validation symmetric with how PATCH validates
price/qty.

**Fix:**

```ts
const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
```

The same `parseInt(..., 10)` correctness applies to the smoke script's
`--timeout-ms` flag (line 85), which already uses radix 10 — keep that
shape consistent.

### IN-04: `bulk-delete` route uses `MAX_BULK_DELETE_IDS = 500` but the rate-limit bucket caps to 20/min (limit × cap = 10k/min) — confirm intent

**File:** `src/app/api/admin/cards/bulk-delete/route.ts:11`, `src/lib/rate-limit.ts:303-307`
**Issue:** Not a bug, but worth a sanity check. With the bulk bucket at
20/min and 500 ids/call, an admin can DELETE 10,000 cards per minute
sustained. If 10k/min is the actual operational ceiling, fine. If
the intent was tighter (e.g., a couple of bulk operations per minute),
either reduce `MAX_BULK_DELETE_IDS` or split into a stricter bucket.

### IN-05: `dateFormatter` on the health page renders in US locale unconditionally

**File:** `src/app/admin/health/page.tsx:59-62`
**Issue:** `new Intl.DateTimeFormat("en-US", ...)`. For a single-admin
tool that's fine. Worth noting if a future contributor expects locale
following the admin's browser locale.

**Fix:** If desired, default to `undefined` locale (browser default)
or read `Accept-Language` from the request.

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
