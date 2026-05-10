---
phase: 15-production-hardening
plan: 01
subsystem: ops
tags: [rate-limit, observability, security, checkout, admin]
requires:
  - 14-02
provides:
  - rate-limit-helper
  - structured-logging-helper
  - rate-limited-checkout
  - rate-limited-admin-mutations
  - structured-logs-on-write-surfaces
affects:
  - src/app/api/checkout/route.ts
  - src/app/api/admin/cards/route.ts
  - src/app/api/admin/cards/[id]/route.ts
  - src/app/api/admin/cards/bulk-delete/route.ts
  - src/app/api/admin/import/commit/route.ts
  - src/app/api/admin/orders/[id]/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/lib/notifications.ts
tech_stack:
  added: []
  patterns:
    - "Sliding-window rate limit with pluggable store (memory for tests/dev, Postgres for prod)"
    - "Structured JSON log lines with deep secret-shaped-key redaction"
    - "Rate-limit AFTER requireAdmin() on admin surfaces so auth bugs are not hidden behind 429"
    - "Rate-limit BEFORE body parse on public checkout so abuse cannot starve real users via JSON-parse cost"
key_files:
  created:
    - src/lib/rate-limit.ts
    - src/lib/logger.ts
    - src/lib/__tests__/rate-limit.test.ts
    - src/lib/__tests__/logger.test.ts
    - src/app/api/checkout/__tests__/rate-limit-integration.test.ts
  modified:
    - src/app/api/checkout/route.ts
    - src/app/api/admin/cards/route.ts
    - src/app/api/admin/cards/[id]/route.ts
    - src/app/api/admin/cards/bulk-delete/route.ts
    - src/app/api/admin/import/commit/route.ts
    - src/app/api/admin/orders/[id]/route.ts
    - src/app/api/admin/orders/[id]/cancel/route.ts
    - src/lib/notifications.ts
    - src/app/api/checkout/__tests__/route.test.ts
    - src/app/api/admin/cards/__tests__/route.test.ts
    - src/app/api/admin/cards/__tests__/bulk-delete-route.test.ts
    - src/app/api/admin/orders/__tests__/route.test.ts
    - src/app/api/admin/import/__tests__/commit.test.ts
decisions:
  - "Rate-limit storage = Postgres (Neon) via lazy CREATE TABLE IF NOT EXISTS; reuses existing vendor"
  - "Sliding-window counter, not token bucket -- correct on serverless without distributed clock sync"
  - "Per-IP + identity-suffix key on admin routes so two admins behind one NAT do not share a bucket"
  - "Bucket thresholds: CHECKOUT=10/min, ADMIN_MUTATION=60/min, ADMIN_BULK=20/min"
  - "Structured logs emit a single console JSON line per call; transport stays as Vercel function logs for v1.2"
  - "Errors are summarized to {name, message} only -- stack traces would leak filesystem paths"
metrics:
  duration_minutes: 14
  completed: "2026-05-10"
---

# Phase 15 Plan 01: Rate Limits and Structured Logs Summary

Production guardrails: every write surface (public checkout + every admin mutation) is now rate-limited with a serverless-safe sliding-window counter, and every state transition emits a structured JSON log line redacted of secrets/PII so post-mortems can use plain string search instead of regex archaeology.

## What was built

### `src/lib/rate-limit.ts` — sliding-window rate limit helper

Public surface:

- `checkRateLimit({ store, key, config, now? })` — pure decision function returning `{ allowed, remaining, retryAfterSeconds }`. Critically, **blocked attempts do NOT record a hit**, so abusive callers cannot extend their own window by retrying — the original first hit ages out at `firstHit + windowMs` regardless of further attempts.
- `enforceRateLimit({ key, config })` — route-level wrapper that returns either `null` (allowed, continue) or a 429 JSON `Response` with a `Retry-After` header. Mirrors the early-return shape of `requireAdmin()`.
- `clientKeyFromRequest(request, extra?)` — builds a stable key from `x-forwarded-for` / `x-real-ip` (Vercel sets these), with optional identity suffix so two admins on the same NAT do not share a bucket.
- `RATE_LIMIT_BUCKETS` — central place for thresholds:
  - `CHECKOUT` — 10/min, per-IP. Public; conservative.
  - `ADMIN_MUTATION` — 60/min, per (IP + admin email). Routine edits.
  - `ADMIN_BULK` — 20/min, per (IP + admin email). Destructive ops (delete-all, bulk-delete, import commit).

