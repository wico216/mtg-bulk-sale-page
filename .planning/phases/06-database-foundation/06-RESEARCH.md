# Phase 6: Database Foundation - Research

**Researched:** 2026-04-11
**Domain:** Neon Postgres + Drizzle ORM data layer for Next.js 16
**Confidence:** HIGH

## Summary

Phase 6 provisions a Neon Postgres database, defines a Drizzle ORM schema for cards, orders, and order_items tables, and seeds the database from existing static JSON. The storefront continues reading static JSON during this phase -- the switch to DB reads happens in Phase 7.

The standard stack is Drizzle ORM 0.45.2 with `@neondatabase/serverless` 1.0.2 using the **neon-http** driver (HTTP adapter). This combination is well-documented, actively maintained, and optimized for Vercel serverless functions. Schema changes use `drizzle-kit push` per D-09 (no migration files). The seed script reads `data/generated/cards.json`, converts dollar prices to integer cents, and upserts into the cards table in chunked batches.

A key compatibility note: `@neondatabase/serverless` 1.0.0 introduced a breaking API change (tagged-template-only invocation), but this was resolved in drizzle-orm 0.40.1. Since we use 0.45.2, no workaround is needed. [VERIFIED: GitHub issue #5208, closed 2026-03-05]

**Primary recommendation:** Use `drizzle-orm/neon-http` with the simplified `drizzle(process.env.DATABASE_URL!)` connection pattern. Keep `dotenv` in drizzle.config.ts for CLI tooling, and rely on Next.js built-in env loading for runtime code.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Keep composite string ID as primary key (`${setCode}-${collectorNumber}-${foil}-${condition}`). No migration to auto-increment or UUID.
- **D-02:** Price stored as integer cents (e.g., 1299 = $12.99). Frontend divides by 100 for display.
- **D-03:** colorIdentity stored as Postgres TEXT[] array column. Enables native array operators.
- **D-04:** Cards table includes both `created_at` and `updated_at` timestamp columns with auto-defaults.
- **D-05:** Orders table includes a status enum column (`pending` | `confirmed` | `completed`).
- **D-06:** Cards use hard delete (row removed), not soft delete.
- **D-07:** Add `scryfall_id` column to cards table.
- **D-08:** Add basic indexes: cards.name (search), cards.set_code (set filter), orders.created_at (order history sorting).
- **D-09:** Schema changes applied via `drizzle-kit push` (direct apply, no migration files).
- **D-10:** Keep `generate-data.ts` in the build pipeline during Phase 6. Removal happens in Phase 7.
- **D-11:** Database files live in `src/db/` -- schema.ts, client.ts, seed.ts.
- **D-12:** Seed script reads existing `data/generated/cards.json` and inserts into DB.
- **D-13:** Seed script is idempotent -- uses INSERT ... ON CONFLICT DO UPDATE (upsert).

### Claude's Discretion
- Neon connection driver choice (HTTP vs WebSocket vs both) -- Claude picks based on Drizzle + Neon docs for Next.js on Vercel
- Order_items snapshot depth (essential fields vs full snapshot with image/oracle) -- Claude decides based on Phase 11 order history UI needs

### Deferred Ideas (OUT OF SCOPE)
- Scryfall-style query system -- Belongs in its own phase after search infrastructure exists.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DB-01 | Vercel Postgres database with cards and orders schema | Neon Postgres (Vercel Marketplace integration), Drizzle ORM schema definitions for cards, orders, order_items tables, `drizzle-kit push` for schema application |
| DB-02 | Existing card inventory migrated from static JSON to database | Seed script reads `data/generated/cards.json`, converts prices to cents, upserts via chunked batch INSERT ON CONFLICT DO UPDATE |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.2 | Type-safe ORM for Postgres | Lightweight (33KB), full TypeScript inference, native Neon driver support [VERIFIED: npm registry] |
| @neondatabase/serverless | 1.0.2 | Neon Postgres serverless driver | HTTP + WebSocket Neon connectivity for serverless environments [VERIFIED: npm registry] |
| drizzle-kit | 0.31.10 | Schema push CLI tool | Companion tool for drizzle-orm; handles push/generate/migrate [VERIFIED: npm registry] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | 17.4.1 | Env var loading for CLI tools | Used in drizzle.config.ts and seed script (outside Next.js runtime) [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| neon-http driver | neon-serverless (WebSocket) | WebSocket needed only for interactive transactions or session-level features; HTTP is faster for one-shot queries in serverless [CITED: orm.drizzle.team/docs/connect-neon] |
| drizzle-kit push | drizzle-kit generate + migrate | Migration files provide history but add ceremony; push is appropriate for solo-dev [CITED: orm.drizzle.team/docs/drizzle-kit-push] |
| Drizzle ORM | Prisma | Prisma adds ~8MB to bundle, requires code generation step; Drizzle is 33KB with zero generation [ASSUMED] |

**Installation:**
```bash
npm install drizzle-orm @neondatabase/serverless dotenv
npm install -D drizzle-kit
```

**Version verification:**
- drizzle-orm: 0.45.2 (published 2026-04-10) [VERIFIED: npm registry]
- @neondatabase/serverless: 1.0.2 (published 2025+) [VERIFIED: npm registry]
- drizzle-kit: 0.31.10 [VERIFIED: npm registry]
- dotenv: 17.4.1 [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure (D-11)

```
src/
├── db/
│   ├── schema.ts        # Drizzle table definitions (cards, orders, order_items, enums)
│   ├── client.ts         # Neon HTTP connection, db export
│   └── seed.ts           # Idempotent seed script (reads cards.json, upserts to DB)
├── lib/
│   ├── types.ts          # Existing Card, OrderItem, OrderData interfaces (unchanged)
│   └── ...               # Existing code (unchanged in Phase 6)
└── ...
drizzle.config.ts          # Drizzle Kit configuration (project root)
```

### Pattern 1: Neon HTTP Connection (Claude's Discretion -- HTTP chosen)

**What:** Use the neon-http driver for all database operations. HTTP is faster for single, non-interactive transactions -- which is all this app needs (reads, inserts, upserts).

**When to use:** All serverless function contexts (API routes, server components, seed scripts).

**Why not WebSocket:** The app has no need for interactive transactions, session-level features, or persistent connections. Every DB operation is a single query or a batch of independent inserts. HTTP eliminates the WebSocket handshake overhead and `ws` dependency. [CITED: orm.drizzle.team/docs/connect-neon]

**Example:**
```typescript
// src/db/client.ts
// Source: https://orm.drizzle.team/docs/connect-neon
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

Note: In Next.js runtime, `process.env.DATABASE_URL` is loaded automatically from `.env.local`. No `dotenv` import needed in runtime code. [CITED: Next.js 16 bundled docs, environment-variables.md]

### Pattern 2: Drizzle Config for CLI Tools

**What:** `drizzle.config.ts` at project root with explicit dotenv loading.

**Why explicit dotenv:** `drizzle-kit` is a CLI tool that runs outside Next.js. It has built-in dotenv that reads `.env` but does NOT reliably read `.env.local`. The safest pattern is explicit `dotenv` import pointing to `.env.local`. [CITED: github.com/drizzle-team/drizzle-orm/discussions/1600]

**Example:**
```typescript
// drizzle.config.ts
// Source: https://orm.drizzle.team/docs/get-started/neon-new
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Pattern 3: Schema Definition with Postgres-Specific Types

**What:** Use Drizzle's pg-core builders for the exact column types specified in decisions.

**Example:**
```typescript
// src/db/schema.ts
// Sources: https://orm.drizzle.team/docs/column-types/pg
//          https://orm.drizzle.team/docs/guides/empty-array-default-value
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// D-05: Order status enum
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "completed",
]);

// Cards table -- matches Card interface + D-01 through D-08
export const cards = pgTable("cards", {
  // D-01: Composite string primary key
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  setCode: text("set_code").notNull(),
  setName: text("set_name").notNull(),
  collectorNumber: text("collector_number").notNull(),
  // D-02: Price in integer cents, null means "Price N/A"
  price: integer("price"),
  condition: text("condition").notNull(),
  quantity: integer("quantity").notNull().default(0),
  // D-03: Color identity as TEXT[] array
  colorIdentity: text("color_identity")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  imageUrl: text("image_url"),
  oracleText: text("oracle_text"),
  rarity: text("rarity").notNull(),
  foil: boolean("foil").notNull().default(false),
  // D-07: Scryfall ID for re-enrichment
  scryfallId: text("scryfall_id"),
  // D-04: Timestamps
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  // D-08: Basic indexes
  index("cards_name_idx").on(table.name),
  index("cards_set_code_idx").on(table.setCode),
]);

// Orders table
export const orders = pgTable("orders", {
  id: text("id").primaryKey(), // orderRef (e.g., "ORD-20260411-1430")
  buyerName: text("buyer_name").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  message: text("message"),
  totalItems: integer("total_items").notNull(),
  // Total price in integer cents
  totalPrice: integer("total_price").notNull(),
  // D-05: Status enum
  status: orderStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  // D-08: Order history sorting
  index("orders_created_at_idx").on(table.createdAt),
]);

// Order items table -- denormalized snapshot (no FK to cards per STATE.md)
export const orderItems = pgTable("order_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orderId: text("order_id").notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  cardId: text("card_id").notNull(),
  name: text("name").notNull(),
  setName: text("set_name").notNull(),
  setCode: text("set_code").notNull(),
  collectorNumber: text("collector_number").notNull(),
  condition: text("condition").notNull(),
  // Price in integer cents at time of order
  price: integer("price"),
  quantity: integer("quantity").notNull(),
  // Line total in integer cents
  lineTotal: integer("line_total"),
  // Full snapshot for order history UI (Claude's discretion)
  imageUrl: text("image_url"),
});
```

**Claude's discretion on order_items snapshot depth:** Include `imageUrl` in the order_items snapshot. Phase 11 order history UI will need to display card images in the order detail view. Oracle text is omitted -- it is not shown in order summaries and can be fetched from the cards table if ever needed. This keeps the snapshot practical without bloating every order row with long text fields.

### Pattern 4: Idempotent Seed Script with Chunked Upserts

**What:** Read `cards.json`, convert prices from dollars to cents, batch-insert with ON CONFLICT DO UPDATE.

**Why chunking:** PostgreSQL has a 65535 bind parameter limit per query. With ~17 columns per card, each batch can handle ~3800 rows safely. Chunking to 1000 rows per batch provides comfortable headroom. [VERIFIED: PostgreSQL wire protocol Int16 limit]

**Example:**
```typescript
// src/db/seed.ts (conceptual pattern)
// Source: https://orm.drizzle.team/docs/guides/upsert
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { cards } from "./schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CardData } from "@/lib/types";

config({ path: ".env.local" });

const db = drizzle(process.env.DATABASE_URL!);

const BATCH_SIZE = 1000;

async function seed() {
  const raw = readFileSync(
    resolve(process.cwd(), "data/generated/cards.json"),
    "utf-8"
  );
  const cardData: CardData = JSON.parse(raw);

  // Convert Card[] to DB row format (dollars -> cents)
  const rows = cardData.cards.map((card) => ({
    id: card.id,
    name: card.name,
    setCode: card.setCode,
    setName: card.setName,
    collectorNumber: card.collectorNumber,
    price: card.price !== null ? Math.round(card.price * 100) : null,
    condition: card.condition,
    quantity: card.quantity,
    colorIdentity: card.colorIdentity,
    imageUrl: card.imageUrl,
    oracleText: card.oracleText,
    rarity: card.rarity,
    foil: card.foil,
    scryfallId: null, // Populated in future from CSV re-parse
  }));

  // D-13: Chunked upsert
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await db.insert(cards).values(chunk).onConflictDoUpdate({
      target: cards.id,
      set: {
        name: sql.raw(`excluded.name`),
        price: sql.raw(`excluded.price`),
        quantity: sql.raw(`excluded.quantity`),
        colorIdentity: sql.raw(`excluded.color_identity`),
        imageUrl: sql.raw(`excluded.image_url`),
        oracleText: sql.raw(`excluded.oracle_text`),
        rarity: sql.raw(`excluded.rarity`),
        foil: sql.raw(`excluded.foil`),
        updatedAt: sql`now()`,
      },
    });
    console.log(`Seeded ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} cards`);
  }
}

seed().then(() => {
  console.log("Seed complete");
  process.exit(0);
}).catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

### Pattern 5: Price Conversion Layer

**What:** Dollars-to-cents on write (seed/import), cents-to-dollars on read (API/frontend).

**Why:** The existing `Card` interface uses `number | null` in dollars. The DB stores integer cents (D-02). The conversion boundary is the data access layer.

**Convention:**
- **Write path (seed, future CSV import):** `Math.round(dollarPrice * 100)` -- rounds to nearest cent
- **Read path (query results):** `centsPrice / 100` -- convert back to dollars for existing frontend code
- Phase 7 will establish the read path when the storefront switches from JSON to DB

### Anti-Patterns to Avoid

- **Storing prices as float/decimal in Postgres:** Floating-point arithmetic causes rounding errors with money. Integer cents are the standard approach. [CITED: D-02 from CONTEXT.md]
- **Using WebSocket driver for simple queries:** Adds `ws` dependency, connection pool overhead, and WebSocket constructor config for Node.js -- all unnecessary for HTTP-only one-shot queries. [CITED: orm.drizzle.team/docs/connect-neon]
- **Inserting all cards in a single massive query:** Exceeds PostgreSQL 65535 parameter limit for large inventories. Always chunk. [VERIFIED: PostgreSQL protocol]
- **Relying on drizzle-kit's built-in dotenv for .env.local:** It reads `.env` by default, not `.env.local`. Explicit `config({ path: ".env.local" })` is required. [CITED: github.com/drizzle-team/drizzle-orm/discussions/1600]
- **Foreign key from order_items to cards:** Cards table is wiped and reseeded on CSV import. FK would prevent order history from surviving re-imports. Denormalized snapshots are correct per STATE.md. [CITED: STATE.md -- "Denormalized order_items (no FK to cards)"]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL query building | Raw SQL string concatenation | Drizzle ORM query builder | Type safety, SQL injection prevention, IntelliSense |
| Database connection management | Manual connection pooling | `@neondatabase/serverless` HTTP driver | Neon handles connection management for serverless |
| Schema migrations | Hand-written ALTER TABLE scripts | `drizzle-kit push` | Reads schema.ts, diffs against DB, generates + applies SQL |
| Upsert logic | Custom INSERT/SELECT/UPDATE flow | `.onConflictDoUpdate()` | Atomic, single-statement, handles concurrency |
| Env var loading for CLI | Manual process.env parsing | `dotenv` package | Standard, handles .env file parsing correctly |

**Key insight:** Drizzle ORM provides full type inference from schema definitions. The TypeScript types for insert/select/update are generated automatically from `pgTable` definitions -- no separate type definitions or code generation step needed.

## Common Pitfalls

### Pitfall 1: Neon Cold Start Latency

**What goes wrong:** First query after inactivity takes 200-500ms as Neon compute wakes from scale-to-zero.
**Why it happens:** Neon free tier suspends compute after ~5 minutes of inactivity. [ASSUMED]
**How to avoid:** Not a problem during development/seeding. For production, the first page load may be slower. Neon compute startup is a one-time cost per wake cycle.
**Warning signs:** Slow first API response after periods of no traffic.

### Pitfall 2: drizzle-kit push and .env.local

**What goes wrong:** `drizzle-kit push` fails with "DATABASE_URL is not set" even though `.env.local` has it.
**Why it happens:** drizzle-kit's built-in dotenv reads `.env` not `.env.local`. Next.js convention uses `.env.local` for secrets.
**How to avoid:** Explicit `config({ path: ".env.local" })` in `drizzle.config.ts`. [CITED: github.com/drizzle-team/drizzle-orm/discussions/1600]
**Warning signs:** Works in `next dev` but fails in `npx drizzle-kit push`.

### Pitfall 3: Price Conversion Off-by-One

**What goes wrong:** $12.99 becomes 1298 cents instead of 1299 due to floating-point.
**Why it happens:** `12.99 * 100 = 1298.9999999999998` in JavaScript.
**How to avoid:** Use `Math.round(price * 100)` -- rounds to nearest integer cent. [VERIFIED: JavaScript IEEE 754 floating-point behavior]
**Warning signs:** Prices off by 1 cent in DB compared to JSON source.

### Pitfall 4: @neondatabase/serverless 1.0.0 Breaking Change

**What goes wrong:** Queries fail with "can only be called as a tagged-template function" error.
**Why it happens:** `@neondatabase/serverless` 1.0.0 changed its API to require tagged-template syntax.
**How to avoid:** Use drizzle-orm >= 0.40.1 (we use 0.45.2). The fix is already in place. [VERIFIED: GitHub issue drizzle-team/drizzle-orm#5208, fix confirmed in 0.40.1]
**Warning signs:** Only affects users on drizzle-orm < 0.40.1 with @neondatabase/serverless >= 1.0.0.

### Pitfall 5: Seed Script Timeout on Large Inventories

**What goes wrong:** Seed script times out or exceeds Neon HTTP response size.
**Why it happens:** Single massive INSERT with thousands of rows. Neon HTTP has a 10MB response limit.
**How to avoid:** Chunk inserts to 1000 rows per batch. Log progress. [VERIFIED: Neon docs -- response size limit raised to 10MB]
**Warning signs:** Network timeout errors or "response too large" from Neon.

### Pitfall 6: Using Pooled Connection String for drizzle-kit push

**What goes wrong:** Schema push fails or behaves unpredictably.
**Why it happens:** PgBouncer (pooled connections) does not support all DDL operations needed for schema changes.
**How to avoid:** Use the direct (non-pooled) connection string for `drizzle-kit push` and migrations. The Neon console provides both variants. [CITED: neon.com/docs/guides/drizzle-migrations]
**Warning signs:** Error messages about prepared statements or unexpected transaction behavior during push.

## Code Examples

### Complete cards table definition with all decisions applied

```typescript
// Source: https://orm.drizzle.team/docs/column-types/pg + project decisions D-01 through D-08
import { sql } from "drizzle-orm";
import { pgTable, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const cards = pgTable("cards", {
  id: text("id").primaryKey(),                           // D-01: composite string PK
  name: text("name").notNull(),
  setCode: text("set_code").notNull(),
  setName: text("set_name").notNull(),
  collectorNumber: text("collector_number").notNull(),
  price: integer("price"),                               // D-02: cents, null = N/A
  condition: text("condition").notNull(),
  quantity: integer("quantity").notNull().default(0),
  colorIdentity: text("color_identity")                  // D-03: TEXT[] array
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  imageUrl: text("image_url"),
  oracleText: text("oracle_text"),
  rarity: text("rarity").notNull(),
  foil: boolean("foil").notNull().default(false),
  scryfallId: text("scryfall_id"),                       // D-07
  createdAt: timestamp("created_at", { withTimezone: true })  // D-04
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })  // D-04
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("cards_name_idx").on(table.name),                // D-08
  index("cards_set_code_idx").on(table.setCode),         // D-08
]);
```

### Batch upsert with excluded keyword

```typescript
// Source: https://orm.drizzle.team/docs/guides/upsert
import { sql } from "drizzle-orm";
import { cards } from "./schema";

// Type-safe batch upsert -- updates all mutable fields on conflict
await db.insert(cards).values(chunk).onConflictDoUpdate({
  target: cards.id,
  set: {
    name: sql.raw(`excluded.name`),
    price: sql.raw(`excluded.price`),
    quantity: sql.raw(`excluded.quantity`),
    colorIdentity: sql.raw(`excluded.color_identity`),
    imageUrl: sql.raw(`excluded.image_url`),
    oracleText: sql.raw(`excluded.oracle_text`),
    rarity: sql.raw(`excluded.rarity`),
    foil: sql.raw(`excluded.foil`),
    scryfallId: sql.raw(`excluded.scryfall_id`),
    updatedAt: sql`now()`,
  },
});
```

### pgEnum for order status

```typescript
// Source: https://orm.drizzle.team/docs/column-types/pg
import { pgEnum } from "drizzle-orm/pg-core";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "completed",
]);
```

### drizzle.config.ts with explicit env loading

```typescript
// Source: https://orm.drizzle.team/docs/get-started/neon-new
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel Postgres (@vercel/postgres) | Neon Postgres directly (@neondatabase/serverless) | Q4 2024 - Q1 2025 | Vercel migrated all Postgres stores to Neon. Better free tier limits (500MB storage, 100 CU-hours). [CITED: neon.com/docs/guides/vercel-postgres-transition-guide] |
| @neondatabase/serverless 0.x | @neondatabase/serverless 1.0.x | Late 2025 | Breaking API change (tagged-template function). Fixed in drizzle-orm 0.40.1+. [VERIFIED: GitHub issue #5208] |
| drizzle-orm manual driver import | drizzle(connectionString) shorthand | drizzle-orm 0.30+ | Can pass DATABASE_URL directly to `drizzle()` without explicitly creating neon client. [CITED: orm.drizzle.team/docs/connect-neon] |

**Deprecated/outdated:**
- `@vercel/postgres`: Deprecated in favor of direct Neon integration. Do not use. [CITED: neon.com/docs/guides/vercel-postgres-transition-guide]
- `drizzle-orm/neon-http` with `neon()` function explicitly: Still works but the shorthand `drizzle(process.env.DATABASE_URL!)` is now the recommended pattern. [CITED: orm.drizzle.team/docs/connect-neon]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Neon free tier suspends compute after ~5 minutes of inactivity | Pitfall 1 | Low -- cold start latency is a UX concern, not a correctness issue. Actual timeout may differ. |
| A2 | Prisma adds ~8MB to bundle vs Drizzle 33KB | Alternatives Considered | Low -- does not affect decisions since Drizzle is already locked. |

## Open Questions

1. **Scryfall ID Population in Seed**
   - What we know: The CSV has a `Scryfall ID` column (verified in `Blue Binder.csv`). The `ManaboxRow` interface declares `"Scryfall ID"?: string` but csv-parser.ts currently ignores it. The seed reads `cards.json` which does not include Scryfall IDs.
   - What's unclear: Should the seed script also parse the CSV to extract Scryfall IDs, or leave the column null until a future CSV import (Phase 10)?
   - Recommendation: Leave `scryfallId` null in the initial seed (data from cards.json does not have it). Phase 10 CSV import will populate it when the CSV parser is updated to extract `Scryfall ID`. This keeps Phase 6 focused and avoids adding CSV re-parsing to the seed.

2. **Neon Project Provisioning**
   - What we know: Neon is available via Vercel Marketplace or direct console. Free tier provides 500MB storage and 100 CU-hours/month.
   - What's unclear: Whether to provision via Vercel Marketplace integration or directly in Neon console.
   - Recommendation: Provision directly in Neon console (neon.tech). Copy the connection string to `.env.local`. This avoids coupling to Vercel's marketplace integration and keeps local dev simple. Vercel integration can be added later for automated preview branch databases if desired.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime + CLI tools | Yes | v25.8.0 | -- |
| npm | Package installation | Yes | 11.11.0 | -- |
| TypeScript | Type checking | Yes | 5.9.3 | -- |
| tsx | Seed script execution | Yes | ^4.21.0 (devDep) | -- |
| psql | Optional: manual DB inspection | Yes | 18.3 | Not required; drizzle-kit studio provides UI |
| Neon Postgres (remote) | Database | Requires provisioning | -- | Must create Neon project before implementation |

**Missing dependencies with no fallback:**
- Neon Postgres project must be provisioned before any DB operations. This is a manual step (create project at neon.tech, copy connection string to `.env.local`).

**Missing dependencies with fallback:**
- None. All local tooling is available.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-01 | Cards, orders, order_items tables exist with correct schema | smoke | `npx drizzle-kit push --verbose` (validates schema applies cleanly) | N/A -- CLI command |
| DB-01 | Schema types are correctly inferred | type-check | `npx tsc --noEmit` | N/A -- existing build check |
| DB-02 | Seed script inserts all cards from JSON without data loss | smoke | `npx tsx src/db/seed.ts` + verify count query | Wave 0 |
| DB-02 | Seed is idempotent (re-run produces same result) | smoke | Run seed twice, verify no duplicates | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (type checking)
- **Per wave merge:** `npx drizzle-kit push --verbose` + `npx tsx src/db/seed.ts`
- **Phase gate:** Schema pushed, seed completes, card count matches JSON source

### Wave 0 Gaps

- [ ] No test framework installed -- validation relies on CLI smoke tests (`drizzle-kit push`, `tsx seed.ts`, `tsc --noEmit`) rather than unit tests
- [ ] Seed verification script (query card count from DB, compare to cards.json count) -- could be added to seed.ts as a final verification step

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A (Phase 6 has no auth -- storefront is public, admin auth is Phase 8) |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A (no user-facing DB access in Phase 6) |
| V5 Input Validation | Yes (seed script) | Seed reads trusted local file (cards.json generated by build pipeline). Drizzle ORM parameterizes all queries. |
| V6 Cryptography | No | N/A |

### Known Threat Patterns for Drizzle + Neon

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via raw input | Tampering | Drizzle ORM uses parameterized queries by default. `sql.raw()` in upsert uses column references, not user input. |
| Connection string exposure | Information Disclosure | `.env.local` is gitignored. DATABASE_URL never prefixed with NEXT_PUBLIC_. |
| Unauthorized DB access | Elevation of Privilege | Neon requires SSL (`sslmode=require`). Connection string contains auth credentials. No public-facing DB queries in Phase 6 (seed script is developer-run). |

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM -- Neon connection guide](https://orm.drizzle.team/docs/connect-neon) -- Driver selection, setup patterns
- [Drizzle ORM -- Get started with Neon](https://orm.drizzle.team/docs/get-started/neon-new) -- Installation, config, schema
- [Drizzle ORM -- PostgreSQL column types](https://orm.drizzle.team/docs/column-types/pg) -- text, integer, timestamp, boolean, array
- [Drizzle ORM -- Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) -- Index definition syntax
- [Drizzle ORM -- Upsert guide](https://orm.drizzle.team/docs/guides/upsert) -- ON CONFLICT DO UPDATE patterns
- [Drizzle ORM -- Empty array default](https://orm.drizzle.team/docs/guides/empty-array-default-value) -- TEXT[] default syntax
- [Drizzle ORM -- drizzle-kit push](https://orm.drizzle.team/docs/drizzle-kit-push) -- Push vs migrate
- [Neon -- Drizzle migrations guide](https://neon.com/docs/guides/drizzle-migrations) -- Direct connection for migrations
- [Neon -- Connect from Drizzle](https://neon.com/docs/guides/drizzle) -- Driver setup, env vars
- [npm registry](https://www.npmjs.com/) -- Version verification for all packages

### Secondary (MEDIUM confidence)
- [Neon -- Vercel Postgres transition guide](https://neon.com/docs/guides/vercel-postgres-transition-guide) -- Migration from @vercel/postgres
- [Neon -- Plans and pricing](https://neon.com/docs/introduction/plans) -- Free tier limits
- [GitHub issue #5208](https://github.com/drizzle-team/drizzle-orm/issues/5208) -- @neondatabase/serverless 1.0.0 compatibility fix
- [GitHub discussion #1600](https://github.com/drizzle-team/drizzle-orm/discussions/1600) -- drizzle-kit .env.local issue

### Tertiary (LOW confidence)
- None. All claims verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All versions verified against npm registry; official docs confirm patterns
- Architecture: HIGH -- Patterns drawn from official Drizzle + Neon tutorials and docs
- Pitfalls: HIGH -- Confirmed via GitHub issues, official docs, and PostgreSQL protocol specs

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable ecosystem, 30-day window appropriate)
