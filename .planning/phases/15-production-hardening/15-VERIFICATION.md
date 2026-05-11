---
phase: 15-production-hardening
verified: 2026-05-10T20:45:00Z
status: human_needed
score: 5/5 success criteria verified in code
success_criteria_met: 5/5
overrides_applied: 0
requirements_traceability:
  - id: OPS-01
    status: satisfied
    artifacts:
      - "src/lib/rate-limit.ts"
      - "src/app/api/checkout/route.ts (pre-body-parse CHECKOUT bucket)"
      - "src/app/api/admin/cards/route.ts (DELETE - ADMIN_BULK)"
      - "src/app/api/admin/cards/[id]/route.ts (PATCH + DELETE - ADMIN_MUTATION)"
      - "src/app/api/admin/cards/bulk-delete/route.ts (ADMIN_BULK)"
      - "src/app/api/admin/import/commit/route.ts (ADMIN_BULK)"
      - "src/app/api/admin/orders/[id]/route.ts (PATCH - ADMIN_MUTATION)"
      - "src/app/api/admin/orders/[id]/cancel/route.ts (ADMIN_MUTATION)"
  - id: OPS-02
    status: satisfied
    artifacts:
      - "src/lib/logger.ts (deep redaction + safeErrorSummary + scrubErrorMessage)"
      - "Every Phase 15 route emits logEvent/logError on state transitions and catch paths"
      - "src/lib/notifications.ts (CR-03 fix: no plaintext PII; structured logEvent only)"
  - id: OPS-03
    status: satisfied
    artifacts:
      - "src/app/api/admin/health/route.ts (admin-gated; returns 'configured'/'missing' literals only)"
      - "src/app/admin/health/page.tsx (admin-gated server page; STATUS_LABELS lookup)"
      - "src/db/admin-health.ts (DB SELECT 1 probe + parallel MAX reads)"
  - id: OPS-04
    status: satisfied
    artifacts:
      - "scripts/smoke-production.ts (5 read-only/guard checks; bails loudly on unexpected 200 from DELETE)"
      - "package.json (npm run smoke:production)"
      - "README.md (Production smoke section + bypass-token doc)"
  - id: OPS-05
    status: satisfied
    artifacts:
      - ".planning/phases/15-production-hardening/15-SECURITY-REVIEW.md (STRIDE; 0 High, 4 deferred Medium, 2 Low documented)"
human_verification:
  - test: "Sign in to /admin/health locally and confirm every check is green and no env values appear in HTML source"
    expected: "Database = OK, Auth secret/Google OAuth/Email = Configured. View source contains 'configured' / 'missing' literals only, never AUTH_SECRET/RESEND_API_KEY/GOOGLE_SECRET values."
    why_human: "Requires running `npm run dev` and signing in as the admin Google account. The page is admin-gated; automated check cannot mint a session."
  - test: "Run `npm run smoke:production -- --deployment <vercel-url>` against the live deployment"
    expected: "5/5 checks pass. The DELETE /api/admin/cards (unauth) probe MUST return 401 — exit code 0."
    why_human: "Requires a live Vercel deployment URL; cannot run programmatically in this verifier. Verifies the security guarantee end-to-end against production."
  - test: "Manual rate-limit hammer against deployed /api/checkout"
    expected: "Burst of 11+ checkout POSTs from one IP within 60s returns 429 with Retry-After header on the 11th; the burst inserts no orders past the limit."
    why_human: "Requires live deployment with Postgres rate-limit store + ability to inspect orders table without polluting it."
---

# Phase 15: Production Hardening Verification Report

**Phase Goal:** "The store has production guardrails, diagnostics, and repeatable verification before wider sharing"
**Verified:** 2026-05-10T20:45:00Z
**Status:** human_needed (all code-verifiable criteria PASS; live-deployment items remain)
**Re-verification:** No — initial verification.

## Goal Achievement

All five success criteria are verified true in the codebase. Code-only verification cannot prove items that require a live Vercel deployment or a real signed-in browser session — those are listed under `human_verification`.

