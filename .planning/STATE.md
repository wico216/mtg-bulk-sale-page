---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Admin Panel & Inventory Management
status: executing
stopped_at: Phase 10.1 context gathered
last_updated: "2026-04-25T19:53:21.031Z"
last_activity: 2026-04-25 -- Phase 10.1 execution started
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 13
  completed_plans: 10
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Friends can easily find and order cards from your bulk collection without friction
**Current focus:** Phase 10.1 — multi-csv-import-and-delete-inventory-button

## Current Position

Phase: 10.1 (multi-csv-import-and-delete-inventory-button) — EXECUTING
Plan: 1 of 6
Status: Executing Phase 10.1
Last activity: 2026-04-25 -- Phase 10.1 execution started

Progress: [██████░░░░] 43% phases (3 of 7 phases shipped: 8, 9, 10)

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
| Phase 10.1 P01 | 2min | 1 tasks | 3 files |
| Phase 10.1 P02 | 3min | 1 tasks | 2 files |

## Accumulated Context

### Roadmap Evolution

- Phase 10.1 inserted after Phase 10: Multi-CSV import and delete-inventory button (URGENT)

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
- [Phase 10.1-01]: parseManaboxCsvFiles reuses existing mergeCards verbatim — cross-file sum semantics inherit from within-file dedup (D-03)
- [Phase 10.1-01]: SkippedRow.filename is optional and only set by the multi-file path — single-file parseManaboxCsvContent untouched for backward compat
- [Phase 10.1-01]: Per-file row numbers (header=row 1 inside each file) — admins reading 'Row 142 of Blue Binder.csv' look at line 142 of THAT file, not a global counter
- [Phase 10.1-01]: PreviewPayload.skippedRows kind=parse variant gains optional filename — type-only contract update, no route behavior change in this plan
- [Phase 10.1]: 10.1-02: DELETE /api/admin/inventory is a dedicated route (not a /commit query variant) — explicit intent in path/logs/audit
- [Phase 10.1]: 10.1-02: response { success, deleted: N } — UI shows 'Deleted all N cards' without a second round trip (D-14)
- [Phase 10.1]: 10.1-02: read getCardsMeta().totalCards BEFORE replaceAllCards([]) — replaceAllCards's empty path returns inserted:0, can't carry the deleted count

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

### Pending Todos

- **Multi-CSV import + Delete inventory button** — feature work the user asked about; deferred pending Phase 10.1 routing decision (insert-phase vs add-phase).

### Blockers/Concerns

- Resend free tier limits need verification at signup (Phase 5)
- Branch hygiene: all 2026-04-25 hotfixes shipped directly to `main` because production was already broken. Future feature work should use feature branches → preview URLs → merge (production URL `wikos-spellbinder.vercel.app` is friends-facing).

## Session Continuity

Last session: 2026-04-25T19:10:12.562Z
Stopped at: Phase 10.1 context gathered
Resume file: .planning/phases/10.1-multi-csv-import-and-delete-inventory-button/10.1-CONTEXT.md
