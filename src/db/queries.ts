import "server-only";

import { eq, count, max, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { cards } from "@/db/schema";
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
