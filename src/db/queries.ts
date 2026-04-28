import "server-only";

import { eq, count, max, asc, desc, ilike, and, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { adminAuditLog, cards } from "@/db/schema";
import { cardToRow } from "@/db/seed";
import type { Card, CardData } from "@/lib/types";

/**
 * Data access layer for the storefront.
 * All storefront pages and API routes import card data from this single module.
 *
 * Design assumptions:
 * - Small store: ~136 cards, all fetched unbounded (no pagination needed yet)
 * - Always-fresh: force-dynamic on all pages, no caching layer
 * - Prices stored as integer cents in DB, returned as dollars to callers
 */

/**
 * Convert a Drizzle row to the application Card interface.
 * Exported for testing.
 */
export function rowToCard(row: typeof cards.$inferSelect): Card {
  return {
    id: row.id,
    name: row.name,
    setCode: row.setCode,
    setName: row.setName,
    collectorNumber: row.collectorNumber,
    price: row.price !== null ? row.price / 100 : null,
    condition: row.condition,
    quantity: row.quantity,
    colorIdentity: row.colorIdentity,
    imageUrl: row.imageUrl,
    oracleText: row.oracleText,
    rarity: row.rarity,
    foil: row.foil,
    scryfallId: row.scryfallId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Fetch all cards from the database, ordered by name ASC.
 * Returns Card[] with prices in dollars.
 */
export async function getCards(): Promise<Card[]> {
  const rows = await db.select().from(cards).orderBy(asc(cards.name));
  return rows.map(rowToCard);
}

/**
 * Fetch a single card by its composite ID.
 * Returns Card or null if not found.
 */
export async function getCardById(id: string): Promise<Card | null> {
  const rows = await db
    .select()
    .from(cards)
    .where(eq(cards.id, id))
    .limit(1);
  return rows.length > 0 ? rowToCard(rows[0]) : null;
}

/**
 * Compute card metadata from the database.
 * Returns CardData["meta"] shape exactly -- totalSkipped and totalMissingPrices
 * are hardcoded 0 (not applicable for DB source, retained for type compatibility).
 */
export async function getCardsMeta(): Promise<CardData["meta"]> {
  const [result] = await db
    .select({
      totalCards: count(),
      lastUpdated: max(cards.updatedAt),
    })
    .from(cards);

  return {
    lastUpdated: result.lastUpdated?.toISOString() ?? new Date().toISOString(),
    totalCards: result.totalCards,
    totalSkipped: 0,
    totalMissingPrices: 0,
  };
}

// --- Admin query types ---

export interface AdminCardsParams {
  page?: number;
  limit?: number;
  search?: string;
  set?: string;
  condition?: string;
  sortBy?: "name" | "price" | "quantity";
  sortDir?: "asc" | "desc";
}

export interface AdminCardsResult {
  cards: Card[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AdminAuditAction =
  | "inventory.update"
  | "inventory.delete_one"
  | "inventory.delete_many"
  | "inventory.delete_all"
  | "inventory.import_commit"
  | "order.status_update"
  | "order.cancel"
  | "order.restore_inventory";

export type AdminAuditTargetType = "card" | "inventory" | "order" | "import";

export interface AdminAuditEntry {
  id: number;
  action: AdminAuditAction;
  actorEmail: string | null;
  targetType: AdminAuditTargetType;
  targetId: string | null;
  targetCount: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateAdminAuditEntryInput {
  action: AdminAuditAction;
  actorEmail?: string | null;
  targetType: AdminAuditTargetType;
  targetId?: string | null;
  targetCount?: number | null;
  metadata?: Record<string, unknown>;
}

export interface AdminAuditEntriesParams {
  page?: number;
  limit?: number;
  action?: AdminAuditAction;
  targetType?: AdminAuditTargetType;
}

export interface AdminAuditEntriesResult {
  entries: AdminAuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminMutationAuditContext {
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}

interface AdminAuditRow {
  [key: string]: unknown;
  id: number;
  action: string;
  actorEmail?: string | null;
  targetType: string;
  targetId?: string | null;
  targetCount?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string | Date;
}

const MAX_AUDIT_STRING_LENGTH = 320;
const MAX_AUDIT_ARRAY_LENGTH = 50;
const MAX_AUDIT_OBJECT_KEYS = 40;
const MAX_AUDIT_DEPTH = 4;
const MAX_AUDIT_METADATA_BYTES = 4096;
const REDACTED_AUDIT_VALUE = "[redacted]";
const SENSITIVE_AUDIT_KEY_PATTERN =
  /(password|secret|token|api[_-]?key|authorization|cookie|session|credential)/i;
const RAW_CONTENT_AUDIT_KEY_PATTERN =
  /(raw.*csv|csv.*raw|file.*content|content.*csv|csv.*content|request.*body|response.*body)/i;

function normalizeAuditPage(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 1;
  return Math.max(1, Math.trunc(value));
}

function normalizeAuditLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 25;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function truncateAuditString(value: string): string {
  if (value.length <= MAX_AUDIT_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_AUDIT_STRING_LENGTH - 1)}…`;
}

function sanitizeAuditValue(value: unknown, depth: number): unknown {
  if (value === null) return null;
  if (typeof value === "string") return truncateAuditString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_AUDIT_ARRAY_LENGTH)
      .map((item) => sanitizeAuditValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object" || value === undefined) return undefined;
  if (depth >= MAX_AUDIT_DEPTH) return "[truncated]";

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_AUDIT_OBJECT_KEYS)) {
    if (
      SENSITIVE_AUDIT_KEY_PATTERN.test(key) ||
      RAW_CONTENT_AUDIT_KEY_PATTERN.test(key)
    ) {
      sanitized[key] = REDACTED_AUDIT_VALUE;
      continue;
    }

    const sanitizedChild = sanitizeAuditValue(child, depth + 1);
    if (sanitizedChild !== undefined) sanitized[key] = sanitizedChild;
  }
  return sanitized;
}

function sanitizeAdminAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sanitized = sanitizeAuditValue(metadata ?? {}, 0) as Record<string, unknown>;
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= MAX_AUDIT_METADATA_BYTES) return sanitized;

  return {
    truncated: true,
    summary: truncateAuditString(serialized),
  };
}

function normalizeAdminAuditAction(value: string): AdminAuditAction {
  const allowed: readonly AdminAuditAction[] = [
    "inventory.update",
    "inventory.delete_one",
    "inventory.delete_many",
    "inventory.delete_all",
    "inventory.import_commit",
    "order.status_update",
    "order.cancel",
    "order.restore_inventory",
  ];
  return allowed.includes(value as AdminAuditAction)
    ? (value as AdminAuditAction)
    : "inventory.update";
}

function normalizeAdminAuditTargetType(value: string): AdminAuditTargetType {
  const allowed: readonly AdminAuditTargetType[] = [
    "card",
    "inventory",
    "order",
    "import",
  ];
  return allowed.includes(value as AdminAuditTargetType)
    ? (value as AdminAuditTargetType)
    : "inventory";
}

function normalizeAdminAuditEntry(row: AdminAuditRow): AdminAuditEntry {
  return {
    id: row.id,
    action: normalizeAdminAuditAction(row.action),
    actorEmail: row.actorEmail ?? null,
    targetType: normalizeAdminAuditTargetType(row.targetType),
    targetId: row.targetId ?? null,
    targetCount: row.targetCount ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function buildAdminAuditInsertValues(input: CreateAdminAuditEntryInput) {
  return {
    action: input.action,
    actorEmail: input.actorEmail ?? null,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetCount: input.targetCount ?? null,
    metadata: sanitizeAdminAuditMetadata(input.metadata),
  };
}

export async function createAdminAuditEntry(
  input: CreateAdminAuditEntryInput,
): Promise<AdminAuditEntry> {
  const [row] = await db
    .insert(adminAuditLog)
    .values(buildAdminAuditInsertValues(input))
    .returning();

  if (!row) throw new Error("Audit insert returned no row");
  return normalizeAdminAuditEntry(row);
}

export async function getAdminAuditEntries(
  params: AdminAuditEntriesParams = {},
): Promise<AdminAuditEntriesResult> {
  const page = normalizeAuditPage(params.page);
  const limit = normalizeAuditLimit(params.limit);
  const offset = (page - 1) * limit;
  const filters: SQL[] = [];

  if (params.action) filters.push(sql`action = ${params.action}`);
  if (params.targetType) filters.push(sql`target_type = ${params.targetType}`);

  const whereClause = filters.length > 0 ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``;

  const [entriesResult, countResult] = await Promise.all([
    db.execute<AdminAuditRow>(sql`
      SELECT
        id,
        action,
        actor_email AS "actorEmail",
        target_type AS "targetType",
        target_id AS "targetId",
        target_count AS "targetCount",
        metadata,
        created_at AS "createdAt"
      FROM admin_audit_log
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `),
    db.execute<{ total: number | string }>(sql`
      SELECT COUNT(*)::integer AS total
      FROM admin_audit_log
      ${whereClause}
    `),
  ]);

  const total = typeof countResult.rows[0]?.total === "string"
    ? Number.parseInt(countResult.rows[0].total, 10)
    : (countResult.rows[0]?.total ?? 0);

  return {
    entries: entriesResult.rows.map(normalizeAdminAuditEntry),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

async function createMutationAuditEntry(
  audit: AdminMutationAuditContext | undefined,
  input: Omit<CreateAdminAuditEntryInput, "actorEmail" | "metadata"> & {
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!audit) return;
  await createAdminAuditEntry({
    ...input,
    actorEmail: audit.actorEmail ?? null,
    metadata: { ...(audit.metadata ?? {}), ...(input.metadata ?? {}) },
  });
}

export interface AdminDashboardBreakdown {
  quantity: number;
  uniqueCards: number;
  value: number;
}

export interface AdminDashboardStats {
  inventory: {
    uniqueCards: number;
    totalQuantity: number;
    totalValue: number;
    lowStockCount: number;
    missingPriceCount: number;
  };
  breakdowns: {
    bySet: Array<AdminDashboardBreakdown & { setCode: string }>;
    byColor: Array<AdminDashboardBreakdown & { color: string }>;
    byRarity: Array<AdminDashboardBreakdown & { rarity: string }>;
  };
}

interface DashboardBreakdownAccumulator {
  quantity: number;
  uniqueCards: number;
  valueCents: number;
}

const COLOR_SORT_ORDER = ["W", "U", "B", "R", "G"];

function toDollars(cents: number): number {
  return cents / 100;
}

function normalizeColorIdentity(colorIdentity: string[]): string {
  if (colorIdentity.length === 0) return "C";

  return [...colorIdentity]
    .sort((a, b) => {
      const aIndex = COLOR_SORT_ORDER.indexOf(a);
      const bIndex = COLOR_SORT_ORDER.indexOf(b);
      const normalizedAIndex = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const normalizedBIndex = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return normalizedAIndex - normalizedBIndex || a.localeCompare(b);
    })
    .join("");
}

function addBreakdownEntry(
  map: Map<string, DashboardBreakdownAccumulator>,
  key: string,
  quantity: number,
  valueCents: number,
) {
  const current = map.get(key) ?? { quantity: 0, uniqueCards: 0, valueCents: 0 };
  current.quantity += quantity;
  current.uniqueCards += 1;
  current.valueCents += valueCents;
  map.set(key, current);
}

function mapBreakdown<TKey extends string>(
  map: Map<string, DashboardBreakdownAccumulator>,
  keyName: TKey,
): Array<AdminDashboardBreakdown & Record<TKey, string>> {
  return [...map.entries()]
    .map(([key, value]) => ({
      [keyName]: key,
      quantity: value.quantity,
      uniqueCards: value.uniqueCards,
      value: toDollars(value.valueCents),
    }) as AdminDashboardBreakdown & Record<TKey, string>)
    .sort((a, b) => b.quantity - a.quantity || a[keyName].localeCompare(b[keyName]));
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const rows = await db
    .select({
      id: cards.id,
      setCode: cards.setCode,
      price: cards.price,
      quantity: cards.quantity,
      colorIdentity: cards.colorIdentity,
      rarity: cards.rarity,
    })
    .from(cards);

  const bySet = new Map<string, DashboardBreakdownAccumulator>();
  const byColor = new Map<string, DashboardBreakdownAccumulator>();
  const byRarity = new Map<string, DashboardBreakdownAccumulator>();

  let totalQuantity = 0;
  let totalValueCents = 0;
  let lowStockCount = 0;
  let missingPriceCount = 0;

  for (const row of rows) {
    const valueCents = (row.price ?? 0) * row.quantity;
    totalQuantity += row.quantity;
    totalValueCents += valueCents;
    if (row.quantity === 1) lowStockCount += 1;
    if (row.price === null) missingPriceCount += 1;

    addBreakdownEntry(bySet, row.setCode, row.quantity, valueCents);
    addBreakdownEntry(
      byColor,
      normalizeColorIdentity(row.colorIdentity),
      row.quantity,
      valueCents,
    );
    addBreakdownEntry(byRarity, row.rarity, row.quantity, valueCents);
  }

  return {
    inventory: {
      uniqueCards: rows.length,
      totalQuantity,
      totalValue: toDollars(totalValueCents),
      lowStockCount,
      missingPriceCount,
    },
    breakdowns: {
      bySet: mapBreakdown(bySet, "setCode"),
      byColor: mapBreakdown(byColor, "color"),
      byRarity: mapBreakdown(byRarity, "rarity"),
    },
  };
}

/** Fetch paginated, filtered, sorted cards for admin table */
export async function getAdminCards(
  params: AdminCardsParams = {},
): Promise<AdminCardsResult> {
  const {
    page = 1,
    limit = 50,
    search = "",
    set = "",
    condition = "",
    sortBy = "name",
    sortDir = "asc",
  } = params;

  const conditions: SQL[] = [];
  if (search) conditions.push(ilike(cards.name, `%${search}%`));
  if (set) conditions.push(eq(cards.setCode, set));
  if (condition) conditions.push(eq(cards.condition, condition));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const offset = (page - 1) * limit;
  const sortColumn =
    sortBy === "price"
      ? cards.price
      : sortBy === "quantity"
        ? cards.quantity
        : cards.name;
  const sortOrder = sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(cards)
      .where(where)
      .orderBy(sortOrder)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(cards).where(where),
  ]);

  return {
    cards: rows.map(rowToCard),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Update a card's editable fields.
 * Price is in dollars (converted to cents for storage).
 * Returns updated Card or null if not found.
 */
export async function updateCard(
  id: string,
  updates: { price?: number; quantity?: number; condition?: string },
  audit?: AdminMutationAuditContext,
): Promise<Card | null> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.price !== undefined)
    dbUpdates.price = Math.round(updates.price * 100);
  if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
  if (updates.condition !== undefined) dbUpdates.condition = updates.condition;

  if (Object.keys(dbUpdates).length === 0) return null;

  const result = await db
    .update(cards)
    .set(dbUpdates)
    .where(eq(cards.id, id))
    .returning();
  if (result.length === 0) return null;

  await createMutationAuditEntry(audit, {
    action: "inventory.update",
    targetType: "card",
    targetId: id,
    targetCount: 1,
    metadata: {
      changedFields: Object.keys(updates).filter(
        (field) => updates[field as keyof typeof updates] !== undefined,
      ),
      newValues: updates,
      cardName: result[0].name,
    },
  });

  return rowToCard(result[0]);
}

/** Delete a card by ID. Returns true if deleted, false if not found. */
export async function deleteCard(
  id: string,
  audit?: AdminMutationAuditContext,
): Promise<boolean> {
  const result = await db
    .delete(cards)
    .where(eq(cards.id, id))
    .returning({ id: cards.id, name: cards.name });

  if (result.length === 0) return false;

  await createMutationAuditEntry(audit, {
    action: "inventory.delete_one",
    targetType: "card",
    targetId: id,
    targetCount: 1,
    metadata: {
      cardName: result[0].name,
    },
  });

  return true;
}

/** Delete selected cards by ID. Returns actual deleted row IDs. */
export async function deleteCardsByIds(
  ids: string[],
  audit?: AdminMutationAuditContext,
): Promise<{ deleted: number; ids: string[] }> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return { deleted: 0, ids: [] };
  }

  const deletedRows = await db
    .delete(cards)
    .where(inArray(cards.id, uniqueIds))
    .returning({ id: cards.id });

  const deletedIds = deletedRows.map((row) => row.id);
  if (deletedIds.length > 0) {
    await createMutationAuditEntry(audit, {
      action: "inventory.delete_many",
      targetType: "inventory",
      targetId: null,
      targetCount: deletedIds.length,
      metadata: {
        requestedCount: uniqueIds.length,
        deletedIds,
      },
    });
  }

  return {
    deleted: deletedIds.length,
    ids: deletedIds,
  };
}

/** Fetch all cards (unpaginated) for CSV export. Returns raw DB rows (not converted). */
export async function getAllCardsForExport() {
  return db.select().from(cards).orderBy(asc(cards.name));
}

/**
 * Atomic destructive replace of the entire cards table.
 *
 * CRITICAL: uses db.batch([...]) -- NOT db.transaction().
 * Reason: drizzle-orm/neon-http does not support interactive transactions
 * (source: node_modules/drizzle-orm/neon-http/session.js throws
 * "No transactions support in neon-http driver"). db.batch() is routed through
 * Neon's HTTP transaction() endpoint and is atomic end-to-end -- all statements
 * commit together or nothing is written (Phase 10 CSV-01 "single transaction").
 *
 * Empty input is supported: replaceAllCards([]) wipes the table in a
 * single-statement batch and returns { inserted: 0 }. The API layer should
 * still block this at the UI (Pitfall 7) but the helper remains defensive.
 */
export async function replaceAllCards(
  newCards: Card[],
  audit?: AdminMutationAuditContext,
): Promise<{ inserted: number }> {
  const rows = newCards.map(cardToRow);
  const auditInsert = audit
    ? db.insert(adminAuditLog).values(
        buildAdminAuditInsertValues({
          action: "inventory.import_commit",
          actorEmail: audit.actorEmail ?? null,
          targetType: "import",
          targetId: null,
          targetCount: rows.length,
          metadata: {
            ...(audit.metadata ?? {}),
            insertedCards: rows.length,
          },
        }),
      )
    : null;

  if (newCards.length === 0) {
    if (auditInsert) {
      await db.batch([db.delete(cards), auditInsert] as unknown as Parameters<typeof db.batch>[0]);
    } else {
      await db.batch([db.delete(cards)]);
    }
    return { inserted: 0 };
  }

  if (auditInsert) {
    await db.batch([
      db.delete(cards),
      db.insert(cards).values(rows),
      auditInsert,
    ] as unknown as Parameters<typeof db.batch>[0]);
  } else {
    await db.batch([db.delete(cards), db.insert(cards).values(rows)]);
  }
  return { inserted: rows.length };
}

/** Delete every card from inventory. Returns the number of rows removed. */
export async function deleteAllCards(
  audit?: AdminMutationAuditContext,
): Promise<{ deleted: number }> {
  const deletedRows = await db
    .delete(cards)
    .returning({ id: cards.id });
  await createMutationAuditEntry(audit, {
    action: "inventory.delete_all",
    targetType: "inventory",
    targetId: null,
    targetCount: deletedRows.length,
    metadata: {
      deletedCount: deletedRows.length,
    },
  });
  return { deleted: deletedRows.length };
}
