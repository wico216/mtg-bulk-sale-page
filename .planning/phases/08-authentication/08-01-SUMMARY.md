---
phase: 08-authentication
plan: 01
subsystem: auth
tags: [auth.js, next-auth, google-oauth, jwt, proxy.ts, route-protection]

# Dependency graph
requires:
  - phase: 05-checkout-and-deploy
    provides: "Deployed Next.js app with API route pattern (checkout route.ts)"
provides:
  - "Auth.js v5 configuration with Google provider and JWT sessions (src/auth.ts)"
  - "Route-level protection via proxy.ts for /admin and /api/admin paths"
  - "isAdminEmail() shared helper as single source of truth for admin check"
  - "requireAdmin() API guard returning 401/403 JSON responses"
  - "/api/admin/health endpoint proving AUTH-03 end-to-end"
  - "Auth.js route handler at /api/auth/[...nextauth] (GET/POST)"
affects: [08-02-authentication-ui, 09-admin-panel, 10-inventory-management]

# Tech tracking
tech-stack:
  added: [next-auth@5.0.0-beta.30, server-only]
  patterns: [auth-callback-wrapper-proxy, requireAdmin-guard, isAdminEmail-shared-helper]

key-files:
  created:
    - src/auth.ts
    - src/proxy.ts
    - src/lib/auth/helpers.ts
    - src/lib/auth/admin-check.ts
    - src/app/api/auth/[...nextauth]/route.ts
    - src/app/api/admin/health/route.ts
    - src/lib/auth/__tests__/admin-check.test.ts
    - src/__tests__/proxy.test.ts
  modified:
    - .env.local.example
    - package.json
    - package-lock.json
    - vitest.config.ts

key-decisions:
  - "Used export default auth((req) => {...}) pattern for proxy.ts per Next.js 16 docs"
  - "Env var validation at module load time in auth.ts for fail-fast on misconfig"
  - "isAdminEmail() extracted to shared helper to eliminate duplication across layers"
  - "API routes (/api/admin/*) always pass through proxy -- requireAdmin() is authoritative gate"

patterns-established:
  - "Three-layer auth: proxy.ts (optimistic redirect) -> auth() in server components (authoritative) -> requireAdmin() in API routes (authoritative)"
  - "Shared isAdminEmail() helper used by all auth layers for single source of truth"
  - "requireAdmin() returns AdminSession | Response -- callers check instanceof Response"
  - "vi.hoisted() for mock variables referenced inside vi.mock() factory functions"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 08 Plan 01: Auth Infrastructure Summary

**Auth.js v5 with Google OAuth, JWT sessions, three-layer route protection (proxy.ts + auth() + requireAdmin()), and 19 unit tests including /api/admin pass-through and non-admin login bypass fix**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-12T17:46:41Z
- **Completed:** 2026-04-12T17:51:54Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Auth.js v5 installed and configured with Google provider, JWT sessions (30-day maxAge), env validation at module load
- proxy.ts protects /admin routes with correct redirect logic; API routes explicitly pass through to route handlers
- isAdminEmail() shared helper eliminates admin email check duplication across all three auth layers
- requireAdmin() returns proper 401/403 JSON responses for API route protection
- /api/admin/health endpoint proves AUTH-03 end-to-end (admin API route guard works)
- 19 unit tests cover all proxy redirect scenarios (11) and admin-check/isAdminEmail logic (8)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install next-auth, create Auth.js config, proxy.ts, shared helpers** - `2ecb8f6` (feat)
2. **Task 2: Unit tests for admin-check, isAdminEmail, proxy logic** - `d011a1b` (test)

