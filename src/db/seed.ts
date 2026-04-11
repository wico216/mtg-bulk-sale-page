import { drizzle } from "drizzle-orm/neon-http";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { cards } from "./schema";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Card, CardData } from "@/lib/types";

config({ path: ".env.local" });

const BATCH_SIZE = 1000;

/**
 * Convert a Card (dollars) to a database row (cents).
 * Exported for unit testing.
 */
export function cardToRow(card: Card) {
  return {
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
    scryfallId: null, // Not in cards.json; populated by Phase 10 CSV import (D-07)
  };
}

async function seed() {
  const db = drizzle(process.env.DATABASE_URL!);

  // --- Prerequisite check: cards.json must exist ---
  // Addresses Codex review concern: hidden prerequisite
  const jsonPath = resolve(process.cwd(), "data/generated/cards.json");
  if (!existsSync(jsonPath)) {
    console.error(
      "ERROR: data/generated/cards.json not found.\n" +
        "Run 'npm run generate' first to create it from CSV inventory.",
    );
    process.exit(1);
  }

  const raw = readFileSync(jsonPath, "utf-8");
  const cardData: CardData = JSON.parse(raw);
  const sourceCards = cardData.cards;

  if (sourceCards.length === 0) {
    console.error("ERROR: cards.json contains 0 cards. Aborting seed.");
    process.exit(1);
  }

  console.log(`Read ${sourceCards.length} cards from cards.json`);

  const rows = sourceCards.map(cardToRow);

  // D-13: Chunked upsert -- idempotent INSERT ON CONFLICT DO UPDATE
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await db
      .insert(cards)
      .values(chunk)
      .onConflictDoUpdate({
        target: cards.id,
        set: {
          name: sql.raw(`excluded.name`),
          setCode: sql.raw(`excluded.set_code`),
          setName: sql.raw(`excluded.set_name`),
          collectorNumber: sql.raw(`excluded.collector_number`),
          price: sql.raw(`excluded.price`),
          condition: sql.raw(`excluded.condition`),
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
    console.log(
      `Seeded ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} cards`,
    );
  }

  // --- ID-level data integrity verification ---
  // Addresses ALL 3 reviewers (HIGH): row-count alone doesn't prove "no data loss"
  // Compare source IDs against DB IDs, not just counts
  const sourceIds = new Set(sourceCards.map((c) => c.id));

  const dbRows = await db.select({ id: cards.id }).from(cards);
  const dbIds = new Set(dbRows.map((r) => r.id));

  // Check 1: Every source ID must exist in DB
  const missingFromDb: string[] = [];
  for (const id of sourceIds) {
    if (!dbIds.has(id)) {
      missingFromDb.push(id);
    }
  }

  // Check 2: Count parity
  const dbCount = dbIds.size;
  const sourceCount = sourceIds.size;

  console.log(`\nVerification:`);
  console.log(`  Source (cards.json): ${sourceCount} unique IDs`);
  console.log(`  Database:           ${dbCount} rows`);

  if (missingFromDb.length > 0) {
    console.error(
      `\nFAILED: ${missingFromDb.length} source IDs missing from database:`,
    );
    missingFromDb
      .slice(0, 10)
      .forEach((id) => console.error(`  - ${id}`));
    if (missingFromDb.length > 10) {
      console.error(`  ... and ${missingFromDb.length - 10} more`);
    }
    process.exit(1);
  }

  if (dbCount !== sourceCount) {
    // DB has extra rows (stale data from previous seeds with different source)
    const extraInDb: string[] = [];
    for (const id of dbIds) {
      if (!sourceIds.has(id)) {
        extraInDb.push(id);
      }
    }
    console.warn(
      `\nWARNING: DB has ${extraInDb.length} extra rows not in source JSON.`,
    );
    extraInDb
      .slice(0, 5)
      .forEach((id) => console.warn(`  - ${id}`));
    // This is a warning, not a failure -- extra rows may exist from prior seeds
    // A full-replace would need DELETE + INSERT, but upsert-only is correct for Phase 6
  }

  console.log(`\nSeed complete. ${sourceCount} cards verified in database.`);
}

// Only run main when executed directly (not when imported by tests)
const isDirectRun =
  process.argv[1]?.endsWith("seed.ts") ||
  process.argv[1]?.endsWith("seed.js");
if (isDirectRun) {
  seed()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
