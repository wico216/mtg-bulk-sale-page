#!/usr/bin/env tsx
/**
 * Add binder_share_links — idempotent private W-binder magic-link table.
 *
 * EXECUTION MODEL — MANUAL ONLY
 *   1. Run `npm run migrate:w-binder-shares:dry-run` against a Neon branch.
 *   2. Confirm the dry-run summary.
 *   3. Run `npm run migrate:w-binder-shares` against production DATABASE_URL.
 *   4. Deploy/use app code that creates private share links.
 *
 * ROLLBACK
 *   App rollback can leave this additive table unused. If it must be removed:
 *     DROP TABLE binder_share_links;
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
      AND table_name = 'binder_share_links'
  `)) as { rows: PresenceRow[] };
  return (result.rows ?? []).length > 0;
}

async function countLinks(db: MigrationDb): Promise<number> {
  const result = (await db.execute(sql`SELECT COUNT(*)::int AS c FROM binder_share_links`)) as { rows: CountRow[] };
  return result.rows?.[0]?.c ?? 0;
}

async function applyMigration(db: MigrationDb): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS binder_share_links (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      token_hash text NOT NULL,
      label text NOT NULL,
      scope text NOT NULL DEFAULT 'w_binders',
      allowed_binders text[],
      created_by_email text,
      expires_at timestamp with time zone,
      revoked_at timestamp with time zone,
      last_used_at timestamp with time zone,
      use_count integer NOT NULL DEFAULT 0,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS binder_share_links_token_hash_idx
    ON binder_share_links (token_hash)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS binder_share_links_scope_created_at_idx
    ON binder_share_links (scope, created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS binder_share_links_revoked_at_idx
    ON binder_share_links (revoked_at)
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
migrate-w-binder-share-links — creates binder_share_links table

Usage:
  npm run migrate:w-binder-shares:dry-run    Pre-flight only; no DDL executed.
  npm run migrate:w-binder-shares            Live run against DATABASE_URL.

Behavior:
  - Idempotent: CREATE TABLE/INDEX IF NOT EXISTS.
  - Stores only token hashes, not raw share tokens.
  - Rollback: app rollback can ignore the table; DROP TABLE only if required.
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

  const existsBefore = await tableExists(db);
  const rowsBefore = existsBefore ? await countLinks(db) : 0;
  const capturedAt = new Date().toISOString();

  console.log(
    parsed.dryRun
      ? "[migrate:w-binder-shares] DRY RUN — pre-flight only."
      : "[migrate:w-binder-shares] LIVE RUN — create table/indexes if needed.",
  );
  console.log(`[migrate:w-binder-shares] table exists before=${existsBefore}, rows=${rowsBefore}.`);

  if (parsed.dryRun) {
    console.log("\nStatements that WOULD execute (dry-run, not sent):");
    console.log("  1. CREATE TABLE IF NOT EXISTS binder_share_links (...)");
    console.log("  2. CREATE UNIQUE INDEX IF NOT EXISTS binder_share_links_token_hash_idx");
    console.log("  3. CREATE INDEX IF NOT EXISTS binder_share_links_scope_created_at_idx");
    console.log("  4. CREATE INDEX IF NOT EXISTS binder_share_links_revoked_at_idx");
    console.log(`\nSummary @ ${capturedAt}: no DDL executed.`);
    return 0;
  }

  try {
    await applyMigration(db);
  } catch (error) {
    console.error(`\n[migrate:w-binder-shares] APPLY FAILED: ${(error as Error).message}`);
    return 1;
  }

  const existsAfter = await tableExists(db);
  const rowsAfter = existsAfter ? await countLinks(db) : 0;
  console.log(`\n[migrate:w-binder-shares] APPLIED — table exists=${existsAfter}, rows ${rowsBefore} -> ${rowsAfter}.`);
  return existsAfter ? 0 : 1;
}

const isDirectRun =
  process.argv[1]?.endsWith("migrate-w-binder-share-links.ts") ||
  process.argv[1]?.endsWith("migrate-w-binder-share-links.js");
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Unexpected error: ${(err as Error).message}`);
      process.exit(1);
    });
}
