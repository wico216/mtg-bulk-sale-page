import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// D-05: Order status enum
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
]);

// Cards table
export const cards = pgTable(
  "cards",
  {
    // D-01: Composite string PK (${setCode}-${collectorNumber}-${foil}-${condition})
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
    oracleText: text("oracle_text"),
    rarity: text("rarity").notNull(),
    foil: boolean("foil").notNull().default(false),
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

// Orders table
export const orders = pgTable(
  "orders",
  {
    // Order reference string like "ORD-20260411-1430"
    id: text("id").primaryKey(),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
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
  },
  (table) => [
    // Index on order_id (addresses Codex review concern)
    index("order_items_order_id_idx").on(table.orderId),
  ],
);
