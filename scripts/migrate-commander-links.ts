#!/usr/bin/env tsx
/**
 * Add commander_links — idempotent admin-only EDHREC commander shortcut table.
 *
 * EXECUTION MODEL — MANUAL ONLY
 *   1. Run `npm run migrate:commander-links:dry-run` against a Neon branch.
 *   2. Confirm the dry-run summary.
 *   3. Run `npm run migrate:commander-links` against production DATABASE_URL.
 *   4. Deploy/use app code under /admin/commanders.
 *
 * ROLLBACK
 *   App rollback can leave this additive table unused. If it must be removed:
 *     DROP TABLE commander_links;
 */

import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

export interface MigrationDb {
  execute: NeonHttpDatabase<Record<string, never>>["execute"];
}

interface CountRow extends Record<string, unknown> {
  c: number;
}

interface PresenceRow extends Record<string, unknown> {
  table_name: string;
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

async function tableExists(db: MigrationDb): Promise<boolean> {
  const result = (await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'commander_links'
  `)) as { rows: PresenceRow[] };
  return (result.rows ?? []).length > 0;
}

async function countLinks(db: MigrationDb): Promise<number> {
  const result = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM commander_links`)) as { rows: CountRow[] };
  return result.rows?.[0]?.c ?? 0;
}

async function applyMigration(db: MigrationDb): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS commander_links (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      name text NOT NULL,
      edhrec_url text NOT NULL,
      image_url text,
      created_by_email text,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS commander_links_name_idx
    ON commander_links (name)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS commander_links_created_at_idx
    ON commander_links (created_at DESC)
  `);
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
migrate-commander-links — creates commander_links table

Usage:
  npm run migrate:commander-links:dry-run    Pre-flight only; no DDL executed.
  npm run migrate:commander-links            Live run against DATABASE_URL.

Behavior:
  - Idempotent: CREATE TABLE/INDEX IF NOT EXISTS.
  - Stores admin-only commander shortcut metadata and EDHREC links.
  - Rollback: app rollback can ignore the table; DROP TABLE only if required.
`);
    return 0;
  }

  let db: MigrationDb;
  if (args?.db) {
    db = args.db;
  } else {
    if (!process.env.DATABASE_URL) {
      if (parsed.dryRun) {
        const capturedAt = new Date().toISOString();
        console.log("[migrate:commander-links] DRY RUN — no DATABASE_URL set; static pre-flight only.");
        console.log("\nStatements that WOULD execute (dry-run, not sent):");
        console.log("  1. CREATE TABLE IF NOT EXISTS commander_links (...)");
        console.log("  2. CREATE INDEX IF NOT EXISTS commander_links_name_idx");
        console.log("  3. CREATE INDEX IF NOT EXISTS commander_links_created_at_idx");
        console.log(`\nSummary @ ${capturedAt}: no DDL executed.`);
        return 0;
      }
      console.error("Error: DATABASE_URL is not set. Source .env.local or export it before running.");
      return 1;
    }
    const { db: realDb } = await import("../src/db/client.js").catch(() => import("../src/db/client"));
    db = realDb;
  }

  const existsBefore = await tableExists(db);
  const rowsBefore = existsBefore ? await countLinks(db) : 0;
  const capturedAt = new Date().toISOString();

  console.log(
    parsed.dryRun
      ? "[migrate:commander-links] DRY RUN — pre-flight only."
      : "[migrate:commander-links] LIVE RUN — create table/indexes if needed.",
  );
  console.log(`[migrate:commander-links] table exists before=${existsBefore}, rows=${rowsBefore}.`);

  if (parsed.dryRun) {
    console.log("\nStatements that WOULD execute (dry-run, not sent):");
    console.log("  1. CREATE TABLE IF NOT EXISTS commander_links (...)");
    console.log("  2. CREATE INDEX IF NOT EXISTS commander_links_name_idx");
    console.log("  3. CREATE INDEX IF NOT EXISTS commander_links_created_at_idx");
    console.log(`\nSummary @ ${capturedAt}: no DDL executed.`);
    return 0;
  }

  try {
    await applyMigration(db);
  } catch (error) {
    console.error(`\n[migrate:commander-links] APPLY FAILED: ${(error as Error).message}`);
    return 1;
  }

  const existsAfter = await tableExists(db);
  const rowsAfter = existsAfter ? await countLinks(db) : 0;
  console.log(`\n[migrate:commander-links] APPLIED — table exists=${existsAfter}, rows ${rowsBefore} -> ${rowsAfter}.`);
  return existsAfter ? 0 : 1;
}

const isDirectRun =
  process.argv[1]?.endsWith("migrate-commander-links.ts") ||
  process.argv[1]?.endsWith("migrate-commander-links.js");
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Unexpected error: ${(err as Error).message}`);
      process.exit(1);
    });
}