### Observable Truths (Success Criteria)

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | Checkout and admin mutation APIs have production-compatible rate limits | VERIFIED | `src/lib/rate-limit.ts` ships sliding-window helper with atomic CTE on Postgres + fail-open on store failure; `enforceRateLimit` wired into checkout (pre-body-parse, CHECKOUT 10/min, line 61) and every admin mutation handler (lines listed in OPS-01 traceability). |
| 2 | Critical workflows emit safe structured logs for success and failure states | VERIFIED | `src/lib/logger.ts` deep-redacts secret-shaped keys, scrubs Postgres unique-constraint PII (WR-08), guards throwing getters (WR-D), and emits one JSON line per call. Every checkout/admin/notification state transition calls `logEvent`/`logError`. No stray `console.log` outside the logger module (`grep` returns only a comment reference in notifications.ts:17 documenting the removed CR-03 line). |
| 3 | Admin can inspect operational health without exposing secrets | VERIFIED | `/api/admin/health` (route.ts:59-117) and `/admin/health` (page.tsx:81-258) both call `requireAdmin()`/`auth()`+`isAdminEmail` before rendering. Config checks return literal `"configured"`/`"missing"` strings only; `STATUS_LABELS` lookup table is the only path from env-state to UI text. Health page nav link present in `src/app/admin/layout.tsx:51-54`. |
| 4 | Production smoke checks are repeatable through a checked-in script | VERIFIED | `scripts/smoke-production.ts` exists (28 KB) with 5 checks: `GET /`, `GET /admin/login` (Google visible + password hidden), `GET /admin` (302/307/308 redirect), `DELETE /api/admin/cards` (must be 401 — bails on 200 per WR-04 with CRITICAL detail), `GET /api/admin/health` (must be 401). Wired via `package.json:11` as `npm run smoke:production`; `--help` runs without secrets (verified). |
| 5 | Admin/API surfaces have a documented security review with concrete follow-ups | VERIFIED | `.planning/phases/15-production-hardening/15-SECURITY-REVIEW.md` is 253 lines of STRIDE-style review covering 13 surfaces. Zero High-severity. Concrete deferred follow-ups: S-01 (case-sensitive admin email), D-DOS-01 (import preview rate-limit), D-DOS-02 (rate_limit_hits TTL), D-DOS-03 (XFF spoofing on non-Vercel), I-DISC-03 (notification failure queryability). Each entry has exploit scenario + remediation + owner phase. |

