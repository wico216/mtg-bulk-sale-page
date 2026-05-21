#!/usr/bin/env tsx
/**
 * Add cards.mana_cost — single-statement, idempotent migration.
 *
 *   ALTER TABLE cards ADD COLUMN mana_cost TEXT
 *
 * NULLABLE, no DEFAULT — Postgres treats this as a metadata-only operation
 * on existing rows (no row rewrite, instant on the 2353-row prod table).
 *
 * Pairs with:
 *   - src/db/schema.ts            adds the column to the Drizzle schema
 *   - src/lib/types.ts            adds manaCost?: string to InventoryRow
 *   - src/lib/enrichment.ts       populates card.manaCost from Scryfall
 *   - src/db/seed.ts cardToRow    forwards card.manaCost to inserts
 *   - scripts/backfill-mana-cost.ts  separately populates existing rows
 *
 * EXECUTION
 *   npm run migrate:mana-cost:dry-run   (pre-flight + would-be statement)
 *   npm run migrate:mana-cost           (live, against DATABASE_URL)
 *
 * IDEMPOTENCY
 *   Pre-flight reads information_schema.columns; if cards.mana_cost is
 *   already present the script logs "no-op" and exits 0 without DDL.
 *
 * ROLLBACK
 *   Leave the column in place; app code treats it as optional + nullable.
 *   If you must drop:  ALTER TABLE cards DROP COLUMN mana_cost
 */

import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

interface MigrationDb {
  execute: NeonHttpDatabase<Record<string, never>>["execute"];
}

interface ColumnPresenceRow extends Record<string, unknown> {
  column_name: string;
}

interface CountRow extends Record<string, unknown> {
  c: number;
}

function parseArgs(argv: readonly string[]): { dryRun: boolean; help: boolean } {
  let dryRun = false;
  let help = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "-h" || arg === "--help") help = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
  }
  return { dryRun, help };
}

async function columnExists(db: MigrationDb): Promise<boolean> {
  const result = (await db.execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'mana_cost'`,
  )) as { rows: ColumnPresenceRow[] };
  return (result.rows ?? []).length > 0;
}

async function countCards(db: MigrationDb): Promise<number> {
  const result = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM cards`,
  )) as { rows: CountRow[] };
  return result.rows?.[0]?.c ?? 0;
}

async function applyMigration(db: MigrationDb): Promise<void> {
  await db.execute(sql`ALTER TABLE cards ADD COLUMN mana_cost TEXT`);
}

export async function main(args?: { argv?: readonly string[]; db?: MigrationDb }): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(args?.argv ?? process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    return 1;
  }

  if (parsed.help) {
    console.log(`
migrate-add-mana-cost — ALTER TABLE cards ADD COLUMN mana_cost TEXT

Usage:
  npm run migrate:mana-cost:dry-run    Pre-flight only; no DDL executed.
  npm run migrate:mana-cost            Live run against DATABASE_URL.

Behavior:
  - Idempotent: re-runs after success print "no-op" and exit 0.
  - NULLABLE column, no default; metadata-only on existing rows.
  - Rollback: ALTER TABLE cards DROP COLUMN mana_cost (data loss bounded to
    this column).
`);
    return 0;
  }

  let db: MigrationDb;
  if (args?.db) {
    db = args.db;
  } else {
    if (!process.env.DATABASE_URL) {
      console.error("Error: DATABASE_URL is not set. Source .env.local or export it before running.");
      return 1;
    }
    const { db: realDb } = await import("../src/db/client.js").catch(() => import("../src/db/client"));
    db = realDb;
  }

  console.log(
    parsed.dryRun
      ? "[migrate:mana-cost] DRY RUN — pre-flight + read-only snapshot only."
      : "[migrate:mana-cost] LIVE RUN — pre-flight check, then single ALTER if needed.",
  );

  const alreadyPresent = await columnExists(db);
  const cardsBefore = await countCards(db);
  const capturedAt = new Date().toISOString();

  if (alreadyPresent) {
    console.log(`\n[migrate:mana-cost] Idempotent no-op: cards.mana_cost already present (cards rowcount=${cardsBefore}).`);
    return 0;
  }

  console.log(`[migrate:mana-cost] Pre-flight green: cards.mana_cost absent, cards rowcount=${cardsBefore}.`);

  if (parsed.dryRun) {
    console.log("\n[migrate:mana-cost] Statement that WOULD execute (dry-run, not sent):");
    console.log("  1. ALTER TABLE cards ADD COLUMN mana_cost TEXT");
    console.log(`\nSummary @ ${capturedAt} (dry-run):`);
    console.log(`  cards rowcount: ${cardsBefore} (unchanged in dry-run)`);
    console.log(`  cards.mana_cost would be added: yes`);
    return 0;
  }

  try {
    await applyMigration(db);
  } catch (error) {
    console.error(`\n[migrate:mana-cost] APPLY FAILED: ${(error as Error).message}`);
    console.error("The ALTER runs in its own implicit transaction; nothing partial should be applied. Verify with `\\d cards` in the Neon SQL editor.");
    return 1;
  }

  const presentAfter = await columnExists(db);
  const cardsAfter = await countCards(db);

  console.log(`\n[migrate:mana-cost] APPLIED — cards.mana_cost present=${presentAfter}, cards rowcount=${cardsAfter} (was ${cardsBefore}).`);
  return 0;
}

const isDirectRun =
  process.argv[1]?.endsWith("migrate-add-mana-cost.ts") ||
  process.argv[1]?.endsWith("migrate-add-mana-cost.js");
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Unexpected error: ${(err as Error).message}`);
      process.exit(1);
    });
}
