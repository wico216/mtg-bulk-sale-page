import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  integer,
  real,
  bigserial,
  jsonb,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";

// D-05: Order status enum
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
]);

// Phase 16 D-07 / FIN-01: Card finish enum (replaces the legacy `foil` boolean
// column after the v1.3 migration). Backfill mapping during migration:
//   foil = true  -> finish = 'foil'
//   foil = false -> finish = 'normal'
// 'etched' is a third valid value introduced for the Phase 17 parser fix
// (Pitfall 7); v1.2 baseline rows have zero etched entries.
export const finishEnum = pgEnum("finish", ["normal", "foil", "etched"]);

// Cards table
export const cards = pgTable(
  "cards",
  {
    // Phase 16 D-05 / BIND-01: 5-segment composite PK
    // (`${setCode}-${collectorNumber}-${finish}-${condition}-${binder}`)
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    setName: text("set_name").notNull(),
    collectorNumber: text("collector_number").notNull(),
    // D-02: Price stored as integer cents (nullable -- null means "Price N/A")
    price: integer("price"),
    condition: text("condition").notNull(),
    quantity: integer("quantity").notNull().default(0),
    // D-03: Color identity as TEXT[] (e.g. ["G"], ["W","U"])
    colorIdentity: text("color_identity")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    imageUrl: text("image_url"),
    backImageUrl: text("back_image_url"),
    oracleText: text("oracle_text"),
    typeLine: text("type_line"),
    // Raw Scryfall mana cost string e.g. "{1}{R}", "{X}{W}", "{2}{B}{B}".
    // Stored verbatim; rendered to mana-font symbols at the UI layer.
    // Nullable: pre-backfill rows + future Scryfall not_found results stay null.
    manaCost: text("mana_cost"),
    manaValue: real("mana_value"),
    rarity: text("rarity").notNull(),
    // Phase 16 FIN-01 / D-07: 3-value finish enum (replaces the legacy `foil`
    // boolean). The migration script drops the foil column after backfilling
    // finish from it; see `scripts/migrate-v1.3-binder.ts`.
    finish: finishEnum("finish").notNull(),
    // Phase 16 BIND-01 / BIND-02 / D-06: Binder dimension. Defaults to
    // 'unsorted' for legacy rows + first-deploy seed; the picker (Phase 19)
    // shows 'unsorted' as a default-unchecked checkbox so legacy data
    // persists untouched on first import (D-10).
    binder: text("binder").notNull().default("unsorted"),
    // D-07: Scryfall ID (null until Phase 10 CSV import populates it)
    scryfallId: text("scryfall_id"),
    // D-04: Timestamps with timezone
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // D-08: Indexes for search performance
    index("cards_name_idx").on(table.name),
    index("cards_set_code_idx").on(table.setCode),
    // Phase 16 BIND-04 / D-08: schema-level safety net for the Phase 18
    // allocator. A double-decrement of the same row will surface as a
    // constraint violation (HTTP 503) rather than a silent oversell.
    check("cards_quantity_check", sql`${table.quantity} >= 0`),
  ],
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    action: text("action").notNull(),
    actorEmail: text("actor_email"),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    targetCount: integer("target_count"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("admin_audit_log_created_at_idx").on(table.createdAt),
    index("admin_audit_log_action_idx").on(table.action),
    index("admin_audit_log_target_type_idx").on(table.targetType),
  ],
);

export const importHistory = pgTable(
  "import_history",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    actorEmail: text("actor_email"),
    fileNames: text("file_names")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    fileCount: integer("file_count").notNull().default(0),
    parsedRows: integer("parsed_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    insertedCards: integer("inserted_cards").notNull().default(0),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    committedAt: timestamp("committed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("import_history_committed_at_idx").on(table.committedAt),
    index("import_history_actor_email_idx").on(table.actorEmail),
  ],
);

// Orders table
export const orders = pgTable(
  "orders",
  {
    // Order reference string like "ORD-20260411-1430"
    id: text("id").primaryKey(),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    // 2026-05-14 quick task 260514-7z2: optional buyer phone for pickup/shipping
    // coordination. NULLABLE — buyers can submit without a phone. Validated
    // server-side (≤32 chars, must contain at least one digit) at the API
    // boundary. Lives on AdminOrderDetail; explicitly stripped from
    // PublicOrderData so it NEVER reaches the buyer's CheckoutResponse.
    buyerPhone: text("buyer_phone"),
    message: text("message"),
    adminNote: text("admin_note"),
    totalItems: integer("total_items").notNull(),
    // Price stored as integer cents
    totalPrice: integer("total_price").notNull(),
    // D-05: Status enum
    status: orderStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // D-08: Index for order listing by date
    index("orders_created_at_idx").on(table.createdAt),
  ],
);

// Rate-limit hits table (Phase 15-01 + WR-02).
//
// Tracked here so drizzle-kit sees the schema -- previously this table was
// only created by an idempotent `CREATE TABLE IF NOT EXISTS` inside
// `createPostgresRateLimitStore.ensureTable()`, which meant the table
// definition was invisible to migration tooling. Future schema changes
// (e.g. adding a partition column or an EXPIRES_AT default) had to be
// hand-coordinated.
//
// The runtime lazy-create still runs (it remains the source of truth for
// existing deployments that pre-date this schema entry being added); the
// drizzle definition simply lets `drizzle-kit generate` emit a migration
// so the schema converges on tracked migrations going forward.
//
// The Postgres store opportunistically prunes rows older than the longest
// configured window during recordHit (with low probability) to keep the
// table from growing without bound. See `createPostgresRateLimitStore`.
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    hitAt: timestamp("hit_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Matches the index that ensureTable() creates at runtime.
    index("rate_limit_hits_bucket_key_hit_at_idx").on(
      table.bucket,
      table.key,
      table.hitAt.desc(),
    ),
  ],
);

// Order items table (denormalized card snapshots -- no FK to cards)
export const orderItems = pgTable(
  "order_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // FK to orders with cascade delete
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // NO FK to cards -- denormalized, survives re-imports
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
    // Image URL snapshot for order history display
    imageUrl: text("image_url"),
    // Phase 16 BIND-03 / D-09: Binder snapshot at time of order. Historical
    // rows (pre-v1.3) carry 'unsorted' as the migration default. Phase 21
    // admin order detail renders this as a [binder] annotation.
    binder: text("binder").notNull().default("unsorted"),
  },
  (table) => [
    // Index on order_id (addresses Codex review concern)
    index("order_items_order_id_idx").on(table.orderId),
  ],
);
