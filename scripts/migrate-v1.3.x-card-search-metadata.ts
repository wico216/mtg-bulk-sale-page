#!/usr/bin/env tsx
/**
 * Quick task 260514-afo: cards.type_line + cards.mana_value metadata.
 *
 * Adds nullable Scryfall metadata columns used by storefront type filters and
 * Scryfall-style search syntax, then backfills existing rows from Scryfall.
 *
 * EXECUTION MODEL — MANUAL ONLY
 *   1. `npm run migrate:card-search:dry-run` against a Neon branch first
 *   2. Review the dry-run summary
 *   3. `npm run migrate:card-search` against the production DATABASE_URL
 *   4. Deploy app code that reads the new columns
 *
 * IDEMPOTENCY
 *   Uses ADD COLUMN IF NOT EXISTS and only backfills rows where either
 *   metadata field is still NULL. Safe to re-run.
 */

import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { config } from "dotenv";
import type { ScryfallCard } from "@/lib/types";
import { fetchCard, fetchCardsByScryfallIds } from "@/lib/scryfall";

config({ path: ".env.local" });

export interface MigrationDb {
  execute: NeonHttpDatabase<Record<string, never>>["execute"];
}

interface ColumnRow {
  column_name: string;
}

interface MissingMetadataRow {
  id: string;
  set_code: string;
  collector_number: string;
  scryfall_id: string | null;
}

export interface PreflightSnapshot {
  typeLineColumnPresent: boolean;
  manaValueColumnPresent: boolean;
  cardsRowCountBefore: number;
  missingMetadataBefore: number | null;
  capturedAt: string;
}

export interface MigrationSummary extends PreflightSnapshot {
  dryRun: boolean;
  columnsPresentAfter: boolean;
  cardsRowCountAfter: number;
  missingMetadataAfter: number | null;
  rowsScanned: number;
  rowsUpdated: number;
  rowsUnresolved: number;
}

function getTypeLine(card: ScryfallCard): string | null {
  if (card.type_line) return card.type_line;
  const typeLines =
    card.card_faces
      ?.map((face) => face.type_line)
      .filter((typeLine): typeLine is string => !!typeLine) ?? [];
  return typeLines.length > 0 ? typeLines.join(" // ") : null;
}

function getManaValue(card: ScryfallCard): number | null {
  return typeof card.cmc === "number" ? card.cmc : null;
}

export async function runPreflights(args: {
  db: MigrationDb;
}): Promise<PreflightSnapshot> {
  const { db } = args;

  const colResult = (await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'cards'
      AND column_name IN ('type_line', 'mana_value')
  `)) as unknown as { rows: ColumnRow[] };

  const present = new Set(colResult.rows.map((row) => row.column_name));

  const countResult = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM cards`,
  )) as { rows: Array<{ c: number }> };

  const bothColumnsPresent = present.has("type_line") && present.has("mana_value");
  let missingMetadataBefore: number | null = null;
  if (bothColumnsPresent) {
    const missingResult = (await db.execute(sql`
      SELECT COUNT(*)::int AS c
      FROM cards
      WHERE type_line IS NULL OR mana_value IS NULL
    `)) as { rows: Array<{ c: number }> };
    missingMetadataBefore = missingResult.rows[0]?.c ?? 0;
  }

  return {
    typeLineColumnPresent: present.has("type_line"),
    manaValueColumnPresent: present.has("mana_value"),
    cardsRowCountBefore: countResult.rows[0]?.c ?? 0,
    missingMetadataBefore,
    capturedAt: new Date().toISOString(),
  };
}

export async function applyColumns(args: { db: MigrationDb }): Promise<void> {
  const { db } = args;
  await db.execute(sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS type_line TEXT`);
  await db.execute(sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS mana_value REAL`);
}

async function getRowsMissingMetadata(db: MigrationDb): Promise<MissingMetadataRow[]> {
  const result = (await db.execute(sql`
    SELECT id, set_code, collector_number, scryfall_id
    FROM cards
    WHERE type_line IS NULL OR mana_value IS NULL
    ORDER BY name ASC, set_code ASC, collector_number ASC, id ASC
  `)) as unknown as { rows: MissingMetadataRow[] };
  return result.rows;
}

