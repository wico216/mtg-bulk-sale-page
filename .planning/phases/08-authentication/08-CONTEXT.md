# Phase 8: Authentication - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

The admin panel is protected so only the seller can access inventory management. Google OAuth gates all `/admin` pages and `/api/admin` routes. A single Google account (configured via env var) is authorized as admin. The public storefront remains fully accessible without login. This phase delivers the auth infrastructure, a basic admin shell layout, and a placeholder admin page — inventory management UI comes in Phase 9.

</domain>

<decisions>
## Implementation Decisions

### Login Experience
- **D-01:** Branded login page at `/admin/login` — store name/logo, "Sign in with Google" button, and "Only authorized admins can access this" message. Matches storefront visual style (same Geist font, color palette).
- **D-02:** Login page includes a small "Back to store" link below the sign-in button for anyone who stumbles on the URL.
- **D-03:** After successful Google sign-in, admin redirects to `/admin` (the admin dashboard placeholder).

### Admin Allowlist
- **D-04:** Single `ADMIN_EMAIL` environment variable holds the authorized admin email. Only this Google account gets admin access. Change requires redeploy.
- **D-05:** Auth check compares the authenticated Google email against `ADMIN_EMAIL` — simple string equality.

### Unauthorized Access
- **D-06:** Non-admin Google accounts see an "Access Denied" page showing their email address, with "Sign out" and "Back to store" links. Clear message that the area is restricted to the store admin.
- **D-07:** Unauthenticated visitors to `/admin` see the branded login page (no 404 obfuscation — friend store, no need to hide).
- **D-08:** Admin API routes (`/api/admin/*`) return JSON errors: 401 `{ error: "Unauthorized" }` for no session, 403 `{ error: "Forbidden" }` for non-admin accounts.

### Admin Shell & Navigation
- **D-09:** Basic admin layout with a header: store name, "Admin" badge, and sign-out button. Content area renders child routes (placeholder for now, Phase 9+ fills in).
- **D-10:** No sidebar navigation in Phase 8 — just header + content area. Sidebar or nav links added as admin features are built in later phases.
- **D-11:** Small "Admin" text link added to the public storefront footer — gives the admin a way to navigate to `/admin` from the store.

### Admin Placeholder Page
- **D-12:** The `/admin` page shows a welcome message with the admin's name (from Google profile) and "Inventory management coming soon." Clean placeholder until Phase 9.

### Session Behavior
- **D-13:** Admin sessions last 30 days before requiring re-login. Persistent cookie survives browser restarts.
- **D-14:** Session stored as JWT (no database session table needed — single admin user, simplicity wins).

### Auth Error Handling
- **D-15:** OAuth failures (network error, callback error) redirect back to the login page with a simple "Sign-in failed. Try again." message. No dedicated error page.

### Google Consent Screen
- **D-16:** App name on Google OAuth consent screen: "Viki MTG Store".

### Claude's Discretion
- Auth.js v5 configuration details and Next.js 16 integration approach (proxy.ts, middleware, route handlers)
- Route protection mechanism (middleware vs layout-level auth checks vs per-page)
- JWT signing strategy and secret management
- Whether to use Auth.js `authorized` callback vs custom middleware for admin check
- Admin layout component structure and Tailwind styling details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Authentication requirements
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02, AUTH-03 define the three auth requirements for this phase

### Existing app structure
- `src/app/layout.tsx` — Root layout (may need SessionProvider wrapper)
- `src/app/page.tsx` — Storefront home page (footer needs "Admin" link)
- `src/db/schema.ts` — DB schema (no auth tables — JWT sessions, no DB sessions needed)
- `src/db/client.ts` — Drizzle + Neon client (available if auth needs DB access)

### Prior phase decisions
- `.planning/phases/06-database-foundation/06-CONTEXT.md` — DB setup, Drizzle ORM patterns
- `.planning/phases/07-storefront-migration/07-CONTEXT.md` — Data access layer in `src/db/queries.ts`, dynamic rendering

### State notes
- `.planning/STATE.md` — Flags "Auth.js v5 + Next.js 16 proxy.ts convention needs verification during Phase 8"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Root layout (`src/app/layout.tsx`): Geist font setup, basic HTML structure — admin layout can share font variables
- Tailwind CSS 4 with existing color patterns from storefront — admin pages should match
- `src/db/client.ts`: Drizzle client if any auth check needs DB access (though JWT approach avoids this)

### Established Patterns
- Server Components: All pages are React Server Components — admin pages follow the same pattern
- API routes: `src/app/api/checkout/route.ts` shows the existing Route Handler pattern (POST handler with validation)
- No auth patterns exist yet — this phase establishes the auth convention for all subsequent admin phases

### Integration Points
- Root layout may need a SessionProvider or auth wrapper
- Storefront footer needs an "Admin" link (small addition to existing page)
- `/admin` route group needs its own layout with auth check + admin header
- `/api/admin/*` routes need auth middleware or per-route session check
- Next.js 16 may require `proxy.ts` or specific middleware patterns for Auth.js v5

</code_context>

<specifics>
## Specific Ideas

- Admin login page should feel like part of the same app as the storefront — same Geist font, same color palette
- "Access Denied" page should show the actual email address the person signed in with, so they know which account they used
- Storefront footer "Admin" link should be subtle — not prominent for friends, just a convenience for the admin

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-authentication*
*Context gathered: 2026-04-12*