**Score:** 5/5 success criteria verified in code. Three additional items routed to human verification because they require a live deployment or real signed-in session.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/rate-limit.ts` | Sliding-window rate-limit helper with Postgres + memory stores | VERIFIED | 699 lines. Exports `checkRateLimit`, `enforceRateLimit`, `clientKeyFromRequest`, `createMemoryRateLimitStore`, `createPostgresRateLimitStore`, `getDefaultRateLimitStore`, `RATE_LIMIT_BUCKETS`. Atomic CTE on Postgres (`checkAndRecord`, lines 435-494) with honest WR-A docstring about plain-INSERT residual concurrency. Fail-open on store failure (CR-02, lines 670-684). |
| `src/lib/logger.ts` | Structured logger with deep redaction | VERIFIED | 285 lines. Exports `logEvent`, `logError`, `safeErrorSummary`. `SECRET_KEY_SUBSTRINGS` (lines 41-61) covers password/secret/token/api_key/authorization/cookie/session/csrf/database_url/resend_api_key/client_secret/private_key/raw_csv/raw_body. WR-D throwing-getter + BigInt guards (lines 82-145, 220-247). WR-08 Postgres error-message scrub (lines 165-190). |
| `src/app/api/checkout/route.ts` | Rate-limited checkout with structured logs | VERIFIED | 177 lines. Rate-limit BEFORE body parse (line 61). Logs emitted: `checkout.rate_limited`, `checkout.validation_failed`, `checkout.db_failed`, `checkout.stock_conflict`, `checkout.order_committed`, `checkout.notification_partial`, `checkout.notification_failed`, `checkout.unexpected_error`. |
| `src/app/api/admin/cards/route.ts` | Auth + rate-limit + structured logs | VERIFIED | DELETE has `requireAdmin` then `enforceRateLimit(ADMIN_BULK)` (lines 67-84). GET has try/catch returning JSON 500 (WR-B, lines 49-63). |
| `src/app/api/admin/cards/[id]/route.ts` | Auth + rate-limit on PATCH and DELETE; JSON 500 on errors | VERIFIED | PATCH line 22 + DELETE line 116 both call `enforceRateLimit(ADMIN_MUTATION)`. PATCH has body-parse guard returning 400 JSON (lines 32-37). Both catch blocks return JSON 500 (WR-B, lines 102-105 and 138-141). |
| `src/app/api/admin/cards/bulk-delete/route.ts` | Auth + ADMIN_BULK + structured logs | VERIFIED | requireAdmin (37) → enforceRateLimit (41) → events `admin.bulk_delete.rate_limited`, `admin.bulk_delete.succeeded`, `admin.bulk_delete.failed`. |
| `src/app/api/admin/import/commit/route.ts` | Auth + ADMIN_BULK + structured logs | VERIFIED | requireAdmin (51) → enforceRateLimit (55) → events `admin.import_commit.{rate_limited,succeeded,failed}`. |
| `src/app/api/admin/orders/[id]/route.ts` | Auth + rate-limit + JSON 500 | VERIFIED | GET wraps `getOrderById` in try/catch with JSON 500 (lines 43-64). PATCH has `enforceRateLimit` (line 74) and catch path returns JSON 500 (CR-04 fix, lines 156-162). |
| `src/app/api/admin/orders/[id]/cancel/route.ts` | Auth + ADMIN_MUTATION + JSON 500 | VERIFIED | enforceRateLimit at line 31; events `admin.order_cancel.{rate_limited,succeeded,rejected,failed}`; catch returns JSON 500 (CR-04 fix, lines 106-112). |
| `src/app/api/admin/health/route.ts` | Admin health JSON endpoint, no secrets, 503 on DB error | VERIFIED | requireAdmin (60) before any state read. `envChecks()` returns literals only (lines 46-57). Returns 503 when `database === "error"` (line 115). |
| `src/db/admin-health.ts` | DB snapshot helper, secret-free | VERIFIED | 72 lines. SELECT 1 probe short-circuit (lines 48-57); parallel MAX reads (lines 59-63). No `process.env` access. |
| `src/app/admin/health/page.tsx` | Admin health page, server-rendered, admin-only | VERIFIED | 260 lines. `auth()` + `isAdminEmail` redirect gate (lines 82-88). `STATUS_LABELS`/`STATUS_CLASSES` lookup — no env-value path to UI text. `notificationFailuresLast24h` rendered as "Unknown — log drain not yet wired" per I-DISC-03 doc. |
| `src/app/admin/layout.tsx` | Health link in admin nav | VERIFIED | Health nav entry at line 51-54. |
| `scripts/smoke-production.ts` | Repeatable production smoke | VERIFIED | 11.7 KB. Five checks; `--help` works without secrets (verified by execution). Bypass-token never echoed. DELETE 200 bails as CRITICAL (WR-04, lines 229-235). |
| `package.json` | `smoke:production` script wired | VERIFIED | Line 11: `"smoke:production": "tsx scripts/smoke-production.ts"`. |
| `README.md` | Operator runbook | VERIFIED | Contains: env-vars matrix (line 35-36 sample), local verification, Production smoke section (line 68+), bypass-token doc, failure-diagnosis table (line 184+), backup workflow. |
| `src/lib/notifications.ts` | Structured logs, no PII | VERIFIED | CR-03 fix verified: only `logEvent`/`logError` with `orderRef`/`totalItems`/`totalPrice` metadata — buyer email/name/message/item names never logged. WR-06 SELLER_EMAIL runtime check (lines 51-59). |
| `.planning/phases/15-production-hardening/15-SECURITY-REVIEW.md` | STRIDE-style review with concrete follow-ups | VERIFIED | 253 lines. Surface inventory table, 13 STRIDE findings, summary table with severity/status/owner, follow-up backlog. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `checkout/route.ts` | `lib/rate-limit.ts::enforceRateLimit` | direct import + call before body parse | WIRED | Lines 5-9 (import), 61 (call). 429 → early return at line 71 before `await request.json()`. |
| Admin mutation routes (7 handlers) | `enforceRateLimit` | direct import + call after `requireAdmin()` | WIRED | All 7 admin mutation handlers (cards DELETE, cards/[id] PATCH+DELETE, cards/bulk-delete POST, import/commit POST, orders/[id] PATCH, orders/[id]/cancel POST) follow `requireAdmin()` → `enforceRateLimit()` ordering. Confirmed by grep across `src/app/api/admin`. |
| Every Phase 15 route + notifications.ts | `lib/logger.ts::logEvent/logError` | direct import + state-transition calls | WIRED | 41 grep hits across the 9 Phase 15 files; every catch block + every state transition emits a structured log. |
| `/admin/health` page + `/api/admin/health` route | `db/admin-health.ts::getAdminHealthSnapshot` | direct import + await | WIRED | Both surfaces import and await the same helper; results map to the same JSON shape so page and API stay consistent. |
| `/admin/health` page | `auth()` + `isAdminEmail` | admin-only gate via redirect | WIRED | Lines 82-88: unauthenticated → `/admin/login`, non-admin → `/admin/access-denied`. |
| `/api/admin/health` route | `requireAdmin()` | early 401/403 return | WIRED | Line 60-61, identical pattern to all other admin routes. |
| `package.json::smoke:production` | `scripts/smoke-production.ts` | npm script | WIRED | `tsx scripts/smoke-production.ts` shells the binary; `--help` execution succeeded. |
| Admin nav | `/admin/health` page | layout.tsx nav anchor | WIRED | Line 51-54 in `admin/layout.tsx`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `/api/admin/health` route | `snapshot` (lastOrderAt, lastImportAt, lastAuditAt) | `getAdminHealthSnapshot()` runs real `SELECT MAX(...)` queries against `orders`, `import_history`, `admin_audit_log` (db/admin-health.ts:59-63) | Yes (real DB queries; ISO timestamps) | FLOWING |
| `/admin/health` page | `snapshot` + `envState` | Same `getAdminHealthSnapshot()` + real `process.env.AUTH_SECRET`/`AUTH_GOOGLE_ID`/etc. | Yes (real DB + env reads) | FLOWING |
| `/api/admin/health` route | `notificationFailuresLast24h` | Hardcoded `null` | No — INTENTIONALLY DEFERRED per I-DISC-03 with explicit UI label "Unknown — log drain not yet wired" | RESERVED (acknowledged; not a stub) |
| `enforceRateLimit` (prod) | hits | Real Postgres `rate_limit_hits` table with atomic CTE | Yes (real DB) | FLOWING |
| Checkout `logEvent` calls | metadata | Real `orderRef`/`totalItems`/`totalPrice` from `placeCheckoutOrder` result | Yes | FLOWING |

The `notificationFailuresLast24h: null` is intentionally deferred per the security review (I-DISC-03) and the admin health page renders an explicit label so the limitation is visible to operators. The verifier classifies this as RESERVED (not a stub) because (a) the field is documented as reserved in the API contract; (b) the UI surfaces "Unknown — log drain not yet wired" rather than silently showing 0; (c) the security review records the follow-up.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Smoke help renders without secrets | `npm run smoke:production -- --help` | Help text printed; no env required; exit 0 | PASS |
| TypeScript compiles | `npx tsc --noEmit` | No output, exit 0 | PASS |
| Focused Phase 15 tests pass | `npx vitest run src/lib/__tests__/rate-limit.test.ts src/lib/__tests__/logger.test.ts src/app/api/admin/health/__tests__/route.test.ts src/db/__tests__/admin-health.test.ts src/app/api/checkout/__tests__/rate-limit-integration.test.ts` | 5 files, 40 tests, all pass (347ms) | PASS |
| Full repo test suite | `npm test` | 28 files, 272 tests, all pass (1.42s) | PASS |
| No stray console.log/warn/error outside logger | `grep -rn console.log\|console.warn\|console.error src/lib/notifications.ts src/app/api/checkout/route.ts src/app/api/admin/{cards,import,orders}` | Only one match: a comment in notifications.ts:17 documenting the CR-03-removed line | PASS |
| No debt markers in Phase 15 files | `grep -n TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER` across all 14 Phase 15 files | No output | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OPS-01 | 15-01-PLAN | Checkout and admin mutation APIs have production-compatible rate limits | SATISFIED | 8 wiring points across checkout + 7 admin mutation handlers; tests pin pre/post auth ordering + atomic check+record contract |
| OPS-02 | 15-01-PLAN | Critical workflows emit safe structured logs | SATISFIED | logEvent/logError calls on every state transition + catch path; redaction covers secret-shaped keys, BigInt, throwing getters, Postgres PII; no console.log bypasses |
| OPS-03 | 15-02-PLAN | Admin can inspect operational health without exposing secrets | SATISFIED | /admin/health page + /api/admin/health JSON; admin-gated; literals only; 503 on DB error; pinning test for "never includes secret values" |
| OPS-04 | 15-02-PLAN | Production smoke is repeatable and checked into the repo | SATISFIED | scripts/smoke-production.ts + npm run smoke:production; --help works; bails loudly on broken auth |
| OPS-05 | 15-02-PLAN | Security review records concrete admin/API findings | SATISFIED | 15-SECURITY-REVIEW.md; STRIDE; 0 High; 4 deferred Medium with named owners; remediation steps per finding |

All 5 requirements from REQUIREMENTS.md (OPS-01..OPS-05) are claimed by the two Phase 15 plans and verified satisfied. No orphaned requirements for Phase 15.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/notifications.ts` | 17 | `console.log` literal in comment | Info | Comment documents the CR-03 removal — not a real console.log. Acceptable. |
| `src/app/api/admin/health/route.ts` | 105 | `notificationFailuresLast24h: null` hardcoded | Info | Intentionally reserved per I-DISC-03; UI explicitly labels "Unknown — log drain not yet wired". Not a stub. |
| `src/app/api/admin/cards/route.ts` | 17-18 | `parseInt(...)` without radix (IN-C carryover from review) | Info | Acknowledged as Info-tier in 15-REVIEW.md; helper defends itself; not blocking the goal. |

