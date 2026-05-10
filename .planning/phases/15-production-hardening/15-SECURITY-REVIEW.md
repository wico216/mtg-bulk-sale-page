# Phase 15 Security Review: Admin and API Surfaces

**Reviewer:** Phase 15-02 executor (post-Phase 14, post-Phase 15-01).
**Date:** 2026-05-10.
**Scope:** Auth + admin route protection, admin mutation APIs, checkout API,
import preview/commit, audit/history and health surfaces, rate-limit bypass
possibilities, and secret-exposure risk in logs/health/docs. STRIDE-style:
**S**poofing, **T**ampering, **R**epudiation, **I**nformation disclosure,
**D**enial of service, **E**levation of privilege.

## Surface inventory

| Surface                              | File                                            | Auth | Rate limit |
|--------------------------------------|-------------------------------------------------|------|------------|
| Public app shell (`GET /`)           | `src/app/page.tsx`                              | none | none       |
| Checkout                             | `src/app/api/checkout/route.ts`                 | none | CHECKOUT 10/min (pre-body-parse) |
| Auth.js callbacks                    | `src/auth.ts`, `src/proxy.ts`                   | n/a  | (handled by next-auth) |
| Admin pages (`/admin/*`)             | `src/app/admin/*/page.tsx` + `proxy.ts`         | session check in proxy AND server pages | none (HTML pages) |
| Inventory list                       | `src/app/api/admin/cards/route.ts` GET          | requireAdmin | none on read |
| Delete all                           | `src/app/api/admin/cards/route.ts` DELETE       | requireAdmin | ADMIN_BULK 20/min |
| Inventory edit                       | `src/app/api/admin/cards/[id]/route.ts`         | requireAdmin | ADMIN_MUTATION 60/min |
| Bulk delete                          | `src/app/api/admin/cards/bulk-delete/route.ts`  | requireAdmin | ADMIN_BULK 20/min |
| Inventory CSV export                 | `src/app/api/admin/export/route.ts`             | requireAdmin | none |
| Import preview                       | `src/app/api/admin/import/preview/route.ts`     | requireAdmin | **none** (see I-DOS-01) |
| Import commit                        | `src/app/api/admin/import/commit/route.ts`      | requireAdmin | ADMIN_BULK 20/min |
| Orders list / detail                 | `src/app/api/admin/orders/**`                   | requireAdmin | mutations: ADMIN_MUTATION |
| Order cancel                         | `src/app/api/admin/orders/[id]/cancel/route.ts` | requireAdmin | ADMIN_MUTATION |
| Admin health (page + JSON)           | `src/app/admin/health/page.tsx`, `src/app/api/admin/health/route.ts` | requireAdmin | none (read-only) |
| Audit/history page                   | `src/app/admin/audit/page.tsx`                  | session check | none |

The proxy (`src/proxy.ts`) intentionally **passes through** `/api/admin/*` to
the route handlers; the route handlers are the authoritative gate via
`requireAdmin()`. The proxy only protects HTML admin routes.

## Findings

Severity scale: **High** (exploitable / data-loss / privilege-escalation),
**Medium** (limits realistic only under abuse, no direct exploit),
**Low** (defense-in-depth / hygiene). Phase column: which phase will fix it.

### S-01 — Spoofing: Single-string admin email comparison (Medium, deferred)

`src/lib/auth/helpers.ts` does `email === process.env.ADMIN_EMAIL`. The
comparison is case-sensitive. Auth.js gives us the email reported by the OAuth
provider; Google verifies the email is owned by the signed-in account.

- **Exploit scenario:** None directly — to spoof, an attacker would need to
  pass Google OAuth as the admin account, which requires compromising the
  admin's Google account. Out of scope for the friend-store threat model.
- **Defense-in-depth gap:** No `.toLowerCase()` normalization; if the admin's
  primary Google email differs in case from `ADMIN_EMAIL` env value, the admin
  is silently locked out (the failure mode is "403 access denied"). The health
  page now documents this in the failure-diagnosis table.
- **Remediation:** Normalize both sides to lowercase before comparing.
- **Fixed in Phase 15?** No — out of scope. Deferred to a 15-03 hardening
  follow-up or v1.3.

### T-01 — Tampering: Checkout requested vs available stock (resolved)

Concern: a malicious checkout request could request `Number.MAX_SAFE_INTEGER`
copies of a card and starve other buyers via the locking subquery.

- The DB layer (`src/db/orders.ts > placeCheckoutOrder`) computes
  `requested_agg`, then performs `FOR UPDATE` on the locked card rows; if the
  requested quantity exceeds available, the `conflicts` CTE rejects the order
  and stock is NOT decremented. Lock is held briefly (single SQL statement),
  not for the duration of email sends.
- Request validation in `route.ts` rejects non-positive integer quantities
  before the DB call.
