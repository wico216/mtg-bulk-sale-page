---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Admin Panel & Inventory Management
status: executing
stopped_at: Phase 11 Plan 01 complete; transactional checkout/order persistence verified with concurrent DB proof
last_updated: "2026-04-26T23:05:00.000Z"
last_activity: 2026-04-26
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 11
  completed_plans: 10
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Friends can easily find and order cards from your bulk collection without friction
**Current focus:** Phase 11 Plan 02 — admin order history list/detail APIs and UI

## Current Position

Phase: 11 (checkout-upgrade-order-history) — IN PROGRESS
Plan: 1 of 2 — 11-01 DONE, 11-02 READY
Status: Transactional checkout persistence is implemented and verified; next is admin order history list/detail
Last activity: 2026-04-26

Progress: [█████░░░░░] 50% phases (4 of 8 v1.1 phases shipped, 1 phase in progress)

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | 8min | 2.7min |
| 02 | 3 | 15min | 5min |
| 03 | 3 | 24min | 8min |
| 04 | 2 | 5min | 2.5min |
| 08 | 2 | - | - |

**Recent Trend:**

- Last 5 plans: 03-01 (2min), 03-02 (1min), 03-03 (21min), 04-01 (3min), 04-02 (2min)
- Trend: stable

*Updated after each plan completion*
| Phase 05 P01 | 5min | 2 tasks | 10 files |
| Phase 05 P02 | 3min | 2 tasks | 5 files |
| Phase 10 P01 | 4min | 3 tasks | 7 files |
| Phase 10 P02 | 3min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Stack is Next.js 16 (SSG) + Tailwind + Zustand + PapaParse + Scryfall API + Resend
- [Roadmap]: Static site with build-time Scryfall enrichment (not runtime) to respect rate limits
- [Roadmap]: Zero database -- card data generated at build time from CSV
- [01-01]: Composite dedup key: setCode-collectorNumber-foil-condition for distinct card listings
- [01-01]: String-coerce collectorNumber from PapaParse dynamicTyping to avoid numeric type mismatch
- [01-02]: No name+set fallback needed: SLD high collector numbers resolve via standard Scryfall endpoint
- [01-02]: Price fallback chain: usd -> usd_foil -> usd_etched -> null covers all printings
- [01-03]: Chain generate before next build so cards.json is always fresh on deploy
- [02-01]: Oracle text for DFC joined with ' // ' separator matching Scryfall convention
- [02-03]: Scroll lock in card-grid.tsx via useEffect, keeping card-modal.tsx presentational
- [02-03]: Mana symbols rendered as Scryfall SVG CDN icons parsed from {X} syntax
- [03-01]: Zustand 5 curried create pattern for TypeScript; Set toggles use new Set() for reactivity
- [03-01]: Color filter OR logic with colorless (C) as special case checking empty colorIdentity
- [03-01]: Null prices sort to end in both price-desc and price-asc
- [03-02]: Rarity dropdown uses MTG conventional order (mythic/rare/uncommon/common) not alphabetical
- [03-02]: MultiSelect backdrop div pattern for outside-click close prevents two-open-at-once pitfall
- [03-02]: Native select for SortDropdown with only 3 fixed options
- [03-03]: Set picker as its own bottom sheet (z-50) with search and clear, not a dropdown in the main sheet
- [03-03]: Rarity/sort use inline toggle pills on mobile (small option sets don't need dropdowns)
- [03-03]: Selected sets sort to top of set picker list for quick filter management
- [03-03]: Zustand selectors must not call getFilteredCards() (new array = SSR infinite loop); use useMemo with individual state subscriptions
- [04-01]: Cart store uses Map<string, number> with custom replacer/reviver for localStorage JSON serialization
- [04-01]: createJSONStorage wraps localStorage for SSG safety (no build failures without manual checks)
- [04-01]: Tile cart controls use span[role=button] with stopPropagation to avoid nested <button> DOM violations
- [04-01]: Plus button disables at stock cap (no message on tile; message is for cart page input per user decision)
- [04-02]: Shared loadCardData utility in src/lib/load-cards.ts used by both / and /cart server components
- [04-02]: Native window.confirm for clear-cart (simple, accessible, no custom dialog state per research)
- [04-02]: Hydration guard via persist.hasHydrated + onFinishHydration prevents empty-cart flash
- [Phase 05-01]: Sequential email sends: seller first (critical), buyer second (best-effort) per D-17
- [Phase 05-01]: OrderData cleanly separated from delivery mechanism per D-14 for future thermal printer
- [Phase 05-01]: Resend SDK v6 with onboarding@resend.dev sender for free-tier compatibility
- [Phase 05-01]: Stock validation against build-time card data via loadCardData (zero-DB architecture)
- [Phase 05-01]: HTML entity escaping for all user input in email templates to prevent XSS
- [Phase 05]: Form renders first on mobile (D-05 action-first) with sticky submit bar (D-06) matching cart-summary-bar pattern
- [Phase 05]: sessionStorage stash before clearCart prevents data loss; URL params carry essentials for refresh resilience
- [Phase 05]: Confirmation page Suspense boundary required by Next.js 16 for useSearchParams
- [Phase 10-01]: db.batch([delete, insert]) over db.transaction() -- neon-http throws on interactive transactions; batch is atomic via HTTP transaction endpoint
- [Phase 10-01]: parseManaboxCsvContent NEW alongside existing parseAllCsvFiles; original silent-skip path preserved for Phase 6 seed backward compat
- [Phase 10-01]: cardToRow imported from @/db/seed rather than extracted -- avoids refactor; seed.test.ts coverage remains authoritative
- [Phase 10-01]: enrichCards onProgress fires on both success and skip paths (once per card, strict ascending) for accurate UI progress bar
- [Phase 10-01]: CSV row numbers 1-indexed with header=row 1 (first data row=row 2) matching spreadsheet app convention
- [Phase 10-02]: Client holds enriched Card[] between /preview and /commit -- serverless memory is not shared across invocations; token-based handoff would require a persistent store we don't need
- [Phase 10-02]: NDJSON preview final message carries FULL cards[] (not just 20-card sample) so /commit receives the exact payload the admin approved
- [Phase 10-02]: maxDuration=300 on preview only (Scryfall rate limit headroom); commit uses maxDuration=30 (DB-only path)
- [Phase 10-02]: vi.hoisted() to pre-initialize mock fns used by vi.mock factories -- Vitest 4 hoists factories above top-level const declarations
- [Phase 10-02]: Mock @/db/queries WITHOUT importActual -- @/db/client calls drizzle(DATABASE_URL) at module load and throws without env var
- [Phase 10-03]: Confirm button label IS the safeguard (D-12) — admin reads the destructive action verbatim before clicking
- [Phase 10-03]: Client buffers the FULL enriched cards[] from preview's NDJSON result and POSTs it back to /commit unmodified
- [Phase 10-03]: sessionStorage 'admin-toast' is the cross-route handoff for post-import success toast (router.push doesn't preserve client state)
- [Phase 10-03]: D-13 cart reconciliation is silent (no banner) — friend-store UX prefers quiet correctness over scolding
- [Phase 10.1]: Multi-CSV import is still a full-replace operation — multiple files are merged together before preview, not merged incrementally into existing inventory
- [Phase 10.1]: Duplicate card IDs across uploaded CSV files sum quantities via the existing composite ID dedupe rule
- [Phase 10.1]: Parse skipped rows carry optional fileName so the admin can locate bad rows in multi-file uploads without changing single-file behavior
- [Phase 10.1]: Delete inventory uses a dedicated deleteAllCards helper and DELETE /api/admin/cards so the UI can report deleted count; it does not overload replaceAllCards([])
- [Phase 10.1 Auth]: Username/password admin login is local-only through Auth.js Credentials because Google OAuth can reject local automation contexts; production disables the provider via `NODE_ENV=production`, `ADMIN_EMAIL` remains the authorization identity, and `ADMIN_USERNAME`/`ADMIN_PASSWORD` are env-backed secrets.

### Post-Phase 10 Hotfixes (2026-04-25)

Real-user import on the deployed Vercel URL surfaced production-only issues. All shipped to main same day:

- **`7b3f517` cache(setCache):** Vercel's serverless FS is read-only outside `/tmp`. `setCache` wrote to a project-relative path, throwing EROFS. The catch in scryfall.ts treated that as a Scryfall miss for every card → admin import showed "No valid cards parsed." Fix: swallow setCache failures (caching is an optimization, not correctness).
- **`cdba6fa` scryfall(retry):** `fetchCard` returned null on any non-OK response, conflating 429 / 5xx / network errors with genuine 404 misses. Roughly 4% of a 600-card import was mislabeled as "not found on Scryfall." Fix: 404 still returns null; 429/5xx/network errors retry up to 3 times with exponential backoff (or `Retry-After` when provided). Base rate bumped 100ms → 120ms.
- **`3fdc83d` enrichment(foil):** `getPrice` ignored the listing's foil flag. Foil rows displayed the cheaper non-foil USD price for any card with both finishes in Scryfall's payload. Fix: foil rows pull `usd_foil → usd_etched → usd`; non-foil rows keep the existing chain.

### Post-Phase 10 Storefront Polish (2026-04-25)

Same-day UX fixes shipped to main while testing the live import:

- **`81ecc14`** (pre-hotfix-wave) — storefront redesigned as "Wiko's Spellbook" (predates this batch).
- **`0851844` admin/View store:** added "View store" link in admin header so the seller can browse the storefront without signing out.
- **`1443789` filters/subset:** color filter switched from OR (`some()`) to subset semantics (`every()`). Selecting W+U now yields mono-W, mono-U, and W+U cards — matches Scryfall `c<=` and every other MTG search tool. Colorless toggle unchanged.
- **`7df5c8a` + `4469584` catalog/tile-size:** `gridTemplateColumns` minmax bumped 150px → 220px → 250px. Roughly 4–5 tiles per row on desktop instead of 8+.
- **`70d30da` mobile/header+drawer:** iPhone Pro Max-class screens were clipping the header title (right-side controls + 32px padding pushed "Spellbook" past `overflow:hidden`) and treating the 248px sticky filter rail as "filter open by default" (it covered ~58% of the viewport). Below 767px the rail is now a right-side drawer triggered by a "Filter" button; below 640px the header tightens padding, shrinks mascot+title, and hides the tagline + Satchel label.

### Phase 10.1 Local Completion (2026-04-26)

User chose the 10.1 insertion before Phase 11. Implemented locally on branch `phase-10.1-import-delete-inventory`:

- Multi-CSV import: `/admin/import` accepts multiple `.csv` files; preview route parses repeated multipart `file` fields; parser merges duplicate composite IDs across files and preserves per-file skipped-row context.
- Delete inventory: `/admin` action bar has a destructive `Delete inventory` button; confirmation is inline; DELETE `/api/admin/cards` is auth-gated and returns deleted row count.
- Browser verification: authenticated admin session reached `/admin`; `/admin/import` accepted two CSV files; preview showed 3 unique imported cards after duplicate merge, 1 skipped row with filename, per-file parse counts, and correct destructive confirm label. Returned to `/admin`; empty-inventory state showed `Delete inventory` disabled. No console or failed network logs during final browser checks.
- Verification: focused tests 41/41 pass; auth/proxy focused tests 24/24 pass; `npx tsc --noEmit` passes; full `npm test` 135/135 passes; touched-file eslint has no errors; `npm run build` passes after local auth/database env keys were collected securely.
- Project-wide `npm run lint` still fails on pre-existing issues outside this change (React set-state-in-effect, JSX in try/catch, test `any` types). Touched files only have existing admin table warnings.
- PR status: Phase 10.1 is pushed as PR #1; Vercel preview checks are green; preview verification caught and fixed a production-login regression so Google sign-in remains visible when local password login is disabled.

### Phase 11 Plan 01 Completion (2026-04-26)

Implemented transactional checkout persistence on branch `phase-11-checkout-order-history`:

- `placeCheckoutOrder()` now performs one atomic database write that locks requested cards, rejects missing/short stock, decrements stock, inserts the order, and inserts denormalized item snapshots.
- `POST /api/checkout` now returns HTTP 201 on persisted order success, HTTP 409 with `code: "stock_conflict"` for stale carts, and HTTP 503 when the DB write fails before notifications.
- Notification emails are post-commit side effects; seller/buyer email failure no longer erases a persisted order.
- Checkout UI preserves cart/form data on errors and formats stock conflicts with requested/available quantities.
- Verification: `git diff --check`, `npm test` (149/149), `npm run build`, and a disposable remote Neon concurrent checkout proof all passed. The proof created one sentinel card with quantity 1, ran two concurrent checkout writes, observed one success and one `stock_conflict`, confirmed final quantity 0, and cleaned up sentinel card/order rows.

### Pending Todos

- Continue Phase 11 Plan 02: admin order history list/detail APIs and UI.
- Commit Phase 11 Plan 01 if final review is acceptable.

### Blockers/Concerns

- Resend free tier limits need verification at signup (Phase 5)
- Branch hygiene: all 2026-04-25 hotfixes shipped directly to `main` because production was already broken. Future feature work should use feature branches → preview URLs → merge (production URL `wikos-spellbinder.vercel.app` is friends-facing).

## Session Continuity

Last session: 2026-04-26T23:05:00.000Z
Stopped at: Phase 11 Plan 01 complete and verified; next action is commit/review then Phase 11 Plan 02
Resume file: .planning/phases/11-checkout-upgrade-order-history/11-01-SUMMARY.md
