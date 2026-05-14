#!/usr/bin/env tsx
/**
 * Quick task 260514-7z2: orders.buyer_phone column — single-statement, idempotent migration.
 *
 * Adds a NULLABLE `buyer_phone TEXT` column to the orders table for optional
 * buyer-supplied phone numbers (pickup/shipping coordination). Mirrors the
 * idempotent shape of `scripts/migrate-v1.3-binder.ts` but for a single ALTER.
 *
 *   ALTER TABLE orders ADD COLUMN buyer_phone TEXT
 *
 * NULLABLE, no DEFAULT — Postgres treats this as a metadata-only operation
 * on existing rows (no row rewrite).
 *
 * EXECUTION MODEL — MANUAL ONLY
 *   1. Operator pulls the v1.3.x branch locally
 *   2. `npm run migrate:phone:dry-run` against a Neon branch first
 *   3. Operator confirms the dry-run summary
 *   4. `npm run migrate:phone` against the production DATABASE_URL
 *   5. Operator confirms the live summary
 *   6. Vercel deploys app code that reads/writes buyer_phone
 *
 * IDEMPOTENCY
 *   The pre-flight reads `information_schema.columns` for
 *   orders.buyer_phone. If the row already exists, the script prints
 *   "buyer_phone column already present — no changes" and exits 0
 *   without executing any DDL. Safe to re-run.
 *
 * ROLLBACK
 *   No down migration. The column is NULLABLE with no default; if the
 *   app rollback is required, leave the column in place — old code will
 *   simply ignore it. If you must drop:
 *     ALTER TABLE orders DROP COLUMN buyer_phone
 *   (data loss is bounded to the new column's contents.)
 */

import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

// --- Public surface ---------------------------------------------------------

/** Database handle interface — narrow surface used by helpers (mockable in tests). */
export interface MigrationDb {
  execute: NeonHttpDatabase<Record<string, never>>["execute"];
}

/** Snapshot captured before any DML, used for the summary diff. */
export interface PreflightSnapshot {
  /** Whether orders.buyer_phone already exists at pre-flight time. */
  columnAlreadyPresent: boolean;
  /** orders rowcount before the migration (informational only). */
  ordersRowCountBefore: number;
  /** Captured wall-clock timestamp (printed in the summary for PITR window). */
  capturedAt: string;
}

export interface PostMigrationSnapshot extends PreflightSnapshot {
  /** orders.buyer_phone presence after the run (always true on success). */
  columnPresentAfter: boolean;
  /** orders rowcount after the migration (zero loss expected). */
  ordersRowCountAfter: number;
  /** Carry the dry-run flag for the summary header. */
  dryRun: boolean;
}

/**
 * Pre-flight: check whether orders.buyer_phone already exists.
 * Idempotency contract — caller short-circuits if columnAlreadyPresent is true.
 */
export async function runPreflights(args: {
  db: MigrationDb;
}): Promise<PreflightSnapshot> {
  const { db } = args;

  const colResult = (await db.execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'buyer_phone'`,
  )) as { rows: Array<{ column_name: string }> };

  const ordersCount = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM orders`,
  )) as { rows: Array<{ c: number }> };

  return {
    columnAlreadyPresent: colResult.rows.length > 0,
    ordersRowCountBefore: ordersCount.rows[0]?.c ?? 0,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Execute the single ALTER statement that adds buyer_phone.
 * Caller must have verified `columnAlreadyPresent === false` first.
 */
export async function applyMigration(args: { db: MigrationDb }): Promise<void> {
  const { db } = args;
  await db.execute(sql`ALTER TABLE orders ADD COLUMN buyer_phone TEXT`);
}

/**
 * Measure post-state. In dry-run mode, returns the pre-state values; in live
 * mode, re-checks information_schema.columns to prove the column landed.
 */
export async function measurePostState(args: {
  db: MigrationDb;
  preSnapshot: PreflightSnapshot;
  dryRun: boolean;
}): Promise<PostMigrationSnapshot> {
  const { db, preSnapshot, dryRun } = args;

  if (dryRun) {
    return {
      ...preSnapshot,
      columnPresentAfter: preSnapshot.columnAlreadyPresent,
      ordersRowCountAfter: preSnapshot.ordersRowCountBefore,
      dryRun: true,
    };
  }

  const colResult = (await db.execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'buyer_phone'`,
  )) as { rows: Array<{ column_name: string }> };

  const ordersCount = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM orders`,
  )) as { rows: Array<{ c: number }> };

  return {
    ...preSnapshot,
    columnPresentAfter: colResult.rows.length > 0,
    ordersRowCountAfter: ordersCount.rows[0]?.c ?? 0,
    dryRun: false,
  };
}

/**
 * Render the structured terminal summary. Mirrors the migrate-v1.3-binder
 * formatSummary template (header, schema changes, sample, next-step).
 */