No Critical or Warning anti-patterns. The three Info items match the final code-review state (0C/0W/4I) recorded in 15-REVIEW.md.

### Probe Execution

No project-conventional probes (`scripts/*/tests/probe-*.sh`) exist in this repo; the Phase 15 plan does not declare any probe paths. Skipping probe execution.

### Human Verification Required

Three items cannot be verified from the codebase alone — they require a live Vercel deployment or a real signed-in admin browser session. The status is therefore `human_needed` per the verifier decision tree (passing programmatic verification + any non-empty human items → `human_needed`).

#### 1. Local /admin/health browser verification

**Test:** Run `npm run dev`, sign in via the admin Google account at <http://localhost:3000/admin/login>, then visit <http://localhost:3000/admin/health>.

**Expected:**
- Every check shows OK / Configured.
- View source of the rendered HTML contains NO env values (e.g. no AUTH_SECRET, RESEND_API_KEY, AUTH_GOOGLE_SECRET literals).
- "Notification failures (24h)" tile says "Unknown — log drain not yet wired".

**Why human:** Admin-gated; the verifier cannot mint an authenticated Google session.

#### 2. Production smoke against the Vercel deployment

**Test:**

```bash
npm run smoke:production -- --deployment <your-vercel-url> \
  --bypass-token "$VERCEL_BYPASS_TOKEN"   # only if Vercel deployment protection is on
```

