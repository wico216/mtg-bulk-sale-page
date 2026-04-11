# Project Research Summary

**Project:** Viki MTG Bulk Store v1.1 -- Admin Panel & Inventory Management
**Domain:** E-commerce admin panel / inventory CRUD for existing static Next.js storefront
**Researched:** 2026-04-11
**Confidence:** HIGH

## Executive Summary

This milestone transforms a working static-JSON MTG card store into a database-backed application with a single-admin panel. The v1.0 storefront (Next.js 16, React 19, Tailwind 4, Zustand, Resend) is already deployed and functional. The core change is replacing the build-time CSV-to-JSON pipeline with a live Neon Postgres database managed through an authenticated admin panel. This is a well-understood architectural migration -- static to dynamic -- with established patterns across every technology involved. The stack additions are minimal (4 runtime deps, 1 dev dep): Neon serverless driver, Drizzle ORM, Auth.js v5 for GitHub OAuth, and Zod for validation.

The recommended approach treats the database as the foundational change that everything else depends on. The migration has a clean seam: all card data currently flows through a single `loadCardData()` function, so swapping its implementation from filesystem read to database query gives the storefront live data without changing any downstream components. Auth.js v5 with a single GitHub provider protects the admin panel in approximately 30 lines of config. The admin panel itself is straightforward CRUD: inventory table, inline editing, CSV import (full replace), CSV export, order history, and stats. No admin UI framework needed -- Tailwind handles the 5-page admin.

The top risks are all preventable with upfront design. The most critical is the stock decrement race condition at checkout, which must use an atomic SQL UPDATE (not read-then-write) from day one. The second is the CSV full-replace import destroying in-flight carts -- solved by stable card IDs and transaction-wrapped imports. The third is auth bypass via direct API/action calls -- solved by defense-in-depth `requireAdmin()` checks in every server-side mutation, never relying on proxy.ts alone. All three pitfalls have concrete SQL/code patterns documented in the research and must be baked into the implementation from the start, not retrofitted.

## Key Findings

### Recommended Stack

The existing stack (Next.js 16.2, React 19, Tailwind 4, Zustand, PapaParse, Resend) remains unchanged. Four runtime dependencies and one dev dependency are added. See [STACK.md](./STACK.md) for full rationale and version compatibility.

