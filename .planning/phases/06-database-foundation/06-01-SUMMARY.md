---
phase: 06-database-foundation
plan: 01
subsystem: database
tags: [drizzle-orm, neon, postgres, schema, pgTable, pgEnum]

# Dependency graph
requires:
  - phase: 05-checkout-and-deploy
    provides: Card/OrderItem/OrderData interfaces in src/lib/types.ts
provides:
  - Drizzle schema with cards, orders, order_items tables (src/db/schema.ts)
  - Typed Neon HTTP database client (src/db/client.ts)
  - Drizzle Kit CLI configuration (drizzle.config.ts)
  - DATABASE_URL env var placeholder (.env.local.example)
  - db:push, db:studio, db:seed convenience scripts
affects: [07-api-layer, 08-admin-auth, 09-admin-crud, 10-csv-import]

# Tech tracking
tech-stack:
  added: [drizzle-orm@0.45.2, "@neondatabase/serverless@1.0.2", dotenv@17.4.1, drizzle-kit@0.31.10]
  patterns: [neon-http driver for serverless, integer cents for money, TEXT[] for arrays, composite string PKs, denormalized order items]

key-files:
  created: [src/db/schema.ts, src/db/client.ts, drizzle.config.ts]
  modified: [package.json, package-lock.json, .env.local.example]

key-decisions:
  - "Neon HTTP driver (not WebSocket) for stateless serverless compatibility"
  - "Integer cents for all money columns (price, totalPrice, lineTotal)"
  - "TEXT[] for colorIdentity instead of join table (simple, sufficient for small arrays)"
  - "No FK from order_items to cards (denormalized snapshots survive re-imports)"
  - "dotenv config({ path: '.env.local' }) in drizzle.config.ts (drizzle-kit reads .env by default, not .env.local)"

patterns-established:
  - "Money as integer cents: all price columns use integer type representing cents"
  - "Composite string PK: card IDs are ${setCode}-${collectorNumber}-${foil}-${condition}"
  - "Denormalized order items: order_items snapshot card data at order time, no FK to cards"
  - "Drizzle schema exports: all tables and enums exported from src/db/schema.ts"
  - "DB client pattern: drizzle(process.env.DATABASE_URL!, { schema }) from src/db/client.ts"

requirements-completed: [DB-01]

# Metrics
duration: 3min
completed: 2026-04-11
---

# Phase 06 Plan 01: Database Schema Summary

**Drizzle ORM schema with cards (16 cols), orders (status enum), and order_items (denormalized snapshots) tables, Neon HTTP client, and drizzle-kit config**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-11T16:17:53Z
- **Completed:** 2026-04-11T16:21:01Z
- **Tasks:** 2 of 2
- **Files modified:** 6

## Accomplishments
- Drizzle schema defines cards table with 16 columns including composite string PK, integer cents pricing, TEXT[] color identity, scryfall_id placeholder, and created_at/updated_at timestamps
- Orders table with pgEnum status (pending/confirmed/completed) and created_at index
- Order_items table with denormalized card snapshots, imageUrl for order history display, FK to orders with cascade delete, and index on order_id
- Four indexes for query performance: cards.name, cards.set_code, orders.created_at, order_items.order_id
- Neon HTTP database client with typed schema exports
- Drizzle Kit config with explicit .env.local dotenv loading (avoids pitfall of drizzle-kit defaulting to .env)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Drizzle dependencies and create schema, client, and config files** - `d32b64f` (feat)
2. **Task 2: Provision Neon database and push schema** - completed (user provisioned Neon, pushed schema)

## Files Created/Modified
- `src/db/schema.ts` - Drizzle table definitions for cards (16 cols), orders (with status enum), order_items (denormalized with imageUrl)
- `src/db/client.ts` - Neon HTTP database client export with typed schema
- `drizzle.config.ts` - Drizzle Kit CLI configuration with .env.local dotenv loading
- `package.json` - Added drizzle-orm, @neondatabase/serverless, dotenv deps; drizzle-kit devDep; db:push/studio/seed scripts
- `package-lock.json` - Lockfile updated with new dependencies
- `.env.local.example` - Added DATABASE_URL placeholder with Neon connection string format

## Decisions Made
- Used Neon HTTP driver (not WebSocket) for stateless serverless compatibility per RESEARCH.md
- All money columns stored as integer cents (price, totalPrice, lineTotal) per D-02
- TEXT[] for colorIdentity -- simple Postgres array, sufficient for small color identity arrays
- No FK from order_items.cardId to cards.id -- denormalized snapshots survive CSV re-imports per D-06
- Explicit dotenv config({ path: ".env.local" }) in drizzle.config.ts to avoid drizzle-kit defaulting to .env

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Completed

User provisioned Neon Postgres database, configured DATABASE_URL in .env.local and Vercel dashboard, and ran `drizzle-kit push` to create tables (cards, orders, order_items) in the database.

## Next Phase Readiness
- Schema, client, and config files are complete and TypeScript-verified
- Database provisioning and schema push (Task 2) required before API layer (Phase 7) can begin
- All table definitions match the Card, OrderItem, and OrderData interfaces from src/lib/types.ts

## Self-Check: PASSED

- FOUND: src/db/schema.ts
- FOUND: src/db/client.ts
- FOUND: drizzle.config.ts
- FOUND: .planning/phases/06-database-foundation/06-01-SUMMARY.md
- FOUND: commit d32b64f

---
*Phase: 06-database-foundation*
*Completed: 2026-04-11*