export async function backfillMetadata(args: {
  db: MigrationDb;
}): Promise<{ rowsScanned: number; rowsUpdated: number; rowsUnresolved: number }> {
  const { db } = args;
  const rows = await getRowsMissingMetadata(db);
  if (rows.length === 0) {
    return { rowsScanned: 0, rowsUpdated: 0, rowsUnresolved: 0 };
  }

  const ids = rows
    .map((row) => row.scryfall_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const batchMap = await fetchCardsByScryfallIds(ids);

  let rowsUpdated = 0;
  let rowsUnresolved = 0;

  for (const row of rows) {
    const scryfallCard =
      row.scryfall_id && batchMap.has(row.scryfall_id)
        ? batchMap.get(row.scryfall_id)!
        : await fetchCard(row.set_code, row.collector_number);

    if (!scryfallCard) {
      rowsUnresolved++;
      continue;
    }

    const typeLine = getTypeLine(scryfallCard);
    const manaValue = getManaValue(scryfallCard);
    if (typeLine == null && manaValue == null) {
      rowsUnresolved++;
      continue;
    }

    await db.execute(sql`
      UPDATE cards
      SET type_line = ${typeLine}, mana_value = ${manaValue}
      WHERE id = ${row.id}
    `);
    rowsUpdated++;
  }

  return { rowsScanned: rows.length, rowsUpdated, rowsUnresolved };
}

export async function measurePostState(args: {
  db: MigrationDb;
  preSnapshot: PreflightSnapshot;
  dryRun: boolean;
  backfill?: { rowsScanned: number; rowsUpdated: number; rowsUnresolved: number };
}): Promise<MigrationSummary> {
  const { db, preSnapshot, dryRun, backfill } = args;

  if (dryRun) {
    return {
      ...preSnapshot,
      dryRun: true,
      columnsPresentAfter:
        preSnapshot.typeLineColumnPresent && preSnapshot.manaValueColumnPresent,
      cardsRowCountAfter: preSnapshot.cardsRowCountBefore,
      missingMetadataAfter: preSnapshot.missingMetadataBefore,
      rowsScanned: 0,
      rowsUpdated: 0,
      rowsUnresolved: 0,
    };
  }

  const colResult = (await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'cards'
      AND column_name IN ('type_line', 'mana_value')
  `)) as unknown as { rows: ColumnRow[] };
  const present = new Set(colResult.rows.map((row) => row.column_name));

  const countResult = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM cards`,
  )) as { rows: Array<{ c: number }> };
  const missingResult = (await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM cards
    WHERE type_line IS NULL OR mana_value IS NULL
  `)) as { rows: Array<{ c: number }> };

  return {
    ...preSnapshot,
    dryRun: false,
    columnsPresentAfter: present.has("type_line") && present.has("mana_value"),
    cardsRowCountAfter: countResult.rows[0]?.c ?? 0,
    missingMetadataAfter: missingResult.rows[0]?.c ?? 0,
    rowsScanned: backfill?.rowsScanned ?? 0,
    rowsUpdated: backfill?.rowsUpdated ?? 0,
    rowsUnresolved: backfill?.rowsUnresolved ?? 0,
  };
}

export function formatSummary(summary: MigrationSummary): string {
  const lines: string[] = [];
  lines.push(
    summary.dryRun
      ? "DRY RUN — no DDL, DML, or Scryfall backfill executed"
      : "Migration v1.3.x (card search metadata) complete",
  );
  lines.push("");
  lines.push("Schema:");
  lines.push(
    `  - cards.type_line: ${
      summary.typeLineColumnPresent
        ? "already present"
        : summary.dryRun
          ? "would add"
          : "added or already present"
    }`,
  );
  lines.push(
    `  - cards.mana_value: ${
      summary.manaValueColumnPresent
        ? "already present"
        : summary.dryRun
          ? "would add"
          : "added or already present"
    }`,
  );
  lines.push("");
  lines.push("Data:");
  lines.push(`  - cards rows: ${summary.cardsRowCountBefore} -> ${summary.cardsRowCountAfter}`);
  lines.push(
    `  - missing metadata before: ${
      summary.missingMetadataBefore == null
        ? "unknown (columns absent)"
        : summary.missingMetadataBefore
    }`,
  );
  lines.push(
    `  - missing metadata after: ${
      summary.missingMetadataAfter == null
        ? "unknown (dry-run with columns absent)"
        : summary.missingMetadataAfter
    }`,
  );
  lines.push(`  - backfill rows scanned: ${summary.rowsScanned}`);
  lines.push(`  - backfill rows updated: ${summary.rowsUpdated}`);
  lines.push(`  - unresolved Scryfall rows: ${summary.rowsUnresolved}`);
  lines.push("");
  lines.push(`Pre-state captured at: ${summary.capturedAt}`);
  lines.push("");
  lines.push("Next: deploy app code that reads cards.type_line and cards.mana_value.");
  return lines.join("\n");
}

const HELP = `\
Usage: npm run migrate:card-search [-- --dry-run] [-- --help]

DESCRIPTION
  Adds nullable cards.type_line and cards.mana_value columns, then backfills
  missing metadata from Scryfall for storefront type filters and Scryfall-style
  search syntax. Idempotent and safe to re-run.

FLAGS
  --dry-run     Run read-only pre-flight checks and print the would-be work.
                Does not execute DDL, DML, or Scryfall network backfill.
  -h, --help    Print this help and exit.

WARNING
  Live mode writes to the database pointed at by DATABASE_URL and calls
  Scryfall. Confirm the target environment before running without --dry-run.
`;

function parseArgs(argv: readonly string[]): { dryRun: boolean; help: boolean } {
  let dryRun = false;
  let help = false;
  for (const arg of argv) {
    switch (arg) {
      case "--dry-run":
        dryRun = true;
        break;
      case "-h":
      case "--help":
        help = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }
  return { dryRun, help };
}

export async function main(args?: {
  argv?: readonly string[];
  db?: MigrationDb;
}): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(args?.argv ?? process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}\n`);
    console.error(HELP);
    return 1;
  }

  if (parsed.help) {
    console.log(HELP);
    return 0;
  }

  let db: MigrationDb;
  if (args?.db) {
    db = args.db;
  } else {
    if (!process.env.DATABASE_URL) {
      console.error(
        "Error: DATABASE_URL is not set. Source .env.local or export it before running.",
      );
      return 1;
    }
    const { db: realDb } = await import("../src/db/client.js").catch(() =>
      import("../src/db/client"),
    );
    db = realDb;
  }

  console.log(
    parsed.dryRun
      ? "[migrate:card-search] DRY RUN — pre-flight check only."
      : "[migrate:card-search] LIVE RUN — add columns, then backfill Scryfall metadata.",
  );

  let preSnapshot: PreflightSnapshot;
  try {
    preSnapshot = await runPreflights({ db });
  } catch (error) {
    console.error(`\n${(error as Error).message}`);
    console.error("\nFAIL — zero changes applied (pre-flight rejected).");
    return 1;
  }

  if (parsed.dryRun) {
    console.log("\n[migrate:card-search] Statements that WOULD execute:");
    if (!preSnapshot.typeLineColumnPresent) {
      console.log("  1. ALTER TABLE cards ADD COLUMN IF NOT EXISTS type_line TEXT");
    }
    if (!preSnapshot.manaValueColumnPresent) {
      console.log("  2. ALTER TABLE cards ADD COLUMN IF NOT EXISTS mana_value REAL");
    }
    console.log("  3. Backfill missing type_line / mana_value from Scryfall");
    const summary = await measurePostState({ db, preSnapshot, dryRun: true });
    console.log("\n" + formatSummary(summary));
    return 0;
  }

  try {
    await applyColumns({ db });
    const backfill = await backfillMetadata({ db });
    const summary = await measurePostState({
      db,
      preSnapshot,
      dryRun: false,
      backfill,
    });
    console.log("\n" + formatSummary(summary));
    return 0;
  } catch (error) {
    console.error(`\n[migrate:card-search] FAILED: ${(error as Error).message}`);
    console.error(
      "\nColumns may already have been added before failure. Re-run the script after resolving the error; it only backfills rows still missing metadata.",
    );
    return 1;
  }
}

const isDirectRun =
  process.argv[1]?.endsWith("migrate-v1.3.x-card-search-metadata.ts") ||
  process.argv[1]?.endsWith("migrate-v1.3.x-card-search-metadata.js");
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Unexpected error: ${(err as Error).message}`);
      process.exit(1);
    });
}
