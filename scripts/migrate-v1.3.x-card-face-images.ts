#!/usr/bin/env tsx
/**
 * Quick task 260514-ewz: cards.back_image_url for double-faced cards.
 *
 * Adds a nullable back_image_url column and backfills existing double-faced
 * inventory rows from Scryfall card_faces[1].image_uris.normal. Idempotent:
 * safe to re-run, only updates rows where back_image_url is still NULL.
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

interface FaceImageCandidateRow {
  id: string;
  set_code: string;
  collector_number: string;
  scryfall_id: string | null;
}

export interface PreflightSnapshot {
  backImageColumnPresent: boolean;
  typeLineColumnPresent: boolean;
  cardsRowCountBefore: number;
  missingBackImagesBefore: number | null;
  capturedAt: string;
}

export interface MigrationSummary extends PreflightSnapshot {
  dryRun: boolean;
  columnPresentAfter: boolean;
  cardsRowCountAfter: number;
  missingBackImagesAfter: number | null;
  rowsScanned: number;
  rowsUpdated: number;
  rowsWithoutBackImage: number;
}

function getBackImageUrl(card: ScryfallCard): string | null {
  return card.card_faces?.[1]?.image_uris?.normal ?? null;
}

async function countMissingBackImages(args: {
  db: MigrationDb;
  typeLineColumnPresent: boolean;
}): Promise<number> {
  const { db, typeLineColumnPresent } = args;
  if (typeLineColumnPresent) {
    const result = (await db.execute(sql`
      SELECT COUNT(*)::int AS c
      FROM cards
      WHERE back_image_url IS NULL
        AND type_line LIKE '%//%'
    `)) as { rows: Array<{ c: number }> };
    return result.rows[0]?.c ?? 0;
  }

  const result = (await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM cards
    WHERE back_image_url IS NULL
  `)) as { rows: Array<{ c: number }> };
  return result.rows[0]?.c ?? 0;
}

export async function runPreflights(args: {
  db: MigrationDb;
}): Promise<PreflightSnapshot> {
  const { db } = args;

  const colResult = (await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'cards'
      AND column_name IN ('back_image_url', 'type_line')
  `)) as unknown as { rows: ColumnRow[] };
  const present = new Set(colResult.rows.map((row) => row.column_name));

  const countResult = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM cards`,
  )) as { rows: Array<{ c: number }> };

  let missingBackImagesBefore: number | null = null;
  if (present.has("back_image_url")) {
    missingBackImagesBefore = await countMissingBackImages({
      db,
      typeLineColumnPresent: present.has("type_line"),
    });
  }

  return {
    backImageColumnPresent: present.has("back_image_url"),
    typeLineColumnPresent: present.has("type_line"),
    cardsRowCountBefore: countResult.rows[0]?.c ?? 0,
    missingBackImagesBefore,
    capturedAt: new Date().toISOString(),
  };
}

export async function applyColumn(args: { db: MigrationDb }): Promise<void> {
  const { db } = args;
  await db.execute(sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS back_image_url TEXT`);
}

async function getRowsMissingBackImage(args: {
  db: MigrationDb;
  typeLineColumnPresent: boolean;
}): Promise<FaceImageCandidateRow[]> {
  const { db, typeLineColumnPresent } = args;
  if (typeLineColumnPresent) {
    const result = (await db.execute(sql`
      SELECT id, set_code, collector_number, scryfall_id
      FROM cards
      WHERE back_image_url IS NULL
        AND type_line LIKE '%//%'
      ORDER BY name ASC, set_code ASC, collector_number ASC, id ASC
    `)) as unknown as { rows: FaceImageCandidateRow[] };
    return result.rows;
  }

  const result = (await db.execute(sql`
    SELECT id, set_code, collector_number, scryfall_id
    FROM cards
    WHERE back_image_url IS NULL
    ORDER BY name ASC, set_code ASC, collector_number ASC, id ASC
  `)) as unknown as { rows: FaceImageCandidateRow[] };
  return result.rows;
}

export async function backfillBackImages(args: {
  db: MigrationDb;
  typeLineColumnPresent: boolean;
}): Promise<{
  rowsScanned: number;
  rowsUpdated: number;
  rowsWithoutBackImage: number;
}> {
  const { db, typeLineColumnPresent } = args;
  const rows = await getRowsMissingBackImage({ db, typeLineColumnPresent });
  if (rows.length === 0) {
    return { rowsScanned: 0, rowsUpdated: 0, rowsWithoutBackImage: 0 };
  }

  const ids = rows
    .map((row) => row.scryfall_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const batchMap = await fetchCardsByScryfallIds(ids);

  let rowsUpdated = 0;
  let rowsWithoutBackImage = 0;

  for (const row of rows) {
    const scryfallCard =
      row.scryfall_id && batchMap.has(row.scryfall_id)
        ? batchMap.get(row.scryfall_id)!
        : await fetchCard(row.set_code, row.collector_number);

    if (!scryfallCard) {
      rowsWithoutBackImage++;
      continue;
    }

    const backImageUrl = getBackImageUrl(scryfallCard);
    if (!backImageUrl) {
      rowsWithoutBackImage++;
      continue;
    }

    await db.execute(sql`
      UPDATE cards
      SET back_image_url = ${backImageUrl}
      WHERE id = ${row.id}
    `);
    rowsUpdated++;
  }

  return { rowsScanned: rows.length, rowsUpdated, rowsWithoutBackImage };
}

export async function measurePostState(args: {
  db: MigrationDb;
  preSnapshot: PreflightSnapshot;
  dryRun: boolean;
  backfill?: {
    rowsScanned: number;
    rowsUpdated: number;
    rowsWithoutBackImage: number;
  };
}): Promise<MigrationSummary> {
  const { db, preSnapshot, dryRun, backfill } = args;

  if (dryRun) {
    return {
      ...preSnapshot,
      dryRun: true,
      columnPresentAfter: preSnapshot.backImageColumnPresent,
      cardsRowCountAfter: preSnapshot.cardsRowCountBefore,
      missingBackImagesAfter: preSnapshot.missingBackImagesBefore,
      rowsScanned: 0,
      rowsUpdated: 0,
      rowsWithoutBackImage: 0,
    };
  }

  const colResult = (await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'cards'
      AND column_name IN ('back_image_url', 'type_line')
  `)) as unknown as { rows: ColumnRow[] };
  const present = new Set(colResult.rows.map((row) => row.column_name));

  const countResult = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM cards`,
  )) as { rows: Array<{ c: number }> };

  const columnPresentAfter = present.has("back_image_url");
  const missingBackImagesAfter = columnPresentAfter
    ? await countMissingBackImages({
        db,
        typeLineColumnPresent: present.has("type_line"),
      })
    : null;

  return {
    ...preSnapshot,
    dryRun: false,
    columnPresentAfter,
    typeLineColumnPresent: present.has("type_line"),
    cardsRowCountAfter: countResult.rows[0]?.c ?? 0,
    missingBackImagesAfter,
    rowsScanned: backfill?.rowsScanned ?? 0,
    rowsUpdated: backfill?.rowsUpdated ?? 0,
    rowsWithoutBackImage: backfill?.rowsWithoutBackImage ?? 0,
  };
}

export function formatSummary(summary: MigrationSummary): string {
  const lines: string[] = [];
  lines.push(
    summary.dryRun
      ? "DRY RUN — no DDL, DML, or Scryfall backfill executed"
      : "Migration v1.3.x (card face images) complete",
  );
  lines.push("");
  lines.push("Schema:");
  lines.push(
    `  - cards.back_image_url: ${
      summary.backImageColumnPresent
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
    `  - candidate rows missing back image before: ${
      summary.missingBackImagesBefore == null
        ? "unknown (column absent)"
        : summary.missingBackImagesBefore
    }`,
  );
  lines.push(
    `  - candidate rows missing back image after: ${
      summary.missingBackImagesAfter == null
        ? "unknown (dry-run with column absent)"
        : summary.missingBackImagesAfter
    }`,
  );
  lines.push(`  - backfill rows scanned: ${summary.rowsScanned}`);
  lines.push(`  - backfill rows updated: ${summary.rowsUpdated}`);
  lines.push(`  - rows without second-face image: ${summary.rowsWithoutBackImage}`);
  lines.push("");
  lines.push(`Pre-state captured at: ${summary.capturedAt}`);
  lines.push("");
  lines.push("Next: deploy app code that reads cards.back_image_url.");
  return lines.join("\n");
}

const HELP = `\
Usage: npm run migrate:card-faces [-- --dry-run] [-- --help]

DESCRIPTION
  Adds nullable cards.back_image_url and backfills double-faced card rows from
  Scryfall card_faces[1].image_uris.normal. Idempotent and safe to re-run.

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
      ? "[migrate:card-faces] DRY RUN — pre-flight check only."
      : "[migrate:card-faces] LIVE RUN — add column, then backfill second-face images.",
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
    console.log("\n[migrate:card-faces] Statements that WOULD execute:");
    if (!preSnapshot.backImageColumnPresent) {
      console.log("  1. ALTER TABLE cards ADD COLUMN IF NOT EXISTS back_image_url TEXT");
    }
    console.log("  2. Backfill missing back_image_url values from Scryfall");
    const summary = await measurePostState({ db, preSnapshot, dryRun: true });
    console.log("\n" + formatSummary(summary));
    return 0;
  }

  try {
    await applyColumn({ db });
    const backfill = await backfillBackImages({
      db,
      typeLineColumnPresent: preSnapshot.typeLineColumnPresent,
    });
    const summary = await measurePostState({
      db,
      preSnapshot,
      dryRun: false,
      backfill,
    });
    console.log("\n" + formatSummary(summary));
    return 0;
  } catch (error) {
    console.error(`\n[migrate:card-faces] FAILED: ${(error as Error).message}`);
    console.error(
      "\nColumns may already have been added before failure. Re-run the script after resolving the error; it only updates rows still missing back_image_url.",
    );
    return 1;
  }
}

const isDirectRun =
  process.argv[1]?.endsWith("migrate-v1.3.x-card-face-images.ts") ||
  process.argv[1]?.endsWith("migrate-v1.3.x-card-face-images.js");
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Unexpected error: ${(err as Error).message}`);
      process.exit(1);
    });
}
