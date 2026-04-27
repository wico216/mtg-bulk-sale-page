import "server-only";

import { eq, count, max, asc, desc, ilike, and, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { cards } from "@/db/schema";
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
  return result.length > 0 ? rowToCard(result[0]) : null;
}

/** Delete a card by ID. Returns true if deleted, false if not found. */
export async function deleteCard(id: string): Promise<boolean> {
  const result = await db
    .delete(cards)
    .where(eq(cards.id, id))
    .returning({ id: cards.id });
  return result.length > 0;
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
): Promise<{ inserted: number }> {
  if (newCards.length === 0) {
    await db.batch([db.delete(cards)]);
    return { inserted: 0 };
  }
  const rows = newCards.map(cardToRow);
  await db.batch([db.delete(cards), db.insert(cards).values(rows)]);
  return { inserted: rows.length };
}

/** Delete every card from inventory. Returns the number of rows removed. */
export async function deleteAllCards(): Promise<{ deleted: number }> {
  const deletedRows = await db
    .delete(cards)
    .returning({ id: cards.id });
  return { deleted: deletedRows.length };
}
