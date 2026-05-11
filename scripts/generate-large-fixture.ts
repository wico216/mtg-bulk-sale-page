#!/usr/bin/env tsx
/**
 * Phase 22-02 Task 1 (D-08): generate the synthetic 12,749-row Manabox CSV
 * fixture used by the parser perf pin (`src/lib/__tests__/csv-parser-perf.test.ts`).
 *
 * Why this exists:
 *   - HARD-03 pins `parseManaboxCsvContent(12_749 rows) < 2000ms` on the
 *     runner machine. The pin needs a deterministic 12,749-row CSV the test
 *     can load on every run.
 *   - We do NOT ship the operator's real Manabox export (Phase 17 D-11
 *     privacy: NEVER bundle real card data + binder names from the
 *     operator's actual collection).
 *   - This script synthesizes a CSV with the same shape (canonical Phase 17
 *     header + 5-segment binder/finish/condition distribution) but using
 *     unmistakably-fictional data: set codes like `tst`/`fix`/`syn`, names
 *     like `Test Card 1`..`Test Card 12749`, binder names `a01`..`a14` +
 *     `unsorted`.
 *
 * Determinism:
 *   - No `Math.random()`. Every field distribution is driven by simple
 *     modular arithmetic over the row index. Re-running the script
 *     produces a byte-identical file (verifiable via sha256sum).
 *   - The row count is fixed at 12,749 to mirror the operator's real export
 *     size for the perf pin.
 *
 * Output:
 *   - Writes `test-fixtures/large-export.csv` (relative to repo root).
 *   - Header line uses the canonical Phase 17 column order:
 *     `Name,Set code,Set name,Collector number,Condition,Quantity,Foil,Rarity,Binder Name,Binder Type`
 *
 * Run via:
 *   npx tsx scripts/generate-large-fixture.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROW_COUNT = 12_749;
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "test-fixtures",
  "large-export.csv",
);

// Synthetic distribution tables. Sized to be co-prime-ish with ROW_COUNT so
// modular index drives a varied but deterministic distribution.

/** Fictional set codes — unmistakably synthetic per Phase 17 D-11 privacy. */
const SET_CODES = [
  "tst",
  "fix",
  "syn",
  "fak",
  "bug",
  "lab",
  "cli",
  "dev",
  "qa1",
  "qa2",
];

/** Set names paired 1:1 with SET_CODES. */
const SET_NAMES = [
  "Test Set",
  "Fixture Set",
  "Synthetic Set",
  "Fake Set",
  "Bug Hunt",
  "Lab Set",
  "CLI Set",
  "Dev Set",
  "QA Set 1",
  "QA Set 2",
];

/** Binder names — `a01`..`a14` plus `unsorted`. */
const BINDER_NAMES = [
  "a01",
  "a02",
  "a03",
  "a04",
  "a05",
  "a06",
  "a07",
  "a08",
  "a09",
  "a10",
  "a11",
  "a12",
  "a13",
  "a14",
  "unsorted",
];

/** Conditions — Phase 16 enum. Distribution weighted via the picker function. */
const CONDITIONS = [
  "near_mint",
  "lightly_played",
  "moderately_played",
  "heavily_played",
  "damaged",
];

/** Rarities — Manabox `Rarity` enum. */
const RARITIES = ["common", "uncommon", "rare", "mythic"];

/**
 * Pick a Condition deterministically from a row index. Distribution roughly:
 *   near_mint ~50%, lightly_played ~25%, moderately_played ~15%,
 *   heavily_played ~7%, damaged ~3%. Modular arithmetic over a 100-bucket
 *   space makes the distribution byte-identical across runs.
 */
function pickCondition(idx: number): string {
  const bucket = idx % 100;
  if (bucket < 50) return "near_mint";
  if (bucket < 75) return "lightly_played";
  if (bucket < 90) return "moderately_played";
  if (bucket < 97) return "heavily_played";
  return "damaged";
}

/**
 * Pick a Foil/finish deterministically: ~94% normal, ~5% foil, ~1% etched.
 * `etched` is the Phase 17 D-01 literal — the parser must accept it.
 */
function pickFoil(idx: number): string {
  const bucket = idx % 100;
  if (bucket < 94) return "normal";
  if (bucket < 99) return "foil";
  return "etched";
}

