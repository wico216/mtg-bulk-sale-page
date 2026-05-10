---
phase: 15-production-hardening
plan: 02
subsystem: ops
tags: [health, smoke, runbook, security-review, admin]
requires:
  - 15-01
provides:
  - admin-health-endpoint
  - admin-health-page
  - production-smoke-script
  - operational-runbook
  - security-review
affects:
  - src/app/api/admin/health/route.ts
  - src/app/admin/health/page.tsx
  - src/app/admin/layout.tsx
  - src/db/admin-health.ts
  - scripts/smoke-production.ts
  - package.json
  - README.md
tech_stack:
  added: []
  patterns:
    - "Admin health surface returns configured/missing literals, never env values"
    - "DB SELECT 1 probe short-circuits per-table reads so a connection failure produces one clear signal"
    - "Production smoke is read-only/guard-focused; mutation is intentionally not behind a flag"
    - "Smoke supports Vercel deployment protection via x-vercel-protection-bypass without echoing the token"
key_files:
  created:
    - src/app/api/admin/health/__tests__/route.test.ts
    - src/db/__tests__/admin-health.test.ts
    - src/db/admin-health.ts
    - src/app/admin/health/page.tsx
    - scripts/smoke-production.ts
    - .planning/phases/15-production-hardening/15-SECURITY-REVIEW.md
  modified:
    - src/app/api/admin/health/route.ts
    - src/app/admin/layout.tsx
    - package.json
    - README.md
decisions:
  - "Health endpoint exposes notificationFailuresLast24h: null with explicit UI label until a queryable log source lands; field is reserved so the contract does not shift later"
  - "Smoke script's DELETE /api/admin/cards probe is intentional -- it proves auth-runs-before-rate-limit on a mutation method without actually mutating anything"
  - "Smoke help works without secrets: --help is documented as the local sanity step in the README"
  - "Security review records remaining items (S-01, D-DOS-01, D-DOS-03, I-DISC-03) as deferred follow-ups, not blockers; no High-severity findings remain"
metrics:
  duration_minutes: 9
  completed: "2026-05-10"
---

# Phase 15 Plan 02: Health, Smoke, Runbook, Security Review Summary

Operational surfaces are now durable: an admin-only health page and JSON endpoint
report DB reachability, env-configuration presence (never values), and recent
activity timestamps; a checked-in production smoke script runs read-only guard
checks against any deployment URL; the README is now an operator runbook with
env matrix, verification commands, backup process, and a failure-symptom table;
and a STRIDE-style security review records concrete findings with follow-ups.

## What was built

### `src/db/admin-health.ts` — health snapshot helper

`getAdminHealthSnapshot()` returns `{ database, lastOrderAt, lastImportAt,
lastAuditAt }`. It runs `SELECT 1` first; if that fails, it short-circuits to
`database: "error"` with null timestamps so one DB outage produces ONE clear
signal rather than four cascading errors. On success it issues three parallel
`MAX(...)` reads against `orders.created_at`, `import_history.committed_at`,
and `admin_audit_log.created_at`. The helper deliberately knows nothing about
`process.env` — configuration checks live at the route layer.

### `src/app/api/admin/health/route.ts` — admin health JSON endpoint

Replaces the Phase 15-01 stub. Admin-only via `requireAdmin()`. Returns:

```jsonc
{
  "ok": true,
  "checks": {
    "database": "ok" | "error",
    "authSecret": "configured" | "missing",
    "googleOAuth": "configured" | "missing",
    "email": "configured" | "missing"
  },
  "recent": {
    "lastOrderAt": "<ISO>" | null,
    "lastImportAt": "<ISO>" | null,
    "lastAuditAt": "<ISO>" | null,
    "notificationFailuresLast24h": null
  }
}
```

Non-obvious choices:

- The configuration checks read `process.env` directly. They never echo values;
  the response uses literal `"configured"` / `"missing"` strings. A regression
  test pins this by setting env values to obvious markers
  (`SECRET_AUTH_VALUE`, `GOOGLE_SECRET_VALUE`, `RESEND_VALUE`,
  `seller-marker@example.com`) and asserting the rendered JSON contains none
  of them.
- `notificationFailuresLast24h` is **reserved** as `null` because 15-01 emits
  `notification.*_failed` events only to Vercel function logs and there is no
  queryable surface yet. Keeping the field present means a future log-drain
  phase can flip it from `null` to a number without changing the contract.

### `src/app/admin/health/page.tsx` — admin health page

Server-rendered. Same admin gate as the JSON endpoint. Renders:

- A header banner with overall status badge.
- A "Checks" table: Database, Auth secret, Google OAuth, Email (Resend), each
  with a status pill (`OK` / `Configured` / `Missing` / `Error`) and a hint
  text that names the env keys WITHOUT echoing values.