- **Remediation:** None required. The transactional design is correct.
- **Fixed in Phase 15?** N/A — preexisting Phase 11 design verified.

### T-02 — Tampering: Audit metadata bounded by sanitizer (resolved)

Concern: an admin could pass arbitrarily large or sensitive metadata into an
audit entry via `AdminMutationAuditContext.metadata`.

- `sanitizeAdminAuditMetadata()` truncates strings to 320 chars, arrays to
  50 items, object keys to 40, depth to 4 levels, total JSON to 4096 bytes,
  and **redacts** keys matching `password|secret|token|api_key|authorization|
  cookie|session|credential` (`SENSITIVE_AUDIT_KEY_PATTERN`) and raw-content
  keys (`RAW_CONTENT_AUDIT_KEY_PATTERN`).
- The Phase 14 test suite (`src/db/__tests__/admin-audit.test.ts`) pins both
  the redaction and the truncation behavior.
- **Remediation:** None.
- **Fixed in Phase 15?** N/A — Phase 14 design.

### R-01 — Repudiation: Append-only audit + import history (resolved)

- `admin_audit_log` and `import_history` are `INSERT`-only tables; no UPDATE
  or DELETE statements are issued anywhere in the codebase.
- Phase 15-01 added structured `logEvent`/`logError` calls on every
  high-impact admin mutation route and on the checkout commit path, so even if
  DB inserts fail, the operational log retains the actor + action.
- **Remediation:** Phase 15 should add a periodic backup/export of the audit
  tables before the friend-store is shared with more users. The README backup
  section describes the `pg_dump` workflow.
- **Fixed in Phase 15?** Documentation only (README runbook section).

### I-DISC-01 — Information disclosure: Health endpoint env-value redaction (resolved)

- Both `/api/admin/health` and `/admin/health` render `configured` /
  `missing` literals only. The route-handler test
  `never includes secret values in the response, even when env values are set
  to obvious markers` is a regression pin for this property.
- The page rendering uses `STATUS_LABELS` / `STATUS_CLASSES` lookup tables —
  there is no path from `process.env.*` to user-visible text.
- **Remediation:** None — the contract is enforced by tests.
- **Fixed in Phase 15?** Yes (15-02).

### I-DISC-02 — Information disclosure: Server logs redact secrets (resolved)

- `src/lib/logger.ts` deep-redacts secret-shaped keys before
  `JSON.stringify`, with `safeErrorSummary()` stripping stack traces.
- `src/lib/__tests__/logger.test.ts` covers nested redaction,
  cookie/authorization/password keys, and a `toJSON()` smuggling attempt.
- **Remediation:** None.
- **Fixed in Phase 15?** Yes (15-01).

### I-DISC-03 — Information disclosure: Notification failure visibility (Medium, deferred)

Concern: Phase 15-01 added `notification.*_failed` log events but there is no
queryable surface. Admins cannot answer "how many emails have we lost in the
last 24h?" from the UI; they must search Vercel function logs by hand.

- `/api/admin/health` exposes `notificationFailuresLast24h: null` and the
  admin health page labels the tile "Unknown — log drain not yet wired", so
  the limitation is now explicit and not silently hidden.
- **Remediation:** A future phase should either (a) persist notification
  attempts/outcomes to a small `notification_events` table, OR (b) wire an
  external log drain (Datadog/Logtail/Better Stack) and query it.
- **Fixed in Phase 15?** Surfaced and documented; deferred for implementation.

### I-DISC-04 — Information disclosure: Public storefront enumeration (acceptable)

- `GET /` and the storefront fetch all cards (no pagination) and render
  pricing/condition. This is the intended product behavior — the storefront
  is public by design (no buyer accounts; D-12).
- No PII is rendered on the public store.
- **Remediation:** None — out of scope by product design.

### D-DOS-01 — Denial of service: Import preview is not rate-limited (Medium, deferred)

Concern: `POST /api/admin/import/preview` is `requireAdmin()`-gated but NOT
behind a rate-limit bucket. It accepts arbitrarily many CSV files (`getAll(...)`)
and triggers an `enrichCards()` Scryfall pass with up to ~150 outbound HTTP
requests per call (per the `maxDuration = 300` comment). A compromised admin
session or a buggy client loop could:

1. Cost real money on Scryfall API usage (free, but rate-limited at 100/min).
2. Saturate the function with 300s-long workloads.

- The preview endpoint also accepts FormData with **no upper bound on
  uploaded file size**. Vercel's body-size limit applies (~4.5MB on
  Functions), but a single 4.5MB CSV is still a lot of rows.
- **Exploit scenario:** Requires an admin session, so it's not a public DoS.
  It is a self-foot-gun for the admin and a credential-theft amplifier.