## Files Created/Modified
- `src/auth.ts` - Auth.js v5 config: Google provider, JWT sessions, env validation, callbacks
- `src/proxy.ts` - Route protection: admin page redirects, API pass-through, matcher config
- `src/lib/auth/helpers.ts` - isAdminEmail() shared helper with server-only guard
- `src/lib/auth/admin-check.ts` - requireAdmin() returning AdminSession or 401/403 Response
- `src/app/api/auth/[...nextauth]/route.ts` - Auth.js route handler (GET + POST)
- `src/app/api/admin/health/route.ts` - Health check proving AUTH-03 end-to-end
- `src/lib/auth/__tests__/admin-check.test.ts` - 8 tests: isAdminEmail (4) + requireAdmin (4)
- `src/__tests__/proxy.test.ts` - 11 tests: redirects, pass-through, API path, login bypass
- `.env.local.example` - Added AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ADMIN_EMAIL, AUTH_URL
- `package.json` - Added next-auth, server-only, vitest, test script
- `vitest.config.ts` - Test configuration for worktree

## Decisions Made
- Used `export default auth((req) => {...})` pattern for proxy.ts, verified against Next.js 16 proxy.md docs which state "either as a default export or named proxy"
- Env validation runs at module load time in auth.ts (throws on missing vars) per plan recommendation; tsc --noEmit still passes since type-checking doesn't execute code
- Extracted isAdminEmail() to src/lib/auth/helpers.ts rather than inlining in proxy.ts and admin-check.ts -- addresses review concern about duplicate admin email logic
- Used vi.hoisted() pattern for mock variables to avoid temporal dead zone errors in vitest mock factories

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added server-only and vitest to worktree package.json**
- **Found during:** Task 1 (dependency setup)
- **Issue:** Worktree package.json was outdated and missing server-only and vitest dependencies present in main repo
- **Fix:** Installed server-only@^0.0.1 and vitest@^4.1.4, added test script to package.json
- **Files modified:** package.json, package-lock.json
- **Verification:** npm test runs successfully, server-only import works in helpers.ts
- **Committed in:** 2ecb8f6 (Task 1 commit)

**2. [Rule 3 - Blocking] Created vitest.config.ts in worktree**
- **Found during:** Task 1 (test infrastructure setup)
- **Issue:** vitest.config.ts only existed in main repo, not in the worktree
- **Fix:** Created vitest.config.ts matching main repo configuration
- **Files modified:** vitest.config.ts
- **Verification:** npm test discovers and runs test files correctly
- **Committed in:** 2ecb8f6 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed vi.mock hoisting issue with vi.hoisted()**
- **Found during:** Task 2 (test writing)
- **Issue:** vi.mock() factories are hoisted above variable declarations, causing ReferenceError for mock variables
- **Fix:** Used vi.hoisted() to define mock functions/variables that are available during mock factory execution
- **Files modified:** src/lib/auth/__tests__/admin-check.test.ts, src/__tests__/proxy.test.ts
- **Verification:** All 19 tests pass
- **Committed in:** d011a1b (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness in the worktree environment. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required

**External services require manual configuration before auth can function:**
- **AUTH_SECRET:** Generate with `openssl rand -base64 32` and add to `.env.local`
- **AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET:** Create OAuth 2.0 Client ID in Google Cloud Console
  - Add redirect URI: `http://localhost:3000/api/auth/callback/google` (dev)
  - Add redirect URI: `https://YOUR_DOMAIN/api/auth/callback/google` (prod)
  - Set OAuth consent screen app name to "Viki MTG Store"
- **ADMIN_EMAIL:** Set to the Google email that should have admin access

## Next Phase Readiness
- Auth infrastructure complete, ready for Plan 02 (admin UI pages: login, access-denied, admin layout, dashboard placeholder)
- All three auth layers operational: proxy.ts for optimistic redirects, auth() for server component checks, requireAdmin() for API route guards
- Sign-in form must use form POST to /api/auth/signin/google (not signIn() server action) due to known Next.js 16 bug

## Self-Check: PASSED

All 9 created files verified on disk. Both task commits (2ecb8f6, d011a1b) found in git history. SUMMARY.md exists.

---
*Phase: 08-authentication*
*Completed: 2026-04-12*