Two stores:

- **In-memory store** — `createMemoryRateLimitStore()`. Deterministic for tests; also the dev fallback when `DATABASE_URL` is unset.
- **Postgres store** — `createPostgresRateLimitStore()`. Lazy-created `rate_limit_hits` table with idempotent `CREATE TABLE IF NOT EXISTS` + index on `(bucket, key, hit_at DESC)`. Reuses the existing Neon connection — **zero new vendor**, which satisfies D-04 ("Use a storage mechanism compatible with Vercel/serverless") and the budget constraint in PROJECT.md.

The default store is memoised: first request creates one, subsequent requests share it. `__resetDefaultRateLimitStoreForTests()` exists purely to give per-spec hygiene in the integration test.

### `src/lib/logger.ts` — structured logging helper

- `logEvent({ level, event, route?, actor?, metadata? })` emits one JSON line per call to `console.log`/`warn` (depending on level).
- `logError({ event, route?, actor?, metadata?, error })` adds a `level: "error"` envelope and a `safeErrorSummary` of the error — just `{ name, message }`. Stack traces are intentionally omitted because they leak filesystem paths and sometimes secrets in the form `at /home/$USER/...`.
- Deep redaction: any nested key matching `password`, `secret`, `token`, `api_key`, `authorization`, `cookie`, `session`, `csrf`, `database_url`, `resend_api_key`, `client_secret`, `private_key`, `raw_csv`, `raw_body`, etc. is replaced with `"[REDACTED]"` BEFORE `JSON.stringify`. The dispatch also materialises `toJSON()` output before redaction so a sneaky custom serializer cannot smuggle a secret through.

### Rate limits and logs wired into every write surface

| Route | Method | Bucket | Position | Event names |
|---|---|---|---|---|
| `/api/checkout` | POST | CHECKOUT | **before body parse** | `checkout.{rate_limited, validation_failed, db_failed, stock_conflict, order_committed, notification_partial, notification_failed, unexpected_error}` |
| `/api/admin/cards` | DELETE (delete-all) | ADMIN_BULK | after auth | `admin.delete_all.{rate_limited, succeeded, failed}` |
| `/api/admin/cards/[id]` | PATCH | ADMIN_MUTATION | after auth | (rate-limit only; existing audit logs cover state) |
| `/api/admin/cards/[id]` | DELETE | ADMIN_MUTATION | after auth | (rate-limit only) |
| `/api/admin/cards/bulk-delete` | POST | ADMIN_BULK | after auth | `admin.bulk_delete.{rate_limited, succeeded, failed}` |
| `/api/admin/import/commit` | POST | ADMIN_BULK | after auth | `admin.import_commit.{rate_limited, succeeded, failed}` |
| `/api/admin/orders/[id]` | PATCH | ADMIN_MUTATION | after auth | `admin.order_workflow.{rate_limited, updated, failed}` |
| `/api/admin/orders/[id]/cancel` | POST | ADMIN_MUTATION | after auth | `admin.order_cancel.{rate_limited, succeeded, rejected, failed}` |
| `src/lib/notifications.ts` | (helper) | — | — | `notification.{seller_email_sent, seller_email_failed, buyer_email_sent, buyer_email_failed}` |

Two non-obvious choices, both deliberate:

- **Checkout rate-limits BEFORE parsing the body** so a flood of malformed JSON cannot starve real users via parse cost. The integration test `rate-limits checkout BEFORE parsing or validating the body` pins this.
- **Admin routes rate-limit AFTER `requireAdmin()`** so an authentication failure ALWAYS surfaces as 401/403, never tarpit'd into 429. This is verified by the regression spec `rate-limit runs AFTER auth so an unauthenticated caller still sees 401, not 429` on both the bulk-delete and order-cancel routes.

