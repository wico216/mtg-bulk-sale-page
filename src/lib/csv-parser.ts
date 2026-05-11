import Papa from "papaparse";
import { readFileSync } from "node:fs";
import { globSync } from "fast-glob";
import type { ManaboxRow, InventoryRow, Finish } from "./types";
import { normalizeBinderName } from "./binder-name";

/**
 * A row from the uploaded CSV that could not be converted to an InventoryRow.
 * Row numbers are 1-indexed where the header line is row 1 and the first data
 * row is row 2 (matches what a user sees in their spreadsheet app).
 */
export interface SkippedRow {
  rowNumber: number;
  reason: string;
  name?: string;
  setCode?: string;
  collectorNumber?: string;
  /** Optional source filename when multiple uploaded CSVs are parsed together. */
  fileName?: string;
}

/** Return shape of parseManaboxCsvContent. */
export interface ParseResult {
  cards: InventoryRow[];
  skippedRows: SkippedRow[];
  sourceFiles?: Array<{
    name: string;
    parsedCards: number;
    skippedRows: number;
  }>;
}

/**
 * Shared row -> InventoryRow mapper. Returns either an InventoryRow or a
 * SkippedRow with a concrete reason so the admin import UI (Phase 10 D-05
 * zone 3) can show per-row feedback.
 *
 * Phase 17 extensions (D-02..D-06):
 *   - Skips rows with `Quantity === 0` (reason `'zero quantity'`, D-05).
 *   - Skips rows with `Binder Type !== 'binder'` (reason `'non-binder row'`,
 *     D-04). Manabox emits lowercase; non-binder values like `'deck'` /
 *     `'list'` skip.
 *   - Reads optional `Binder Name` (defaults to `'unsorted'` via
 *     `normalizeBinderName`, D-02) and `Binder Type` (defaults to
 *     `'binder'`, D-02).
 *   - Emits `finish: Finish` (the literal Manabox value, including
 *     `'etched'` per D-01) instead of the legacy `foil: boolean`. Defensive
 *     guard maps unexpected values to `'normal'` and warns once per row
 *     so a typo / legacy CSV doesn't break the import.
 *   - Composite id is the 5-segment
 *     `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}` (D-06).
 */
function rowToCardOrSkip(
  row: ManaboxRow,
  rowNumber: number,
): { card: InventoryRow } | { skipped: SkippedRow } {
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

  // Phase 17 D-04: Skip non-binder rows (deck, list, etc.) with a named
  // reason. Default to 'binder' when the column is missing entirely (D-02
  // graceful degradation for legacy CSVs).
  const binderType = row["Binder Type"] ?? "binder";
  if (binderType !== "binder") {
    return {
      skipped: {
        rowNumber,
        reason: "non-binder row",
        name: name || undefined,
        setCode: bestEffortSetCode,
        collectorNumber: bestEffortCollectorNumber,
      },
    };
  }

  // Phase 17 D-05: Skip Quantity=0 rows (no buyer-side purpose).
  const quantity = row.Quantity ?? 0;
  if (quantity === 0) {
    return {
      skipped: {
        rowNumber,
        reason: "zero quantity",
        name: name || undefined,
        setCode: bestEffortSetCode,
        collectorNumber: bestEffortCollectorNumber,
      },
    };
  }

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

  // Phase 17 D-01: Manabox emits Foil as one of 'normal' | 'foil' | 'etched'
  // (verified against the operator's 12,749-row export, distribution
  // normal=9357 / foil=1837 / etched=11). Defensive guard: map anything
  // else (legacy CSV with unrecognized values, missing column, typo) to
  // 'normal' rather than skipping — the row still has a valid name +
  // setCode + collectorNumber + condition; mis-coded finish is a soft
  // error worth logging but not worth dropping the listing.
  const rawFoil = row.Foil;
  let finish: Finish;
  if (rawFoil === "normal" || rawFoil === "foil" || rawFoil === "etched") {
    finish = rawFoil;
  } else {
    if (rawFoil !== undefined && rawFoil !== null) {
      console.warn(
        `Row ${rowNumber}: unexpected Foil value "${String(rawFoil)}", defaulting to 'normal'`,
      );
    }
    finish = "normal";
  }

  const condition = row.Condition || "unknown";

  // Phase 17 D-02 / D-03: normalize binder name through the shared helper.
  // Empty / missing input collapses to the literal 'unsorted' default.
  const binder = normalizeBinderName(row["Binder Name"]);

  // Phase 17 D-06: 5-segment composite id (matches Phase 16 D-05).
  const card: InventoryRow = {
    id: `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}`,
    name,
    setCode,
    setName: row["Set name"] || "",
    collectorNumber,
    price: null,
    condition,
    quantity,
    colorIdentity: [],
    imageUrl: null,
    oracleText: null,
    rarity: row.Rarity || "unknown",
    finish,
    binder,
  };
  return { card };
}

