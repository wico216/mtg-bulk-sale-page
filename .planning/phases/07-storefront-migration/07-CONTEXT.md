# Phase 7: Storefront Migration - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Switch the storefront from reading static JSON (`data/generated/cards.json`) to querying the Neon Postgres database via Drizzle ORM. All existing storefront features (browse, search, filter, sort, cart, checkout) must work identically. Friends should notice zero visible changes. Card data updates in the database are reflected on the next page load without rebuilding.

</domain>

<decisions>
## Implementation Decisions

### Data Freshness
- **D-01:** Always-fresh dynamic rendering — every page load queries the database directly. No ISR caching, no time-based revalidation. Friends always see current stock and prices.
- **D-02:** Checkout API validates stock against the live database (not static JSON). Prevents selling cards that were removed or went out-of-stock since the friend loaded the page.
- **D-03:** CardData meta (lastUpdated, totalCards, totalSkipped, totalMissingPrices) computed from the database on each load using COUNT(*) and MAX(updated_at).

### Data Access Layer
- **D-04:** Create `src/db/queries.ts` as the single queries module. Functions: `getCards()`, `getCardById()`, `getCardsMeta()`. All pages and API routes import from this one file.
- **D-05:** Price conversion (cents → dollars) happens inside `src/db/queries.ts`. The `getCards()` function returns `Card[]` with prices already in dollars. Callers never see cents.
- **D-06:** `src/db/queries.ts` maps DB rows to `Card` objects, handling field name differences (e.g., `set_code` → `setCode`, `color_identity` → `colorIdentity`).

### Type Compatibility
- **D-07:** Extend the `Card` interface with optional DB fields: `scryfallId?: string | null`, `createdAt?: string`, `updatedAt?: string`. Existing frontend code ignores them. Available for future phases.
- **D-08:** The `Card` interface in `src/lib/types.ts` remains the canonical frontend type. `queries.ts` maps DB schema → Card interface.

### Error Handling
- **D-09:** When the database is unreachable, friends see a simple error message: "Store temporarily unavailable, try again soon." No fallback to stale data.
- **D-10:** Checkout fails with a clear message ("Unable to process order right now, please try again") if the DB is down during submission. No email sent, no partial state.
- **D-11:** Error logging via `console.error` only. Vercel captures function logs automatically — no extra logging infrastructure.

### Build Pipeline Cleanup
- **D-12:** Delete `scripts/generate-data.ts` entirely — no longer needed since storefront reads from DB. Remove from the build script in `package.json`.
- **D-13:** Delete the `data/generated/` directory (static JSON output). DB is now the single source of truth.
- **D-14:** Keep `src/lib/csv-parser.ts` and `src/lib/scryfall.ts` — Phase 10 (CSV Import) will reuse them for runtime CSV import.

### loadCardData Replacement
- **D-15:** Delete `src/lib/load-cards.ts` entirely. All 4 call sites (home page, cart page, checkout page, checkout API route) switch to importing from `src/db/queries.ts`.
- **D-16:** Pages become async server components (Next.js supports this natively). The checkout API route already supports async.

### Claude's Discretion
- Exact Drizzle query syntax and any query optimizations
- How to structure the async server component pattern (direct await in component body vs separate data fetch)
- Whether to keep or remove the `CardData` wrapper type (may be simplified to just Card[] + meta)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current data loading (to be replaced)
- `src/lib/load-cards.ts` — Current static JSON loading function, called by all 4 storefront pages/routes. Will be deleted.
- `src/lib/types.ts` — Card, CardData, OrderItem, OrderData, CheckoutRequest interfaces. Card interface to be extended.

### Database layer (from Phase 6)
- `src/db/schema.ts` — Drizzle table definitions for cards, orders, order_items. Source of truth for DB column names.
- `src/db/client.ts` — Drizzle + Neon HTTP client configuration. Import `db` from here.

### Storefront pages (callers to update)
- `src/app/page.tsx` — Home page, loads all cards for the grid
- `src/app/cart/page.tsx` — Cart page, loads cards for price lookup
- `src/app/checkout/page.tsx` — Checkout page, loads cards for order building
- `src/app/api/checkout/route.ts` — Checkout API, validates stock and builds orders

### Build pipeline (to be cleaned up)
- `scripts/generate-data.ts` — Build-time data generation script. To be deleted.
- `package.json` — Build script currently runs `tsx scripts/generate-data.ts && next build`. Needs updating.

### Kept for future phases
- `src/lib/csv-parser.ts` — Manabox CSV parsing logic. Kept for Phase 10.
- `src/lib/scryfall.ts` — Scryfall API client. Kept for Phase 10.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db` client (`src/db/client.ts`): Drizzle instance with Neon HTTP driver, ready to use
- `cards` table schema (`src/db/schema.ts`): Complete column definitions matching Card fields
- Card composite ID pattern: `${setCode}-${collectorNumber}-${foil}-${condition}` — used as DB primary key, cart keys, and URL params

### Established Patterns
- Server components: All storefront pages are already React Server Components (synchronous). Making them async is a minimal change.
- Zustand cart store: References cards by string ID — no change needed since composite PK is preserved.
- Price display: Frontend uses `price: number | null` (dollars). DB stores cents. Conversion in queries.ts bridges this.

### Integration Points
- `src/app/page.tsx` passes `data.cards` to `<CardGrid>` and `data.meta` for display
- `src/app/cart/page.tsx` passes `cards` to `<CartPageClient>` for price lookup
- `src/app/checkout/page.tsx` passes `cards` to `<CheckoutClient>` for order building
- `src/app/api/checkout/route.ts` builds a `cardMap` from loaded cards for stock validation

</code_context>

<specifics>
## Specific Ideas

- Price conversion must be exact: DB cents / 100 → dollars. Use simple division since prices are already stored as clean cent values (e.g., 1299 → 12.99).
- The `data/generated/` directory and `generate-data.ts` script are fully removed — clean break, no fallback.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-storefront-migration*
*Context gathered: 2026-04-11*
