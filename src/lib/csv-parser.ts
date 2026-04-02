import Papa from "papaparse";
import { readFileSync } from "node:fs";
import { globSync } from "fast-glob";
import type { ManaboxRow, Card } from "./types";

/**
 * Parse a single Manabox CSV file into partial Card objects.
 * Enrichment fields (price, colorIdentity, imageUrl) are left as null/empty.
 */
function parseSingleCsv(filePath: string): Card[] {
  const content = readFileSync(filePath, "utf-8");
  const result = Papa.parse<ManaboxRow>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn(`CSV parse warnings for ${filePath}:`, result.errors);
  }

  const cards: Card[] = [];

  for (const row of result.data) {
    // Skip rows missing required fields
    if (!row.Name || !row["Set code"] || !row["Collector number"]) {
      continue;
    }

    const setCode = row["Set code"].toLowerCase();
    const collectorNumber = String(row["Collector number"]);
    const foil = row.Foil === "foil";
    const condition = row.Condition || "unknown";

    cards.push({
      id: `${setCode}-${collectorNumber}-${foil ? "foil" : "normal"}-${condition}`,
      name: row.Name,
      setCode,
      setName: row["Set name"] || "",
      collectorNumber,
      price: null,
      condition,
      quantity: row.Quantity ?? 1,
      colorIdentity: [],
      imageUrl: null,
      oracleText: null,
      rarity: row.Rarity || "unknown",
      foil,
    });
  }

  return cards;
}

/**
 * Merge duplicate cards by summing quantities.
 * Duplicates are identified by the composite ID (set-collector-foil-condition).
 */
function mergeCards(cards: Card[]): Card[] {
  const cardMap = new Map<string, Card>();

  for (const card of cards) {
    const existing = cardMap.get(card.id);
    if (existing) {
      existing.quantity += card.quantity;
    } else {
      cardMap.set(card.id, { ...card });
    }
  }

  return Array.from(cardMap.values());
}

/**
 * Parse all CSV files from the given inventory directory.
 * Maps Manabox fields to Card type, merges duplicates across files.
 * Returns Card[] with null/empty enrichment fields (price, colorIdentity, imageUrl).
 */
export function parseAllCsvFiles(inventoryDir: string): Card[] {
  const csvFiles = globSync("**/*.csv", { cwd: inventoryDir, absolute: true });

  if (csvFiles.length === 0) {
    console.warn(`No CSV files found in ${inventoryDir}`);
    return [];
  }

  console.log(`Found ${csvFiles.length} CSV file(s) in ${inventoryDir}`);

  const allCards: Card[] = [];

  for (const csvFile of csvFiles) {
    const cards = parseSingleCsv(csvFile);
    console.log(`  Parsed ${cards.length} cards from ${csvFile}`);
    allCards.push(...cards);
  }

  const merged = mergeCards(allCards);
  console.log(`Total: ${allCards.length} raw cards, ${merged.length} after deduplication`);

  return merged;
}