export function formatSummary(snapshot: PostMigrationSnapshot): string {
  const noop = snapshot.columnAlreadyPresent;
  const header = noop
    ? "buyer_phone column already present — no changes"
    : snapshot.dryRun
      ? "DRY RUN — no DML executed"
      : "Migration v1.3.x (buyer_phone) complete";

  const lines: string[] = [];
  lines.push(`${noop || snapshot.dryRun ? "" : "✓ "}${header}`);
  lines.push("");
  lines.push("Schema changes applied:");
  if (noop) {
    lines.push("  - orders.buyer_phone: ALREADY PRESENT (no-op)");
  } else if (snapshot.dryRun) {
    lines.push("  - orders.buyer_phone: WOULD ADD (text, NULLABLE, no DEFAULT)");
  } else {
    lines.push("  - orders: +buyer_phone (text, NULLABLE, no DEFAULT)");
  }
  lines.push("");
  lines.push("Columns now present (post-state):");
  lines.push(`  - orders.buyer_phone: ${snapshot.columnPresentAfter ? "PRESENT" : "MISSING"}`);
  lines.push("");
  lines.push("Data preserved:");
  lines.push(
    `  - orders rows: ${snapshot.ordersRowCountBefore} -> ${snapshot.ordersRowCountAfter}` +
      (snapshot.ordersRowCountBefore === snapshot.ordersRowCountAfter
        ? " (zero loss)"
        : " (LOSS DETECTED)"),
  );
  lines.push("");
  lines.push(`Pre-state captured at: ${snapshot.capturedAt}`);
  lines.push("");
  lines.push("Next: deploy app code that reads/writes orders.buyer_phone.");
  return lines.join("\n");
}

// --- main() orchestration ---------------------------------------------------

const HELP = `\
Usage: npm run migrate:phone [-- --dry-run] [-- --help]

DESCRIPTION
  Quick task 260514-7z2: adds a NULLABLE buyer_phone TEXT column to the
  orders table. Idempotent — re-running on a schema that already has the
  column exits 0 with the "already present" summary, executes zero DDL.

EXECUTION MODEL — MANUAL ONLY
  This script writes to the database pointed at by DATABASE_URL. There is
  no Vercel build hook. The operator runs it manually:

    1. npm run migrate:phone:dry-run   (against a Neon branch)
    2. eyeball the dry-run summary
    3. npm run migrate:phone           (against the production DATABASE_URL)
    4. eyeball the live summary
    5. deploy app code that reads/writes buyer_phone

FLAGS
  --dry-run     Run the pre-flight check, print the would-be statement,
                and print the dry-run summary. NO DDL is executed. Read-
                only queries (column-presence check, rowcount) DO run.
  -h, --help    Print this help and exit. No secret values are printed.

ROLLBACK
  Leave the column in place — old code ignores it (NULLABLE + no default).
  If you must drop: \`ALTER TABLE orders DROP COLUMN buyer_phone\`.

WARNING
  This script writes to the database pointed at by DATABASE_URL. Confirm
  you are pointed at the intended environment before running without
  --dry-run.
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

/** Render the would-be statement for the dry-run output. */
function renderStatementListForDryRun(): string[] {
  return ["  1. ALTER TABLE orders ADD COLUMN buyer_phone TEXT"];
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

  // Resolve the DB lazily so --help doesn't require DATABASE_URL.
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
      ? "[migrate:phone] DRY RUN — pre-flight check + read-only snapshot only."
      : "[migrate:phone] LIVE RUN — pre-flight check, then single ALTER if needed.",
  );

  let preSnapshot: PreflightSnapshot;
  try {
    preSnapshot = await runPreflights({ db });
  } catch (error) {
    console.error(`\n${(error as Error).message}`);
    console.error("\nFAIL — zero changes applied (pre-flight rejected).");
    return 1;
  }

  // Idempotent short-circuit: if the column is already present, log + exit 0.
  if (preSnapshot.columnAlreadyPresent) {
    console.log(
      `[migrate:phone] Idempotent no-op: orders.buyer_phone already present (orders rowcount=${preSnapshot.ordersRowCountBefore}).`,
    );
    const post = await measurePostState({ db, preSnapshot, dryRun: parsed.dryRun });
    console.log("\n" + formatSummary(post));
    return 0;
  }

  console.log(
    `[migrate:phone] Pre-flight green: orders.buyer_phone absent, orders rowcount=${preSnapshot.ordersRowCountBefore}.`,
  );

  if (parsed.dryRun) {
    console.log(
      "\n[migrate:phone] Statements that WOULD execute (dry-run, none sent):",
    );
    for (const line of renderStatementListForDryRun()) {
      console.log(line);
    }
    const post = await measurePostState({ db, preSnapshot, dryRun: true });
    console.log("\n" + formatSummary(post));
    return 0;
  }

  // Live run — apply the single ALTER.
  try {
    await applyMigration({ db });
  } catch (error) {
    console.error(`\n[migrate:phone] APPLY FAILED: ${(error as Error).message}`);
    console.error(
      "\nThe ALTER statement runs in its own implicit transaction; nothing partial should be applied. Verify with `\\d orders` in the Neon SQL editor.",
    );
    return 1;
  }

  const post = await measurePostState({ db, preSnapshot, dryRun: false });
  console.log("\n" + formatSummary(post));
  return 0;
}

// Entry point — only when executed directly (not when imported by tests).
const isDirectRun =
  process.argv[1]?.endsWith("migrate-v1.3.x-buyer-phone.ts") ||
  process.argv[1]?.endsWith("migrate-v1.3.x-buyer-phone.js");
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Unexpected error: ${(err as Error).message}`);
      process.exit(1);
    });
}