**Expected:** Exit 0; 5/5 checks pass. Especially: the DELETE /api/admin/cards (unauth) probe MUST return 401 — never 200.

**Why human:** Requires a live deployment URL; verifier cannot make remote HTTP calls against production.

#### 3. Manual rate-limit hammer

**Test:** From a single workstation, burst 12+ checkout POSTs against the deployment within 60s with a small valid cart, then check the `orders` table.

**Expected:**
- The 11th+ POST returns 429 with `Retry-After` header.
- No more than 10 orders are inserted from that IP in the 60s window.
- Vercel function logs show `checkout.rate_limited` warn lines for the 429s.

**Why human:** Requires live deployment with Postgres-backed rate-limit store + ability to inspect orders table without polluting it.

### Gaps Summary

**No gaps.** Every success criterion is verified true in the codebase. The fix-loop work (14 fix commits across iter-1 and iter-2) is reflected in the live code:

- `src/lib/rate-limit.ts`: atomic CTE present at lines 435-494; honest WR-A docstring at 385-433; fail-open on store failure at 670-684; bounded growth via opportunistic prune at 369-383.
- `src/lib/notifications.ts`: CR-03 PII removed; only structured `logEvent`/`logError` with safe metadata; SELLER_EMAIL runtime guard (WR-06).
- Admin order/cards routes: every catch path returns JSON 500 (CR-04 + WR-B); no Next default HTML 500 leaks.
- `src/app/api/admin/health/route.ts`: returns 503 when `database === "error"` so external monitors trip on DB outage.
- `src/lib/logger.ts`: WR-D throwing-getter + BigInt guards; WR-08 Postgres PII scrub.

The three items in `human_verification` are operational verifications that the phase explicitly routed to "operator-required pre-deploy steps" in 15-02 SUMMARY (Task 5 step 3 and step 4). They are NOT gaps — they are by design outside the scope of automated verification.

---

_Verified: 2026-05-10T20:45:00Z_
_Verifier: Claude (gsd-verifier)_