/**
 * Parse a single Manabox CSV file into partial InventoryRow objects.
 * Enrichment fields (price, colorIdentity, imageUrl) are left as null/empty.
 */
function parseSingleCsv(filePath: string): InventoryRow[] {
  const content = readFileSync(filePath, "utf-8");
  const result = Papa.parse<ManaboxRow>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn(`CSV parse warnings for ${filePath}:`, result.errors);
  }

  const cards: InventoryRow[] = [];

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
 * Duplicates are identified by the composite ID (set-collector-finish-condition-binder).
 */
function mergeCards(cards: InventoryRow[]): InventoryRow[] {
  const cardMap = new Map<string, InventoryRow>();

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
 * Maps Manabox fields to InventoryRow type, merges duplicates across files.
 * Returns InventoryRow[] with null/empty enrichment fields (price, colorIdentity, imageUrl).
 */
export function parseAllCsvFiles(inventoryDir: string): InventoryRow[] {
  const csvFiles = globSync("**/*.csv", { cwd: inventoryDir, absolute: true });

  if (csvFiles.length === 0) {
    console.warn(`No CSV files found in ${inventoryDir}`);
    return [];
  }

  console.log(`Found ${csvFiles.length} CSV file(s) in ${inventoryDir}`);

  const allCards: InventoryRow[] = [];

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
export function parseManaboxCsvContent(
  content: string,
  fileName?: string,
): ParseResult {
  const result = Papa.parse<ManaboxRow>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  const cards: InventoryRow[] = [];
  const skippedRows: SkippedRow[] = [];

  result.data.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const outcome = rowToCardOrSkip(row, rowNumber);
    if ("card" in outcome) cards.push(outcome.card);
    else {
      skippedRows.push(
        fileName
          ? { ...outcome.skipped, fileName }
          : outcome.skipped,
      );
    }
  });

  // PapaParse errors that couldn't even produce a row surface as SkippedRow
  // entries too -- preserves the same row-number convention.
  for (const err of result.errors) {
    if (err.row != null) {
      skippedRows.push({
        rowNumber: err.row + 2,
        reason: `parse error: ${err.message}`,
        ...(fileName ? { fileName } : {}),
      });
    }
  }

  const merged = mergeCards(cards);
  return {
    cards: merged,
    skippedRows,
    ...(fileName
      ? {
          sourceFiles: [
            {
              name: fileName,
              parsedCards: merged.length,
              skippedRows: skippedRows.length,
            },
          ],
        }
      : {}),
  };
}

/**
 * Parse multiple uploaded Manabox CSV files as one import batch.
 *
 * Each file preserves spreadsheet-style row numbers for its own skipped rows
 * and adds fileName so the admin preview can point the seller at the exact
 * source file. Valid cards are merged across files by the same composite ID
 * used by the original build-time parser, so overlapping binders sum quantity
 * instead of creating duplicate rows.
 */
export function parseManaboxCsvContents(
  files: Array<{ fileName: string; content: string }>,
): ParseResult {
  const cards: InventoryRow[] = [];
  const skippedRows: SkippedRow[] = [];
  const sourceFiles: NonNullable<ParseResult["sourceFiles"]> = [];

  for (const file of files) {
    const parsed = parseManaboxCsvContent(file.content, file.fileName);
    cards.push(...parsed.cards);
    skippedRows.push(...parsed.skippedRows);
    sourceFiles.push({
      name: file.fileName,
      parsedCards: parsed.cards.length,
      skippedRows: parsed.skippedRows.length,
    });
  }

  return { cards: mergeCards(cards), skippedRows, sourceFiles };
}
