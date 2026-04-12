# Phase 8: Authentication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 08-authentication
**Areas discussed:** Login experience, Unauthorized access, Admin shell & nav, Session behavior, Admin placeholder page, Auth error states, Google consent screen

---

## Login Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Branded login page | Store name/logo + "Sign in with Google" button. Feels intentional and polished. | ✓ |
| Instant Google redirect | Visiting /admin immediately redirects to Google OAuth. No intermediate page. | |
| Minimal card | Centered card with just the Google button and a one-liner. No branding. | |

**User's choice:** Branded login page
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Admin dashboard | Redirect to /admin after login — placeholder for now | ✓ |
| Back to original URL | Return to the URL they tried to access, fallback to /admin | |

**User's choice:** Admin dashboard (redirect to /admin)
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Match storefront | Same Geist font, same color palette — feels like part of the same app | ✓ |
| Distinct admin style | Different look to signal "this is the admin area" | |
| You decide | Claude picks | |

**User's choice:** Match storefront
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, small link | Subtle "Back to store" link below sign-in button | ✓ |
| No link | Login page is standalone | |
| You decide | Claude decides | |

**User's choice:** Yes, small "Back to store" link
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Env var with email | ADMIN_EMAIL=your@gmail.com — simplest for single admin | ✓ |
| Comma-separated env var | ADMIN_EMAILS=you@gmail.com,helper@gmail.com — supports multiple | |
| You decide | Claude picks simplest | |

**User's choice:** Single ADMIN_EMAIL env var
**Notes:** None

---

## Unauthorized Access

| Option | Description | Selected |
|--------|-------------|----------|
| Error page with message | "Access Denied" page with email, sign-out + back-to-store links | ✓ |
| Silent redirect to storefront | Non-admins quietly redirected to store homepage | |
| Redirect to login with error | Back to login page with flash message | |

**User's choice:** Error page with message
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| 401/403 JSON error | Standard REST pattern — { error: 'Unauthorized' } / { error: 'Forbidden' } | ✓ |
| Redirect to login | API routes redirect to login page | |
| You decide | Claude picks standard approach | |

**User's choice:** 401/403 JSON error
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Show login page | Anyone visiting /admin sees the login page. No need to hide for a friend store. | ✓ |
| 404 for non-admins | Pretend /admin doesn't exist unless authenticated | |

**User's choice:** Show login page
**Notes:** None

---

## Admin Shell & Nav

| Option | Description | Selected |
|--------|-------------|----------|
| Basic admin layout now | Simple admin header with store name, "Admin" badge, sign-out button | ✓ |
| Auth gate only | No admin layout — deferred to Phase 9 | |
| Full sidebar nav | Header + sidebar with nav links as placeholders | |

**User's choice:** Basic admin layout now
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Small link in footer | Subtle "Admin" text link in the store footer | ✓ |
| Header icon/link | Lock or gear icon in the store header linking to /admin | |
| No link on storefront | Admin navigates to /admin by typing URL directly | |

**User's choice:** Small "Admin" link in storefront footer
**Notes:** User specifically wanted a link on the storefront for admin access rather than a "View store" link in the admin header. "Just do login button on the main store — view store sounds like it can be used for people."

---

## Session Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| 30 days | Long-lived session — re-login once a month | ✓ |
| 7 days | Weekly re-auth | |
| Browser session only | Session ends when browser closes | |
| You decide | Claude picks sensible default | |

**User's choice:** 30 days
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, persistent | Session stays active after closing/reopening browser | ✓ |
| No, session cookie only | Closing browser logs you out | |

**User's choice:** Yes, persistent cookie
**Notes:** None

---

## Admin Placeholder Page

| Option | Description | Selected |
|--------|-------------|----------|
| Welcome + coming soon | Greeting with admin name, "Inventory management coming soon" | ✓ |
| Quick stats preview | Show total cards and inventory value from DB | |
| Empty shell only | Just the header, no content | |

**User's choice:** Welcome + coming soon
**Notes:** None

---

## Auth Error States

| Option | Description | Selected |
|--------|-------------|----------|
| Error on login page | Redirect back to login with "Sign-in failed. Try again." | ✓ |
| Dedicated error page | Separate /admin/error page with more detail | |
| You decide | Claude picks simplest approach | |

**User's choice:** Error on login page
**Notes:** None

---

## Google Consent Screen

| Option | Description | Selected |
|--------|-------------|----------|
| "Viki MTG Store" | Matches the store branding | ✓ |
| "Viki Admin Panel" | More specific — signals admin access | |
| You decide | Claude picks something sensible | |

**User's choice:** "Viki MTG Store"
**Notes:** None

---

## Claude's Discretion

- Auth.js v5 configuration and Next.js 16 integration approach
- Route protection mechanism (middleware vs layout-level vs per-page)
- JWT signing strategy and secret management
- Admin layout component structure and Tailwind styling

## Deferred Ideas

None — discussion stayed within phase scope