/**
 * Pick a Rarity deterministically: ~60% common, ~25% uncommon, ~12% rare,
 * ~3% mythic.
 */
function pickRarity(idx: number): string {
  const bucket = idx % 100;
  if (bucket < 60) return "common";
  if (bucket < 85) return "uncommon";
  if (bucket < 97) return "rare";
  return "mythic";
}

/**
 * Pick a Binder Name deterministically. Most rows in `a01`..`a09`, fewer in
 * `a10`..`a14`, ~5% in `unsorted`. Mirrors a realistic friend-store binder
 * distribution where a few binders hold the bulk of the inventory.
 */
function pickBinder(idx: number): string {
  const bucket = idx % 100;
  if (bucket < 60) return BINDER_NAMES[idx % 9]; // a01..a09
  if (bucket < 95) return BINDER_NAMES[9 + (idx % 5)]; // a10..a14
  return "unsorted";
}

/** Quantity 1-4 deterministic. */
function pickQuantity(idx: number): number {
  return (idx % 4) + 1;
}

/** Set code by row index (round-robin across SET_CODES). */
function pickSetCodeIdx(idx: number): number {
  return idx % SET_CODES.length;
}

/**
 * Per-row collector number. Distinct enough across set codes that the parser
 * yields > 12,000 cards even after merging duplicates by composite id (the
 * parser merges by `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}`).
 *
 * We use `Math.floor(idx / SET_CODES.length) + 1` so each set code gets a
 * unique sequence of collector numbers (1, 2, 3, ...) starting from 1. This
 * gives 12,749 / 10 = ~1,275 unique (setCode, collectorNumber) pairs. With
 * the 5-segment composite id mixing in finish + condition + binder, the
 * total distinct ids comfortably exceed 12,000.
 */
function pickCollectorNumber(idx: number): string {
  return String(Math.floor(idx / SET_CODES.length) + 1);
}

/**
 * CSV-quote a field if it contains a comma, quote, or newline. The
 * synthetic data we generate doesn't include any of those characters, but
 * the helper is here so a future schema bump (e.g., set names with commas)
 * stays safe.
 */
function csvQuote(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildRow(idx: number): string {
  const setCodeIdx = pickSetCodeIdx(idx);
  const setCode = SET_CODES[setCodeIdx];
  const setName = SET_NAMES[setCodeIdx];
  const collectorNumber = pickCollectorNumber(idx);
  const condition = pickCondition(idx);
  const quantity = pickQuantity(idx);
  const foil = pickFoil(idx);
  const rarity = pickRarity(idx);
  const binder = pickBinder(idx);
  const name = `Test Card ${idx + 1}`;
  // Manabox emits Binder Type literally as `binder` (Phase 17 D-04: anything
  // else is skipped as a non-binder row).
  const binderType = "binder";

  return [
    csvQuote(name),
    csvQuote(setCode),
    csvQuote(setName),
    csvQuote(collectorNumber),
    csvQuote(condition),
    String(quantity),
    csvQuote(foil),
    csvQuote(rarity),
    csvQuote(binder),
    csvQuote(binderType),
  ].join(",");
}

function main(): void {
  // Canonical Phase 17 header order (matches src/lib/csv-parser.ts and
  // src/lib/__tests__/csv-parser-content.test.ts:14-37 base + binder
  // columns).
  const header = [
    "Name",
    "Set code",
    "Set name",
    "Collector number",
    "Condition",
    "Quantity",
    "Foil",
    "Rarity",
    "Binder Name",
    "Binder Type",
  ].join(",");

  const lines: string[] = [header];
  for (let i = 0; i < ROW_COUNT; i++) {
    lines.push(buildRow(i));
  }

  // Trailing newline matches the Manabox export shape (last row terminated
  // by newline, not bare). Papa.parse handles both, but we standardize for
  // determinism.
  const content = lines.join("\n") + "\n";

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, content, "utf-8");

  // eslint-disable-next-line no-console
  console.log(
    `[generate-large-fixture] wrote ${ROW_COUNT} rows + 1 header to ${OUTPUT_PATH}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[generate-large-fixture] file size: ${(content.length / 1024).toFixed(1)} KB`,
  );
}

main();
