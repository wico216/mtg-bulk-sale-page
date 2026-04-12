import { drizzle } from "drizzle-orm/neon-http";
import { config } from "dotenv";
import { count } from "drizzle-orm";
import { cards } from "./schema";
import type { Card } from "@/lib/types";

config({ path: ".env.local" });

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

  // Phase 7 migration note: This seed script originally read from data/generated/cards.json
  // which was produced by scripts/generate-data.ts. Both have been deleted as the storefront
  // now reads directly from the database.
  //
  // The database was seeded during Phase 6 and contains the full inventory.
  // Future inventory updates will be done via Phase 10 (CSV Import in admin panel).
  //
  // To re-seed from scratch, restore a database backup or wait for Phase 10 CSV import.
  console.log("NOTE: seed.ts is a Phase 6 artifact. The database is already populated.");
  console.log("Future inventory management will use the admin panel (Phase 10 CSV Import).");
  console.log("");
  console.log("If you need to verify the current DB state:");
  console.log("  npx drizzle-kit studio");
  console.log("");

  // Verify DB is accessible and has data
  const [result] = await db
    .select({ totalCards: count() })
    .from(cards);

  console.log(`Database contains ${result.totalCards} cards.`);

  if (result.totalCards === 0) {
    console.warn("WARNING: Database has 0 cards. You may need to restore from backup.");
    console.warn("The original seed source (data/generated/cards.json) has been removed.");
  }
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