## Decisions

| Decision | Why |
|---|---|
| Postgres (Neon) for rate-limit storage | Already in use; zero new vendor; correct on serverless because every request writes a row, no shared memory needed |
| Sliding-window counter (not token bucket) | Simpler; correct without distributed clock sync; "blocked attempts don't extend the window" guarantee is trivial to implement |
| Bucket thresholds: 10/60/20 per minute | Conservative for public; generous for routine admin edits; tight for destructive bulk ops |
| Per-IP for public, per-(IP+email) for admin | Two admins on one NAT don't share a bucket; one rogue caller behind a shared IP can't burn a co-tenant's quota |
| Single JSON line per log call, console only | Vercel function logs are the v1.2 transport; external log drain deferred per D-deferred-1 |
| Errors = `{name, message}` only, no stack | Stacks leak filesystem paths and sometimes secrets |
| Deep redaction by key-substring match | Defense-in-depth — even if a caller forgets and passes `{password: ...}`, it never leaves the box |
| `__resetDefaultRateLimitStoreForTests` exported | Tests need per-spec hygiene; runtime never calls it |

## Verification

`git log` between `f04fc7b` (worktree base) and `HEAD` shows five commits — the TDD RED/GREEN gate plus two feature commits plus the integration verification:

```
1cde842 test(15-01): verify checkout rate-limit and notification logs end-to-end
f3fe9be feat(15-01): add structured logs to checkout and admin mutation workflows
444fbf7 feat(15-01): apply rate limits to checkout and admin mutation APIs
57ec601 feat(15-01): add rate-limit and structured logger primitives
ca9ab9d test(15-01): add failing tests for rate-limit and logger primitives
```

Test counts:

- Before plan: 224 tests, 23 files
- After plan: **241 tests, 26 files** (+17 tests, +3 files)

All required verifications pass:

| Verification | Status | Evidence |
|---|---|---|
| `git diff --check` | OK | exit 0 |
| `npx vitest run src/lib/__tests__/rate-limit.test.ts src/lib/__tests__/logger.test.ts` | 12 / 12 pass | the focused primitives suite |
| `npx tsc --noEmit` | OK | no output |
| `npm test` (full) | 241 / 241 pass | all suites green |
| `npm run build` | OK | full Next.js production build succeeds; route table includes every modified route handler |
| Local request proof for 429 | OK | `rate-limit-integration.test.ts` exercises the REAL `enforceRateLimit` and asserts saturation + 429 + zero DB mutation after the limit |
| Local proof for notification-failure log | OK | same test file: order commits succeed (201) while `notification_partial` warn is emitted; rendered JSON contains no `RESEND_API_KEY`, no buyer email, no cookie/authorization fields |
| No secrets in captured logs | OK | the integration test asserts the rendered log JSON has neither the test secret nor PII; the logger test suite covers redaction of nested cookie/authorization/password/raw_csv keys |

### Verification command transcript

```
$ npm test            # 241 passed (241), 26 files
$ npx tsc --noEmit    # (no output)
$ npm run build       # Next.js 16.2.2 (Turbopack) — Compiled successfully; all routes listed
```

The `npm run build` step required temporarily symlinking the project's `.env.local` because `/checkout` page collection needs `DATABASE_URL` and Auth env vars at build time; the file was removed before commit. This is pre-existing project behavior, not a new dependency introduced by Phase 15-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test files needed `vi.mock("server-only")`**
- **Found during:** Task 1 GREEN — first test run failed with `Cannot find package 'server-only'` because the new `rate-limit.ts` and `logger.ts` import `server-only`.
- **Fix:** Added `vi.mock("server-only", () => ({}));` to both new test files, matching the established pattern from `src/app/api/admin/cards/__tests__/route.test.ts` and the existing import-commit test.
- **Commit:** rolled into `57ec601` (the GREEN commit) — re-stating the convention in two more test files is mechanical and zero-risk.