- A "Recent activity" tile grid: last order, last import commit, last audit
  entry, and the deliberately-unknown notification failures tile.
- A pointer to the JSON endpoint for scripted access.

The admin nav (`src/app/admin/layout.tsx`) gains a Health link between Audit
and View store.

### `scripts/smoke-production.ts` + `npm run smoke:production`

A TypeScript script (run via `tsx`) that takes `--deployment <url>` and runs
five read-only checks:

| Check                              | Expectation |
|------------------------------------|-------------|
| `GET /`                            | 200, body contains `<html` |
| `GET /admin/login`                 | 200, contains "Sign in with Google", does NOT contain `id="admin-password"` |
| `GET /admin` (unauth)              | 302/307/308 to `/admin/login` |
| `DELETE /api/admin/cards` (unauth) | 401 from `requireAdmin()` |
| `GET /api/admin/health` (unauth)   | 401 from `requireAdmin()` |

Other knobs:

- `--bypass-token <token>` sends `x-vercel-protection-bypass` for deployments
  behind Vercel Deployment Protection. The token is never logged.
- `--timeout-ms <number>` overrides the 15s per-request timeout.
- `--json` emits a single JSON line for log-drain ingestion.
- Exit code is 0 on all pass, 1 otherwise.

`--help` runs without any env or secret — verified at the end of Task 3's
`npm run smoke:production -- --help`.

### `README.md` — operator runbook

Replaces the create-next-app stub with:

- A 1-paragraph product/stack summary.
- A Quick start section.
- An env-vars table mapping every key to the surface that depends on it.
- An environment matrix (local / preview / production).
- Local verification commands (`npm test`, `npx tsc --noEmit`, `npm run build`).
- Production smoke usage + Vercel deployment-protection notes + a "what it
  covers / does not cover" subsection.
- Operational runbook: health page semantics, backup & export workflow
  (CSV export + `pg_dump`), and a failure-diagnosis table that maps symptoms
  to the structured log events emitted by Phase 15-01.

### `.planning/phases/15-production-hardening/15-SECURITY-REVIEW.md`

STRIDE-style review of every surface in the admin/API/checkout footprint plus
audit/history and health. Findings are graded High / Medium / Low and tagged
either resolved, surfaced, documented, or deferred.

**Zero High-severity findings.** Resolved or accepted:

- Stock contention (T-01), audit metadata sanitization (T-02), append-only
  audit/history (R-01), health/log env redaction (I-DISC-01/02), public
  storefront enumeration (I-DISC-04 — acceptable by product design), proxy
  passthrough on admin APIs (E-PRIV-01), auth-then-rate-limit ordering
  (E-PRIV-02), local password-login fallback (E-PRIV-03).

Deferred follow-ups (Medium, none exploitable without admin credentials):

- **S-01** Admin email comparison is case-sensitive.
- **D-DOS-01** Import preview is admin-authed but not rate-limited and has no
  upload-size cap.
- **D-DOS-02** `rate_limit_hits` table grows unbounded (documented in 15-01).
- **D-DOS-03** Rate-limit header trust dependent on Vercel header sanitization.
- **I-DISC-03** No queryable count of notification failures.

## Decisions

| Decision | Why |
|---|---|
| Two helpers (`db/admin-health.ts` for DB, route for env) | Single-responsibility — the db helper has no business reading `process.env`, and the env checks have no business doing SQL |
| Health snapshot short-circuits on SELECT 1 failure | One clear "DB unreachable" signal beats four cascading per-table errors |
| `notificationFailuresLast24h` reserved as `null` | Keeping the field present means a future log-drain phase can flip null → number without changing the API contract or breaking consumers |
| Smoke runs `DELETE /api/admin/cards` unauthenticated | Proves auth-runs-before-rate-limit on a mutation method without ever mutating production data |
| Smoke help works without secrets | A fresh operator can read the interface before running anything live |
| Security review records deferrals, not blockers | All remaining items require admin credentials to exploit; acceptable for the friend-store threat model |

## Verification

`git log d7d87a7..HEAD --oneline` shows four commits — the TDD RED/GREEN gate
plus the operational surfaces plus the security review artifact:

```
07226e2 docs(15-02): add Phase 15 STRIDE-style security review
e6c8217 feat(15-02): add production smoke script and runbook docs
90229dd feat(15-02): implement admin health endpoint and admin health page
d128f7b test(15-02): add failing tests for admin health endpoint
```

Test counts:

- Before plan (post 15-01): 241 tests, 26 files
- After plan: **254 tests, 28 files** (+13 tests, +2 files)