- **Remediation:** Add `ADMIN_BULK` rate-limit (post-auth) to the preview
  route; reject CSVs larger than e.g. 2MB up front; cap total parsed-row
  count at e.g. 10_000.
- **Fixed in Phase 15?** No — out of scope for 15-02 (15-02 owns health +
  smoke + docs). Filed as a 15-03 hardening item and noted in this review.

### D-DOS-02 — Denial of service: Rate-limit storage growth (acceptable)

- The Postgres `rate_limit_hits` table grows unbounded; the Phase 15-01
  SUMMARY documented this as a slow leak.
- **Remediation:** A periodic `DELETE WHERE hit_at < NOW() - INTERVAL
  '1 hour'` should be added before wider sharing. Currently the friend
  store has low traffic, so the table grows slowly.
- **Fixed in Phase 15?** Documented in 15-01 SUMMARY; deferred.

### D-DOS-03 — Rate-limit bypass via header spoofing (Medium, deferred)

Concern: `clientKeyFromRequest()` uses `x-forwarded-for` then `x-real-ip`,
with a hard-coded `"unknown"` fallback. A caller that controls both headers
can spoof an arbitrary IP and rotate it to evade per-IP rate limits.

- **Reality on Vercel:** Vercel sets `x-forwarded-for` itself and overwrites
  any client-provided value (per Vercel docs on request headers). On the
  Vercel runtime this is not exploitable in practice.
- **Reality on local dev or non-Vercel hosting:** The header is trusted as
  the client sends it, so the rate limit is bypassable. The friend store is
  Vercel-only, so this is acceptable, but a future move to self-hosted
  Next.js would need a trusted-proxy header allowlist.
- **Remediation:** Document the Vercel dependency. Long-term: parse the
  rightmost trusted IP from `x-forwarded-for` and only honor the header on
  requests we know came through Vercel's edge.
- **Fixed in Phase 15?** Documented here; deferred.

### E-PRIV-01 — Elevation of privilege: Proxy passthrough on `/api/admin/*` (resolved)

Concern: Could a misconfigured proxy let an unauthenticated request reach an
admin route handler that then performs work without re-checking auth?

- Every admin route file begins with `const result = await requireAdmin();`
  and short-circuits with the returned `Response` (401/403). I audited every
  file in `src/app/api/admin/**/route.ts` and confirmed this pattern.
- The proxy comment explicitly says "API route handlers are the authoritative
  gate". This is the correct design — the proxy alone is not a security
  boundary for API calls.
- **Remediation:** A lint rule could pin "every `/api/admin/**/route.ts` must
  call `requireAdmin()` before any data access" but is overkill for one
  developer.
- **Fixed in Phase 15?** Verified clean.

### E-PRIV-02 — Elevation of privilege: Auth-then-rate-limit ordering (resolved)

- 15-01 deliberately runs `enforceRateLimit()` **after** `requireAdmin()` on
  every admin route. The regression spec `rate-limit runs AFTER auth so an
  unauthenticated caller still sees 401, not 429` pins this on the
  bulk-delete and order-cancel routes.
- 15-02 production smoke script `DELETE /api/admin/cards (unauth)` covers
  this against the live deployment.
- **Remediation:** None.
- **Fixed in Phase 15?** Yes (15-01 design + 15-02 smoke).

### E-PRIV-03 — Local password-login fallback (resolved)

- `src/auth.ts` only registers the Credentials provider when
  `NODE_ENV !== "production" && ENABLE_PASSWORD_LOGIN !== "false"`. The
  production smoke verifies the local password field is absent on
  `/admin/login`. The `authorizeAdminCredentials` helper rejects any
  username not matching `ADMIN_USERNAME` AND `ADMIN_EMAIL`.
- **Remediation:** None.
- **Fixed in Phase 15?** Verified clean (Phase 8 design).

## Summary of follow-ups

| ID         | Severity | Status                | Owner    |
|------------|----------|-----------------------|----------|
| S-01       | Medium   | Deferred (15-03/v1.3) | follow-up |
| D-DOS-01   | Medium   | Deferred (15-03)      | follow-up |
| D-DOS-02   | Low      | Documented (15-01)    | follow-up |
| D-DOS-03   | Medium   | Documented            | follow-up |
| I-DISC-03  | Medium   | Surfaced (UI)         | log-drain phase |
| R-01       | Low      | Docs (README backup)  | done in 15-02 |

All **High** items are resolved. The remaining items are defense-in-depth or
self-foot-guns that require an attacker who already has admin credentials.
For the current friend-store threat model (one admin, small known friend
group, no payment data on the box) these are acceptable to ship; they should
be revisited before any meaningful expansion.

## Phase 15 outcome

This review records concrete admin/API findings and follow-ups (`OPS-05`).
Phase 15 ships with:

- A reviewed surface inventory.
- Zero High-severity findings.
- A short, named backlog for the next hardening pass.
