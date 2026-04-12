---
phase: 08-authentication
plan: 02
subsystem: auth-ui
tags: [admin-ui, login-page, access-denied, admin-layout, google-sign-in, popup-modal]

# Dependency graph
requires:
  - phase: 08-01
    provides: "Auth.js v5 config, proxy.ts, isAdminEmail(), requireAdmin()"
provides:
  - "Login popup modal in storefront header (GoogleSignInButton)"
  - "Dedicated /admin/login page for OAuth redirects and error handling"
  - "Access denied page with null session defense and sign-out"
  - "Admin layout with Viki + Admin badge header and sign-out"
  - "Admin dashboard placeholder with welcome greeting"
affects: [09-admin-panel, 10-inventory-management]

# Tech tracking
tech-stack:
  added: []
  patterns: [csrf-safe-form-post, popup-login-modal, defense-in-depth-auth]

key-files:
  created:
    - src/components/google-sign-in-button.tsx
    - src/app/admin/login/page.tsx
    - src/app/admin/access-denied/page.tsx
    - src/app/admin/layout.tsx
    - src/app/admin/page.tsx
  modified:
    - src/components/header.tsx
    - src/app/page.tsx

key-decisions:
  - "Admin login triggered via popup modal in header, not footer link (user preference)"
  - "CSRF-safe form POST to /api/auth/signin/google (not signIn() server action - Next.js 16 bug)"
  - "Access denied page includes null session defense with redirect to login"
  - "Admin layout uses isAdminEmail() shared helper -- no inline email comparison"
  - "/admin/login page kept for OAuth redirect callbacks and error display"

patterns-established:
  - "Popup modal for admin login entry point from storefront"
  - "Server component auth check with redirect fallback (defense-in-depth)"
  - "signOut() via server action in form for CSRF protection"

requirements-completed: [AUTH-01, AUTH-02]

# Metrics
duration: 12min
completed: 2026-04-12
---

# Phase 08 Plan 02: Admin UI Pages Summary

**Complete admin authentication UI: header login popup, branded login page, access-denied page, admin layout with header, and dashboard placeholder. All pages use isAdminEmail() shared helper for defense-in-depth auth checks.**

## Performance

- **Duration:** 12 min
- **Tasks:** 3 (2 auto + 1 human verification)
- **Files modified:** 7

## Accomplishments
- Google sign-in button as CSRF-safe client component with form POST (avoids Next.js 16 signIn() bug)
- Login popup modal in storefront header for quick admin access
- Dedicated /admin/login page for OAuth callbacks and error display
- Access denied page shows user email, sign-out button, null session defense
- Admin layout with "Viki" + "Admin" badge header and sign-out button
- Admin dashboard placeholder with first-name welcome greeting
- All pages use isAdminEmail() from shared helper -- no duplicate email checks
- Human-verified: OAuth flow, sign-out, route protection all working

## Task Commits

1. **Task 1: Login page, access-denied page, Google sign-in button** - `f894380` (feat)
2. **Task 2: Admin layout, dashboard, storefront footer link** - `3997c72` (feat)
3. **Task 3: Move Admin to header popup + verification** - `88f2bef` (feat)

## Files Created/Modified
- `src/components/google-sign-in-button.tsx` - CSRF-safe form POST with loading state
- `src/app/admin/login/page.tsx` - Branded login, async searchParams, error handling
- `src/app/admin/access-denied/page.tsx` - Email display, sign-out, null session redirect
- `src/app/admin/layout.tsx` - Admin header with Viki badge, sign-out, isAdminEmail() check
- `src/app/admin/page.tsx` - Welcome greeting, defense-in-depth auth
- `src/components/header.tsx` - Added login popup modal with GoogleSignInButton
- `src/app/page.tsx` - Removed footer admin link (moved to header popup)

## Deviations from Plan
- Admin link moved from footer to header popup modal per user preference
- /admin/login page retained for OAuth redirects but primary entry is now the header popup

## Issues Encountered
None.

## Self-Check: PASSED

All 5 created files and 2 modified files verified on disk. All 3 task commits found in git history. tsc passes. 19/19 tests pass.

---
*Phase: 08-authentication*
*Completed: 2026-04-12*