**2. [Rule 3 — Blocking] `DELETE /api/admin/cards` handler signature changed**
- **Found during:** Task 2 — after wiring `enforceRateLimit({ key: clientKeyFromRequest(request, ...) })`, the existing test called `DELETE_ALL()` with no arguments and crashed at `request.headers.get(...)`.
- **Fix:** Made the `DELETE` handler accept a `Request` parameter (it had been omitted before, which was harmless when the body wasn't read but is non-negotiable now). Added a `makeDeleteAllRequest()` helper to the admin cards route test and updated three call sites. No production behavior change.
- **Commit:** rolled into `444fbf7`.

**3. [Rule 3 — Blocking] worktree had empty `node_modules`**
- **Found during:** Task 2 verification — `npx tsc --noEmit` reported missing modules for every dependency.
- **Fix:** Ran `npm install` inside the worktree. Standard worktree setup gap.
- **Commit:** N/A — installed dependencies are gitignored.

**4. [Rule 2 — Auto-add missing critical functionality] Rate-limit must NEVER mutate state when blocked**
- **Found during:** Task 1 design phase — the plan calls for "Rate limit responses are explicit and do not mutate state", which has a non-obvious subtlety: if blocked attempts ALSO record a hit, an abuser could indefinitely extend their own window. The naive implementation would do that.
- **Fix:** `checkRateLimit()` records a hit ONLY when the decision is `allowed`. The test `does not mutate hit counts when blocked` pins this invariant, and the integration test confirms it at the route layer.
- **Commit:** rolled into `57ec601`.

### Auth gates

None. The plan was fully self-contained — no external auth required during execution.

### Architectural changes (Rule 4)

None. The plan asked for a "lightest production-compatible rate limit storage already available" and Postgres was already in the stack, so no vendor decision was needed.

## Known Limitations / Deferred Observability

- **No external log drain.** Logs land in Vercel function logs (D-deferred-1). Switching to Datadog/Logtail/Better Stack is a `logEvent` transport change, not a call-site change — every emit point is centralised.
- **No `rate_limit_hits` cleanup job.** The Postgres store accumulates rows forever. For the small friend store this is a slow leak (Neon free tier is many millions of rows of headroom), but a TTL job or a periodic `DELETE WHERE hit_at < NOW() - INTERVAL '1 hour'` should be added before wider sharing. **This is intentionally deferred** because Phase 15-02 owns the production smoke / runbook and is the right place to fold it in.
- **Rate-limit thresholds are point-in-time guesses.** 10/min checkout and 60/min admin mutation are conservative starting points; real usage telemetry (a Phase 15-02 outcome) should re-tune them.
- **Health route (`/api/admin/health`) was NOT touched in this plan.** Plan 15-01 listed it in `files_modified` but the body of the plan only described tasks 1–4 covering checkout and admin mutations. Updating health is Phase 15-02's mandate (the CONTEXT.md `AdminHealthStatus` shape covers `notificationFailuresLast24h`, which depends on a queryable log source not built here). **Treat this as a scope clarification, not a deferral** — Phase 15-02 will own health enrichment.
- **Stack traces.** Not captured by `logError` by design. If a future failure-rate spike needs deeper diagnostics, the next phase can add a dev-only `error.stack` field gated by `NODE_ENV !== "production"`.

## Threat Flags

None. Every modified surface was already in the Phase 11/13/14 threat surface (checkout commits, admin mutations) — this plan adds defensive controls, not new exposure. The new `rate_limit_hits` table contains only operational telemetry (bucket name, opaque key derived from `x-forwarded-for`, timestamp); no PII, no payloads.

## Self-Check: PASSED

Files created (5):

- `src/lib/rate-limit.ts` — FOUND
- `src/lib/logger.ts` — FOUND
- `src/lib/__tests__/rate-limit.test.ts` — FOUND
- `src/lib/__tests__/logger.test.ts` — FOUND
- `src/app/api/checkout/__tests__/rate-limit-integration.test.ts` — FOUND

Files modified (13): all confirmed present and tracked by git.

Commits (5): `ca9ab9d`, `57ec601`, `444fbf7`, `f3fe9be`, `1cde842` — all reachable from `HEAD` in `git log --oneline f04fc7b..HEAD`.
