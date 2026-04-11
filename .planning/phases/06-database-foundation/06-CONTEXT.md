# Phase 6: Database Foundation - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Card and order data lives in a Neon Postgres database with a Drizzle ORM data access layer. Existing static JSON card inventory is migrated into the database. The storefront continues reading static JSON in this phase — switching to DB reads happens in Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Card Primary Key
- **D-01:** Keep composite string ID as primary key (`${setCode}-${collectorNumber}-${foil}-${condition}`). No migration to auto-increment or UUID — cart, orders, and URLs all reference this ID already.
- **D-02:** Price stored as integer cents (e.g., 1299 = $12.99). Frontend divides by 100 for display. Avoids floating-point rounding.
- **D-03:** colorIdentity stored as Postgres TEXT[] array column. Enables native array operators (@>, &&, =) for future Scryfall-style color queries.

### Schema Extras
- **D-04:** Cards table includes both `created_at` and `updated_at` timestamp columns with auto-defaults.
- **D-05:** Orders table includes a status enum column (`pending` | `confirmed` | `completed`) for lifecycle tracking.
- **D-06:** Cards use hard delete (row removed), not soft delete. CSV import does full replace anyway.
- **D-07:** Add `scryfall_id` column to cards table. Manabox CSV already exports this field (currently ignored). Enables easier re-enrichment.
- **D-08:** Add basic indexes: cards.name (search), cards.set_code (set filter), orders.created_at (order history sorting).

### Neon Driver & Migrations
- **D-09:** Schema changes applied via `drizzle-kit push` (direct apply, no migration files). Solo-dev project — less ceremony.

### Build Pipeline
- **D-10:** Keep `generate-data.ts` in the build pipeline during Phase 6. Storefront still reads static JSON. Removal happens in Phase 7 (Storefront Migration).

### DB Directory Structure
- **D-11:** Database files live in `src/db/` — schema.ts (Drizzle table definitions), client.ts (connection), seed.ts (data migration).

### Initial Seed Strategy
- **D-12:** Seed script reads existing `data/generated/cards.json` and inserts into DB. One-time migration using already-enriched data.
- **D-13:** Seed script is idempotent — uses INSERT ... ON CONFLICT DO UPDATE (upsert). Safe to run multiple times without creating duplicates.

### Claude's Discretion
- Neon connection driver choice (HTTP vs WebSocket vs both) — Claude picks based on Drizzle + Neon docs for Next.js on Vercel
- Order_items snapshot depth (essential fields vs full snapshot with image/oracle) — Claude decides based on Phase 11 order history UI needs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing data model
- `src/lib/types.ts` — Card, OrderItem, OrderData, CheckoutRequest interfaces that the DB schema must match
- `src/lib/csv-parser.ts` — Manabox CSV parsing logic, card ID generation, merge/dedup logic
- `src/lib/load-cards.ts` — Current static JSON loading (will be replaced in Phase 7)
- `src/lib/order.ts` — Order construction logic, OrderData building from CheckoutRequest

### Build pipeline
- `scripts/generate-data.ts` — Build-time data generation (stays in Phase 6, removed in Phase 7)
- `package.json` — Build script: `tsx scripts/generate-data.ts && next build`

### API
- `src/app/api/checkout/route.ts` — Current checkout endpoint that will need DB integration in Phase 11

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Card` interface (src/lib/types.ts): 12 fields that map directly to DB columns + new scryfall_id and timestamps
- `OrderItem` / `OrderData` interfaces: Define order structure for the orders/order_items tables
- `csv-parser.ts`: Merge/dedup logic may inform how upsert seed script handles conflicts
- `ManaboxRow` interface: Shows which CSV fields exist including ignored `Scryfall ID`

### Established Patterns
- Composite card ID: `${setCode}-${collectorNumber}-${foil}-${condition}` — used everywhere, now becomes DB primary key
- Price as `number | null` in dollars — will need cents conversion layer
- Color identity as `string[]` — maps to TEXT[] column

### Integration Points
- `loadCardData()` in src/lib/load-cards.ts reads static JSON — Phase 7 replaces this with a DB query
- Cart store (Zustand) references cards by string ID — no change needed with composite PK decision
- Checkout API builds orders from Card[] lookup — future phases wire this to DB

</code_context>

<specifics>
## Specific Ideas

- User wants Scryfall ID stored for future re-enrichment and potential Scryfall-style query support
- Integer cents for price storage (not decimal dollars) — conversion layer needed between DB and current frontend expectations

</specifics>

<deferred>
## Deferred Ideas

- Scryfall-style query system — user wants to add Scryfall query syntax for card searching (e.g., `id:WU`, `c>=RG`). New capability — belongs in its own phase after search infrastructure exists.

</deferred>

---

*Phase: 06-database-foundation*
*Context gathered: 2026-04-11*
