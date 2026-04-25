import Papa from "papaparse";
import { readFileSync } from "node:fs";
import { globSync } from "fast-glob";
import type { ManaboxRow, Card } from "./types";

/**
 * A row from the uploaded CSV that could not be converted to a Card.
 * Row numbers are 1-indexed where the header line is row 1 and the first data
 * row is row 2 (matches what a user sees in their spreadsheet app).
 */
export interface SkippedRow {
  rowNumber: number;
  reason: string;
  name?: string;
  setCode?: string;
  collectorNumber?: string;
  /** Source CSV filename (only set when produced by parseManaboxCsvFiles). */
  filename?: string;
}

/** Return shape of parseManaboxCsvContent. */
export interface ParseResult {
  cards: Card[];
  skippedRows: SkippedRow[];
}

/**
 * Shared row -> Card mapper. Returns either a Card or a SkippedRow with a
 * concrete reason so the admin import UI (Phase 10 D-05 zone 3) can show
 * per-row feedback.
 */
function rowToCardOrSkip(
  row: ManaboxRow,
  rowNumber: number,
): { card: Card } | { skipped: SkippedRow } {
  const rawSetCode = row["Set code"];
  const rawCollectorNumber = row["Collector number"];
  const name = row.Name;

  const bestEffortSetCode =
    rawSetCode != null && rawSetCode !== ""
      ? String(rawSetCode).toLowerCase()
      : undefined;
  const bestEffortCollectorNumber =
    rawCollectorNumber != null && rawCollectorNumber !== ""
      ? String(rawCollectorNumber)
      : undefined;

  if (!name) {
    return {
      skipped: {
        rowNumber,
        reason: "missing Name",
        setCode: bestEffortSetCode,
        collectorNumber: bestEffortCollectorNumber,
      },
    };
  }
  if (rawSetCode == null || rawSetCode === "") {
    return {
      skipped: {
        rowNumber,
        reason: "missing Set code",
        name,
        collectorNumber: bestEffortCollectorNumber,
      },
    };
  }
  if (rawCollectorNumber == null || rawCollectorNumber === "") {
    return {
      skipped: {
        rowNumber,
        reason: "missing Collector number",
        name,
        setCode: bestEffortSetCode,
      },
    };
  }

  const setCode = String(rawSetCode).toLowerCase();
  const collectorNumber = String(rawCollectorNumber);
  const foil = row.Foil === "foil";
  const condition = row.Condition || "unknown";

  const card: Card = {
    id: `${setCode}-${collectorNumber}-${foil ? "foil" : "normal"}-${condition}`,
    name,
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
  };
  return { card };
}

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
    // Skip rows missing required fields (filesystem path preserves silent-skip
    // behavior; the uploaded-content path uses parseManaboxCsvContent which
    // records SkippedRow entries).
    const outcome = rowToCardOrSkip(row, 0);
    if ("card" in outcome) cards.push(outcome.card);
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

/**
 * Parse Manabox CSV content from a string (used by the admin import Route
 * Handler, Phase 10). Unlike parseAllCsvFiles, this function RECORDS each
 * skipped row with a 1-indexed row number (header = row 1, first data row =
 * row 2) and a concrete reason so the preview UI can display per-row feedback.
 */
export function parseManaboxCsvContent(content: string): ParseResult {
  const result = Papa.parse<ManaboxRow>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const cards: Card[] = [];
  const skippedRows: SkippedRow[] = [];

  result.data.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const outcome = rowToCardOrSkip(row, rowNumber);
    if ("card" in outcome) cards.push(outcome.card);
    else skippedRows.push(outcome.skipped);
  });

  // PapaParse errors that couldn't even produce a row surface as SkippedRow
  // entries too -- preserves the same row-number convention.
  for (const err of result.errors) {
    if (err.row != null) {
      skippedRows.push({
        rowNumber: err.row + 2,
        reason: `parse error: ${err.message}`,
      });
    }
  }

  const merged = mergeCards(cards);
  return { cards: merged, skippedRows };
}

/**
 * Parse multiple Manabox CSV files in one pass (Phase 10.1 D-01..D-03 multi-CSV import).
 *
 * Each file is parsed independently with the same row-by-row logic as
 * parseManaboxCsvContent. Skipped rows are tagged with the source `filename`
 * so the preview UI (D-08) can show provenance per row. The returned cards[]
 * is concatenated from all files and then run through the existing mergeCards
 * dedup, so cross-file duplicates with the same composite ID
 * (setCode-collectorNumber-foil-condition) sum their quantities — friend
 * uploading "Binder 1.csv" with 1x Counterspell NM and "Binder 2.csv" with
 * 2x Counterspell NM ends up with 3x in the merged inventory.
 */
export function parseManaboxCsvFiles(
  files: { filename: string; content: string }[],
): ParseResult {
  const allCards: Card[] = [];
  const allSkipped: SkippedRow[] = [];

  for (const { filename, content } of files) {
    const result = Papa.parse<ManaboxRow>(content, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });

    result.data.forEach((row, index) => {
      const rowNumber = index + 2; // header is row 1 within this file
      const outcome = rowToCardOrSkip(row, rowNumber);
      if ("card" in outcome) {
        allCards.push(outcome.card);
      } else {
        allSkipped.push({ ...outcome.skipped, filename });
      }
    });

    for (const err of result.errors) {
      if (err.row != null) {
        allSkipped.push({
          rowNumber: err.row + 2,
          reason: `parse error: ${err.message}`,
          filename,
        });
      }
    }
  }

  // Cross-file merge: same composite ID across files sums quantities (D-03).
  // mergeCards already implements this via Map<id, Card> with `existing.quantity += card.quantity`.
  const merged = mergeCards(allCards);
  return { cards: merged, skippedRows: allSkipped };
}