| Verification | Status | Evidence |
|---|---|---|
| `git diff --check` | OK | exit 0, no whitespace issues |
| `npx vitest run src/app/api/admin/health/__tests__/route.test.ts src/db/__tests__/admin-health.test.ts` | 13/13 pass | dedicated focused suite for Task 1/2 |
| `npx tsc --noEmit` | OK | no output |
| `npm test` (full) | 254/254 pass | all suites green |
| `npm run build` | OK | full Next.js production build; `/admin/health` and `/api/admin/health` listed in route table |
| `npm run smoke:production -- --help` | OK | help renders with no env/secret prerequisite |
| No secrets in test/smoke output | OK | grep for `SECRET_AUTH_VALUE` etc. and for env-key markers returned nothing in both `npm test` and smoke `--help` outputs |

### Task 5 (full hardening checkpoint)

Programmatically verified inside this worktree:

- **Step 1** `git diff --check` — clean.
- **Step 2** Full TypeScript, tests, and build — all green.
- **Step 5** No secrets in logs or smoke output — grep verified.

Operator-required pre-deploy steps (Task 5 step 3 and step 4):

- **Step 3** Browser verification of `/admin/health` locally:
  1. `npm run dev`
  2. Visit <http://localhost:3000/admin/health> while signed in as the admin.
  3. Confirm every check is green and that NO env values appear in the page
     source.
- **Step 4** Production smoke against the live Vercel deployment:
  ```bash
  npm run smoke:production -- --deployment <your-vercel-url> \
    --bypass-token "$VERCEL_BYPASS_TOKEN"   # if protection is enabled
  ```
  Expected: 5 / 5 checks passed.

The README runbook documents both steps. They are intentionally manual —
attaching a real browser or a real deployment URL is the orchestrator/operator
responsibility post-merge.

The `npm run build` step required temporarily symlinking the main repo's
`.env.local` because `/checkout` and admin pages need `DATABASE_URL` + Auth env
at build time. The symlink was removed before commit and confirmed gone from
`git status`. This is the same pattern Phase 15-01 used; it is preexisting
project behavior, not a new dependency introduced here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] First Write calls placed test files in the main repo, not the worktree**
- **Found during:** Task 1 — `npx vitest run` reported "no test files found" after the Write calls succeeded.
- **Issue:** I passed absolute paths starting `/home/wiko/Projects/active/mtg-bulk-sale-page/...` which collapses to the main repo's tree, not the worktree's `.../worktrees/agent-.../...` tree. Exactly the failure mode the executor's path-safety guard warned about.
- **Fix:** Re-derived the worktree root with `git rev-parse --show-toplevel` and moved the misplaced files into the correct worktree location with `mv`. The empty `__tests__` directory inadvertently created in the main repo was removed with `rmdir` (only the empty dir I had just created — no destructive operation on tracked files).
- **Commit:** rolled into `d128f7b` (the RED commit).

**2. [Rule 3 — Blocking] worktree had no `node_modules`**
- **Found during:** Task 1 RED — first `npx vitest run` attempt failed before listing tests.
- **Fix:** Ran `npm install --prefer-offline --no-audit --no-fund` inside the worktree. Same gap Phase 15-01 documented.
- **Commit:** N/A — installed dependencies are gitignored.

### Auth gates

None. The plan was fully self-contained.

### Architectural changes (Rule 4)

None. The health surfaces extended an existing route stub; the smoke script is
a self-contained operational tool; the README is documentation.

## Known Stubs

None. The `notificationFailuresLast24h: null` field is **not** a stub — it is
a deliberately-reserved API contract slot with a matching UI label
("Unknown — log drain not yet wired") and an explicit decision in this
summary. The Phase 15-01 SUMMARY explicitly deferred the queryable log surface
that would back it; flipping `null` → `number` is the responsibility of a
future log-drain phase.

## Threat Flags

None introduced. The security review surfaced existing concerns but no new
attack surface is added by 15-02. The new `/admin/health` page and
`/api/admin/health` endpoint are admin-only and have pinning tests + a smoke
check that proves the 401 guard.

## Self-Check: PASSED

Files created (6):

- `src/app/api/admin/health/__tests__/route.test.ts` — FOUND
- `src/db/__tests__/admin-health.test.ts` — FOUND
- `src/db/admin-health.ts` — FOUND
- `src/app/admin/health/page.tsx` — FOUND
- `scripts/smoke-production.ts` — FOUND
- `.planning/phases/15-production-hardening/15-SECURITY-REVIEW.md` — FOUND

Files modified (4):

- `src/app/api/admin/health/route.ts` — FOUND
- `src/app/admin/layout.tsx` — FOUND
- `package.json` — FOUND
- `README.md` — FOUND

Commits (4):

- `d128f7b` (test 15-02 RED)
- `90229dd` (feat 15-02 GREEN)
- `e6c8217` (feat 15-02 smoke + runbook)
- `07226e2` (docs 15-02 security review)

All four commit hashes are reachable from `HEAD` in
`git log --oneline d7d87a7..HEAD`.