**Core additions:**
- **Neon Postgres + @neondatabase/serverless**: Managed database -- replaces deprecated @vercel/postgres, first-party Vercel integration, free tier sufficient (0.5 GB, 100 CU-hours/month)
- **Drizzle ORM + drizzle-kit**: Type-safe ORM -- 33KB (vs Prisma's 8MB engine), TypeScript schema definitions, native Neon driver support, migration CLI
- **Auth.js v5 (next-auth@beta)**: GitHub OAuth -- single provider, JWT sessions, ~30 lines of config, restricts to one admin username
- **Zod**: Input validation -- server action inputs, CSV row data, form submissions; works with Auth.js v5 for typed sessions

**Critical version constraints:** drizzle-orm@0.45.2 must be paired with drizzle-kit@0.31.10. Auth.js v5 requires `next-auth@beta` (the `latest` npm tag still points to v4). Next.js 16 uses `proxy.ts` not `middleware.ts`.

### Expected Features

Feature research drew from TCGPlayer, Deckbox, EchoMTG, and Manabox patterns. See [FEATURES.md](./FEATURES.md) for competitor analysis, UX patterns, and full prioritization matrix.

**Must have (table stakes -- P1):**
- Auth-protected admin routes (GitHub OAuth, single user)
- Card inventory table (sortable, searchable)
- Inline edit card fields (price, condition, quantity)
- Delete individual cards
- CSV import from Manabox (full replace with Scryfall enrichment)
- CSV export (Manabox-compatible format)
- Auto-decrement stock on checkout (atomic DB transaction)
- Order history table (ref, buyer, date, total, items)
- Inventory stats dashboard (total unique, total quantity, total value)

**Should have (differentiators -- P2):**
- Bulk select and delete (checkboxes + action bar)
- Import preview and validation (show changes before committing)
- Order detail view (click to expand line items)
- Admin table search/filter
- Inventory breakdown by set/color/rarity
- Low stock alerts (quantity 1 highlighting)

**Defer (v1.2+):**
- Price change indicators on import
- Export orders as CSV
- Quantity +/- adjustment buttons
- Incremental/merge CSV import (anti-feature -- too complex, TCGPlayer also avoids this)
- Real-time price sync from Scryfall (anti-feature -- rate limits, seller sets own prices)
- Multi-user admin / RBAC (anti-feature -- explicit single-admin constraint)

### Architecture Approach

The architecture adds a database layer and admin route group to the existing app. The migration has a clean boundary at `loadCardData()` which is the sole data access point for the storefront. A new Data Access Layer (`src/lib/db/`) separates reads (used by both storefront and admin) from writes (admin-only). Admin pages live under `/admin/*` with their own layout and sidebar. Admin mutations use API routes (`/api/admin/*`) rather than server actions for clearer auth boundaries. See [ARCHITECTURE.md](./ARCHITECTURE.md) for full component map, data flows, and schema design.

**Major components:**
1. **Data Access Layer** (`src/lib/db/`) -- schema.ts, queries.ts (reads), mutations.ts (writes); single point of DB interaction for all consumers
2. **Admin Panel** (`src/app/admin/`) -- dashboard, inventory, orders, import pages with dedicated layout and sidebar
3. **Auth System** (`src/lib/auth.ts` + `src/proxy.ts`) -- Auth.js v5 config, GitHub provider, defense-in-depth checks at proxy, layout, and route levels
4. **Modified Checkout** (`src/app/api/checkout/route.ts`) -- transactional stock decrement + order insertion; emails remain unchanged
5. **Database Schema** -- 3 tables: `cards` (composite PK matching existing ID scheme), `orders`, `order_items` (denormalized to survive card re-imports)

**Key architectural decisions:**
- API routes over server actions for admin CRUD (explicit auth boundaries)
- Denormalized order_items (no FK to cards -- imports do full replace)
- HTTP driver for reads, WebSocket driver for transactions
- `revalidatePath` after admin mutations to keep storefront fresh without `force-dynamic`

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for full analysis, code patterns, and phase-to-pitfall mapping.

1. **Race condition on stock decrement** -- Use atomic `UPDATE cards SET quantity = quantity - N WHERE id = X AND quantity >= N` in a single SQL statement. Never do a SELECT-then-UPDATE. Wrap the entire multi-item checkout in one transaction.
2. **CSV full-replace destroys in-flight state** -- Wrap import in a transaction (rollback on failure). Preserve stable card ID scheme across imports. Add confirmation step showing what will change.
3. **Proxy-only auth bypass** -- Every admin API route and server action must independently call `auth()`. Create a `requireAdmin()` helper. Proxy.ts is for UX redirect only, never the sole security check. CVE-2025-29927 proved middleware is not a security boundary.
4. **Stale cart after inventory changes** -- Validate cart against database on cart page load (not just at checkout). Show per-item availability status. Return specific error messages per item at checkout.
5. **DB client connection leak in dev** -- Cache the Drizzle/Neon client on `globalThis` to survive HMR. Without this, every file save creates a new connection, exhausting the pool within minutes.

## Implications for Roadmap

Based on dependency analysis across all research files, the implementation should follow this phase structure. The build order is driven by hard dependencies (everything needs the database; auth must precede admin pages) and the principle of validating the foundation before building on top.

### Phase 1: Database Foundation

**Rationale:** Every other feature depends on the database existing. Schema design determines the shape of all downstream queries, mutations, and import logic. The DB client singleton pattern must be correct from the start to avoid connection leaks.
**Delivers:** Neon Postgres provisioned, Drizzle ORM configured, schema migrated (cards, orders, order_items tables), Data Access Layer with queries.ts and mutations.ts, seed data for testing.
**Addresses:** Database schema & migration (P1)
**Avoids:** Pitfall 5 (connection leak -- globalThis singleton), Pitfall 1 foundation (atomic decrement pattern designed into mutations.ts)

### Phase 2: Storefront Migration

**Rationale:** The storefront must keep working during the transition. Swapping `loadCardData()` for `getAllCards()` validates the schema against the existing UI with zero component changes. This is the lowest-risk way to prove the database works.
**Delivers:** Storefront reads from DB instead of static JSON. Build script simplified (no more `generate` step). Caching strategy established (revalidate on mutation, not force-dynamic).
**Addresses:** Storefront DB migration (P1)
**Avoids:** Pitfall 6 (build vs runtime caching confusion -- set up revalidation patterns here)

### Phase 3: Authentication

**Rationale:** Must be in place before any admin route is built. Establishes the `requireAdmin()` pattern that every subsequent admin feature inherits. Small, focused scope -- one provider, one user, JWT sessions.
**Delivers:** Auth.js v5 configured with GitHub provider, proxy.ts for /admin/* redirect, login page, `requireAdmin()` helper, defense-in-depth pattern documented.
**Addresses:** Auth-protected admin routes (P1)
**Avoids:** Pitfall 3 (proxy-only auth -- defense-in-depth established as the pattern from the start)

### Phase 4: Admin Panel Shell & Inventory CRUD

**Rationale:** The admin layout, navigation, and core inventory management are the primary deliverable of this milestone. Grouping the shell with inventory CRUD means the admin panel is immediately useful once this phase ships.
**Delivers:** Admin layout with sidebar, dashboard with stats, inventory table with inline editing, individual card delete, CSV export.
**Addresses:** Card inventory table (P1), inline edit (P1), delete (P1), CSV export (P1), inventory stats (P1)
**Avoids:** N/A -- standard CRUD patterns, well-documented

### Phase 5: CSV Import

**Rationale:** Separated from Phase 4 because CSV import is the highest-complexity feature (parsing, Scryfall enrichment with rate limits, full-replace transaction, UI feedback). It reuses existing parse/enrichment code but wraps it in new transaction and progress-reporting logic.
**Delivers:** Manabox CSV upload, parse and validate, Scryfall enrichment, transactional full-replace import, confirmation step, progress feedback.
**Addresses:** CSV import (P1)
**Avoids:** Pitfall 2 (full-replace destroys state -- transaction wrapping, stable IDs, confirmation dialog)

### Phase 6: Checkout Upgrade & Order History

**Rationale:** Checkout modification depends on the database being populated (via import or manual entry). Order history depends on orders being stored. These two are tightly coupled -- the checkout writes orders, the admin reads them.
**Delivers:** Transactional checkout (atomic stock decrement + order insert + email), order history page in admin, cart-page validation against live DB.
**Addresses:** Auto-decrement on checkout (P1), order history (P1)
**Avoids:** Pitfall 1 (race condition -- atomic UPDATE pattern), Pitfall 4 (stale cart -- validate on cart load)

### Phase 7: Polish & Differentiators

**Rationale:** Once all P1 features work, add P2 enhancements that improve the admin experience. These are independent of each other and can be prioritized based on time available.
**Delivers:** Bulk select/delete, import preview, order detail view, admin search/filter, inventory breakdowns, low stock alerts.
**Addresses:** All P2 features from FEATURES.md
**Avoids:** N/A -- incremental improvements on working foundation

### Phase Ordering Rationale

- **Database first** because it is the dependency root. No feature works without it.
- **Storefront migration before admin** because it validates the schema against the existing, proven UI. If the schema is wrong, you find out immediately.
- **Auth before admin CRUD** because building unprotected admin routes and adding auth later invites the proxy-only auth pitfall.
- **Inventory CRUD before CSV import** because the admin can manually add/edit cards for testing while import is being built. Import is complex and should not block the admin panel from being usable.
- **Checkout upgrade after import** because the checkout needs inventory in the database to test against.
- **Polish last** because P2 features add value but the system is fully functional without them.

### Research Flags

Phases likely needing `/gsd-research-phase` during planning:
- **Phase 1 (Database Foundation):** Drizzle ORM + Neon serverless driver setup patterns, especially HTTP vs WebSocket driver usage. Version alignment between drizzle-orm and drizzle-kit may have shifted since research date.
- **Phase 3 (Authentication):** Auth.js v5 with Next.js 16 has known quirks (proxy.ts export convention, route handler path). The beta tag means API may shift. Verify against current Auth.js docs during implementation.
- **Phase 5 (CSV Import):** Scryfall enrichment at runtime (vs build-time) may need different caching and rate-limiting strategies. The existing enrichment pipeline was designed for build-time -- adapting it for a server action needs validation.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Storefront Migration):** Straightforward function swap with same return type. Well-documented Next.js caching patterns.
- **Phase 4 (Admin Panel Shell & CRUD):** Standard data table + form patterns. Tailwind styling. No novel integration.
- **Phase 6 (Checkout Upgrade):** The atomic UPDATE and transaction patterns are well-documented in PostgreSQL and Drizzle docs.
- **Phase 7 (Polish):** All P2 features are standard UI patterns (checkboxes, filters, stat cards).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Core choices (Neon, Drizzle, Auth.js v5) verified via official docs and npm. Auth.js v5 beta tag introduces minor uncertainty. Drizzle versions move fast -- verify compatibility at install time. |
| Features | HIGH | Feature set driven by PROJECT.md requirements and validated against TCGPlayer, Deckbox, EchoMTG, and Manabox. Clear P1/P2/P3 prioritization with competitor evidence. |
| Architecture | HIGH | Clean migration path verified against existing codebase (single `loadCardData()` entry point). Schema design follows established patterns. Data flows documented with concrete code patterns. |
| Pitfalls | HIGH | Critical pitfalls verified against CVEs, PostgreSQL docs, and Next.js 16 official guides. Concrete prevention patterns with code examples. Phase mapping ensures pitfalls are addressed at the right time. |

**Overall confidence:** HIGH

### Gaps to Address

- **Auth.js v5 + Next.js 16 proxy.ts convention:** The exact export signature for Auth.js middleware wrapper in Next.js 16's proxy.ts needs verification during Phase 3. The research references a community guide, not official Auth.js docs for this specific integration.
- **Neon WebSocket driver for transactions:** Research confirms WebSocket driver is needed for multi-statement transactions, but the exact Drizzle ORM API for switching between HTTP (reads) and WebSocket (transactions) should be validated against current drizzle-orm docs during Phase 1.
- **Scryfall enrichment at runtime vs build-time:** The existing enrichment pipeline uses filesystem caching and sequential processing. Running this inside a server action (with request timeouts) for large CSV imports (1000+ cards) may need a different approach (streaming response, background processing). Validate during Phase 5 planning.
- **Order reference uniqueness:** Current `generateOrderRef()` uses timestamp-based refs that can collide within the same minute. Schema should use a database sequence or add random suffix. Address during Phase 1 schema design.

## Sources

### Primary (HIGH confidence)
- Next.js 16 official docs (proxy.ts, route handlers, authentication, data-security) -- read directly from `node_modules/next/dist/docs/`
- Neon Postgres transition guide -- confirmed @vercel/postgres deprecated
- Drizzle ORM + Neon tutorial -- official Drizzle docs
- Auth.js v5 reference docs -- official authjs.dev
- CVE-2025-29927 analysis -- middleware bypass vulnerability, confirmed patched in v16 but architectural lesson stands
- Existing codebase analysis -- all source files read directly

### Secondary (MEDIUM confidence)
- Auth.js v5 + Next.js 16 community guide (DEV.to, 2026) -- configuration patterns
- npm version checks for drizzle-orm, drizzle-kit, @neondatabase/serverless, next-auth -- versions verified via WebSearch
- Neon free tier limits -- verified via Neon pricing docs
- TCGPlayer, Deckbox, EchoMTG feature analysis -- competitor patterns for admin/inventory features
- Smashing Magazine, PatternFly -- UX patterns for data tables and CSV import

### Tertiary (LOW confidence)
- None -- all findings backed by at least two sources

---
*Research completed: 2026-04-11*
*Ready for roadmap: yes*
