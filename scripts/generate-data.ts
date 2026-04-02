import { parseAllCsvFiles } from "../src/lib/csv-parser";
import { enrichCards } from "../src/lib/enrichment";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { CardData } from "../src/lib/types";
import { resolve } from "node:path";

async function main() {
  const projectRoot = process.cwd();
  const inventoryDir = resolve(projectRoot, "data/inventory");
  const outputDir = resolve(projectRoot, "data/generated");
  const outputFile = resolve(outputDir, "cards.json");

  // Step 1: Parse all CSV files
  const rawCards = parseAllCsvFiles(inventoryDir);
  console.log(`Found ${rawCards.length} cards from CSV files`);

  // Step 2: Enrich with Scryfall data
  const { cards, stats } = await enrichCards(rawCards);

  // Step 3: Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Step 4: Build CardData object
  const data: CardData = {
    cards,
    meta: {
      lastUpdated: new Date().toISOString(),
      totalCards: cards.length,
      totalSkipped: stats.skipped,
      totalMissingPrices: stats.missingPrices,
    },
  };

  // Step 5: Write output
  writeFileSync(outputFile, JSON.stringify(data, null, 2));

  // Step 6: Print summary
  console.log(
    `Processed ${stats.processed} cards, ${stats.skipped} skipped (no match), ${stats.missingPrices} missing prices`
  );
  console.log(`Output: data/generated/cards.json (${cards.length} cards)`);
}

main().catch((err) => {
  console.error("Data generation failed:", err);
  process.exit(1);
});
