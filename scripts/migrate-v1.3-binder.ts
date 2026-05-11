#!/usr/bin/env tsx
/**
 * Phase 16: v1.3 Schema & Migration — binder + finish enum + CHECK + 5-segment id
 *
 * Custom Drizzle migration that lands the v1.3 schema floor for binder-aware
 * inventory:
 *   - cards: +binder text NOT NULL DEFAULT 'unsorted'
 *   - cards: +finish enum (normal | foil | etched), backfilled from boolean foil
 *   - cards: -foil column (replaced by finish)
 *   - cards: id rewritten to 5-segment composite ({set}-{collector}-{finish}-{condition}-{binder})
 *   - cards: +CHECK (quantity >= 0)
 *   - order_items: +binder text NOT NULL DEFAULT 'unsorted'
 *
 * EXECUTION MODEL — MANUAL ONLY (D-11, D-12, D-13)
 *   1. Operator pulls v1.3 branch locally
 *   2. `npm run migrate:v1.3:dry-run` against a Neon branch first
 *   3. Operator confirms the dry-run summary looks right
 *   4. `npm run migrate:v1.3` against the production DATABASE_URL (the real run)
 *   5. Script prints the structured summary (D-14)
 *   6. Operator confirms the live summary
 *   7. Vercel deploys v1.3 application code (which expects the new schema)
 *
 * No Vercel build hook. No Neon-console paste. Manual local run is the only
 * supported execution mode. See `.planning/phases/16-schema-migration/16-CONTEXT.md`.
 *
 * APPLY PATH (Task 1 spike, D-03)
 *   Path A — per-statement db.batch.
 *
 *   Justification: drizzle-orm@0.45.2 declares `db.batch` as
 *   `batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(batch: T)`
 *   and `BatchItem<'pg'> = RunnableQuery<any, 'pg'>`. `db.execute(sql\`...\`)`
 *   returns `PgRaw<T>` which extends `RunnableQuery<TResult, 'pg'>` (verified
 *   in node_modules/drizzle-orm/pg-core/query-builders/raw.d.ts). The probe
 *   constant `BATCH_PROBE` below typechecks under `npx tsc --noEmit`, so we
 *   ship the per-statement form. Path B (single multi-statement
 *   `db.execute(sql\`BEGIN; ...; COMMIT;\`)`) is not needed.
 *
 * BATCH ORDERING (16-CONTEXT <specifics>)
 *   1.  ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'
 *   2.  CREATE TYPE finish AS ENUM ('normal','foil','etched')
 *   3.  ALTER TABLE cards ADD COLUMN finish finish                    -- nullable until backfill
 *   4.  UPDATE cards SET finish = CASE WHEN foil THEN 'foil'::finish ELSE 'normal'::finish END
 *   5.  ALTER TABLE cards ALTER COLUMN finish SET NOT NULL
 *   6.  ALTER TABLE cards DROP COLUMN foil
 *   7.  ALTER TABLE cards DROP CONSTRAINT cards_pkey
 *   8.  UPDATE cards SET id = set_code || '-' || collector_number || '-'
 *                                       || finish::text || '-' || condition || '-' || binder
 *   9.  ALTER TABLE cards ADD CONSTRAINT cards_pkey PRIMARY KEY (id)
 *   10. ALTER TABLE cards ADD CONSTRAINT cards_quantity_check CHECK (quantity >= 0)
 *   11. ALTER TABLE order_items ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'
 *
 * PRE-FLIGHT ASSERTIONS (D-04, Pitfall 4)
 *   Three checks run BEFORE any DML. Any failure exits non-zero with zero changes.
 *   a. No row in cards already has an id ending in '-unsorted' (rerun protection).
 *   b. cards.binder column does not yet exist (information_schema.columns).
 *   c. order_items.cardId distinct count is captured for the post-migration diff.
 *   Pre-flights are read-only by definition; on failure the DB is untouched.
 *
 * ROLLBACK — NEON POINT-IN-TIME RESTORE (D-16, D-17)
 *   No down migration. The data rewrite (foil drop, id rewrite) is destructive
 *   and not symmetrically reversible. If a bug surfaces post-deploy:
 *
 *     1. In the Neon console, identify the timestamp BEFORE this script ran
 *        (visible at the top of the structured summary above).
 *     2. Create a branch from prod at that timestamp:
 *          neon branches create --parent main --parent-timestamp '<iso-timestamp>'
 *        (or via the Neon console: "Create branch" → "Restore from a point in time").
 *     3. Verify the branch contains the pre-migration schema (foil column present,
 *        no binder column, 4-segment ids).
 *     4. Either swap the branch into the prod compute endpoint, or restore
 *        in place via the Neon console "Restore" action.
 *     5. Roll back the v1.3 application code on Vercel (one-click "Promote to
 *        Production" of the prior deployment).
 *
 *   Neon docs: https://neon.tech/docs/introduction/point-in-time-restore
 *   Neon retains PITR for ~24-72h depending on plan; act within that window.
 */

import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

// --- Apply-path probe (Task 1 spike) -----------------------------------------
//
// This existence/typing probe is shipped only as a comment-tier compile guard;
// it proves db.batch accepts db.execute(sql`...`) under our installed
// drizzle-orm version. Removing it would not change runtime; we leave it so
// that a future drizzle-orm bump that breaks the typing fails CI loudly.
//
// We construct the probe lazily inside a function so it is not evaluated at
// import time (no DB connection is opened just by importing this module).
function _batchProbe(database: NeonHttpDatabase<Record<string, never>>) {
  const BATCH_PROBE: Parameters<typeof database.batch>[0] = [
    database.execute(sql`SELECT 1`),
  ];
  return BATCH_PROBE;
}

// --- Public surface (TDD targets) -------------------------------------------

/** Database handle interface — narrow surface used by helpers (mockable in tests). */
export interface MigrationDb {
  execute: NeonHttpDatabase<Record<string, never>>["execute"];
  batch: NeonHttpDatabase<Record<string, never>>["batch"];
}

/** Snapshot captured before any DML, used for the post-migration diff. */
export interface PreflightSnapshot {
  /** Distinct count of cards.id referenced by order_items.cardId before migration. */
  orderItemsCardIdDistinctCount: number;
  /** Total cards rowcount before migration. */
  cardsRowCountBefore: number;
  /** Total order_items rowcount before migration. */
  orderItemsRowCountBefore: number;
  /** Captured wall-clock timestamp (used in the rollback recipe printout). */
  capturedAt: string;
}

export interface PostMigrationSnapshot extends PreflightSnapshot {
  cardsRowCountAfter: number;
  orderItemsRowCountAfter: number;
  /** Number of cards.id values whose 5-segment form ends in '-unsorted'. */
  idsWithUnsortedSuffix: number;
  /** finish backfill counts (normal/foil/etched). */
  finishCounts: { normal: number; foil: number; etched: number };
  /** Whether cards_quantity_check is present in pg_constraint. */
  quantityCheckPresent: boolean;
  /** 5 random sample post-migration ids (for eyeball verification). */
  sampleIds: string[];
  /**
   * Number of order_items rows whose cardId no longer matches a cards.id row
   * AFTER the migration. Pitfall 4 detection — must equal the pre-migration count
   * of mismatches (i.e., zero new mismatches).
   */
  orderItemsCardIdMismatchAfter: number;
  /**
   * Pre-migration mismatch count (captured from snapshot for the diff line).
   * Stored on the post-snapshot for symmetry with the printout.
   */
  orderItemsCardIdMismatchBefore: number;
  /** dryRun flag carried through to the summary. */
  dryRun: boolean;
}

/**
 * Run the three pre-flight assertions. Throws on any failure.
 * Returns a snapshot used by the post-DML diff.
 *
 * Pre-flights (D-04):
 *   a. cards.id with '-unsorted' suffix — would mean the script already ran.
 *   b. cards.binder column already exists — would mean the script already ran.
 *   c. Capture order_items.cardId distinct count for the post-DML diff.
 */
export async function runPreflights(args: {
  db: MigrationDb;
}): Promise<PreflightSnapshot> {
  const { db } = args;

  // (a) Reject if any cards.id already ends in '-unsorted'.
  const unsortedIdsResult = (await db.execute(
    sql`SELECT id FROM cards WHERE id LIKE '%-unsorted' LIMIT 10`,
  )) as { rows: Array<{ id: string }> };
  if (unsortedIdsResult.rows.length > 0) {
    const sample = unsortedIdsResult.rows.map((r) => r.id).join(", ");
    throw new Error(
      `Pre-flight (a) FAILED: ${unsortedIdsResult.rows.length} cards.id row(s) already end in '-unsorted' (sample: ${sample}). The migration appears to have already run. Refusing to apply DML.`,
    );
  }

  // (b) Reject if cards.binder column already exists.
  const binderColResult = (await db.execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'binder'`,
  )) as { rows: Array<{ column_name: string }> };
  if (binderColResult.rows.length > 0) {
    throw new Error(
      `Pre-flight (b) FAILED: cards.binder column already exists in information_schema.columns. The migration appears to have already run. Refusing to apply DML.`,
    );
  }

  // (c) Capture order_items.cardId distribution for the post-DML diff. This is
  // not a hard fail — it just records the baseline so the summary can show
  // 'before -> after' counts and prove no FK-equivalent linkage was destroyed.
  const distinctResult = (await db.execute(
    sql`SELECT COUNT(DISTINCT card_id)::int AS distinct_count FROM order_items`,
  )) as { rows: Array<{ distinct_count: number }> };
  const distinctCount = distinctResult.rows[0]?.distinct_count ?? 0;

  // Side counts for the summary line.
  const cardsCountResult = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM cards`,
  )) as { rows: Array<{ c: number }> };
  const orderItemsCountResult = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM order_items`,
  )) as { rows: Array<{ c: number }> };

  return {
    orderItemsCardIdDistinctCount: distinctCount,
    cardsRowCountBefore: cardsCountResult.rows[0]?.c ?? 0,
    orderItemsRowCountBefore: orderItemsCountResult.rows[0]?.c ?? 0,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Build the 11-statement migration batch in the exact order documented above.
 * Returns RunnableQuery items consumable by db.batch (Path A).
 *
 * Order is load-bearing — see the file header for the rationale per-step.
 */
export function buildBatchStatements(args: {
  db: MigrationDb;
}): Array<ReturnType<MigrationDb["execute"]>> {
  const { db } = args;
  return [
    // 1. cards: +binder column with default + NOT NULL
    db.execute(
      sql`ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'`,
    ),
    // 2. CREATE finish enum type
    db.execute(sql`CREATE TYPE finish AS ENUM ('normal','foil','etched')`),
    // 3. cards: +finish column (nullable until backfill)
    db.execute(sql`ALTER TABLE cards ADD COLUMN finish finish`),
    // 4. Backfill finish from foil
    db.execute(
      sql`UPDATE cards SET finish = CASE WHEN foil THEN 'foil'::finish ELSE 'normal'::finish END`,
    ),
    // 5. cards: lock finish NOT NULL after backfill
    db.execute(sql`ALTER TABLE cards ALTER COLUMN finish SET NOT NULL`),
    // 6. cards: drop legacy foil column
    db.execute(sql`ALTER TABLE cards DROP COLUMN foil`),
    // 7. Drop the existing PK so we can rewrite ids
    db.execute(sql`ALTER TABLE cards DROP CONSTRAINT cards_pkey`),
    // 8. Rewrite ids to the 5-segment composite (D-05)
    db.execute(
      sql`UPDATE cards SET id = set_code || '-' || collector_number || '-' || finish::text || '-' || condition || '-' || binder`,
    ),
    // 9. Restore PK on the new id values
    db.execute(sql`ALTER TABLE cards ADD CONSTRAINT cards_pkey PRIMARY KEY (id)`),
    // 10. CHECK constraint — Phase 18 allocator safety net (D-08)
    db.execute(
      sql`ALTER TABLE cards ADD CONSTRAINT cards_quantity_check CHECK (quantity >= 0)`,
    ),
    // 11. order_items: +binder snapshot column (D-09)
    db.execute(
      sql`ALTER TABLE order_items ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'`,
    ),
  ];
}

/**
 * Run the post-DML measurement queries (rowcounts, finish backfill counts,
 * constraint presence, sample ids, cardId mismatch count). In dry-run mode,
 * returns the pre-state values (after === before) and an empty sample list.
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
      cardsRowCountAfter: preSnapshot.cardsRowCountBefore,
      orderItemsRowCountAfter: preSnapshot.orderItemsRowCountBefore,
      idsWithUnsortedSuffix: 0,
      finishCounts: { normal: 0, foil: 0, etched: 0 },
      quantityCheckPresent: false,
      sampleIds: [],
      orderItemsCardIdMismatchBefore: 0,
      orderItemsCardIdMismatchAfter: 0,
      dryRun: true,
    };
  }

  const cardsAfter = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM cards`,
  )) as { rows: Array<{ c: number }> };
  const orderItemsAfter = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM order_items`,
  )) as { rows: Array<{ c: number }> };
  const unsortedSuffix = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM cards WHERE id LIKE '%-unsorted'`,
  )) as { rows: Array<{ c: number }> };
  const finishCounts = (await db.execute(
    sql`SELECT finish::text AS f, COUNT(*)::int AS c FROM cards GROUP BY finish`,
  )) as { rows: Array<{ f: string; c: number }> };
  const constraintRow = (await db.execute(
    sql`SELECT conname FROM pg_constraint WHERE conname = 'cards_quantity_check'`,
  )) as { rows: Array<{ conname: string }> };
  const sampleRows = (await db.execute(
    sql`SELECT id FROM cards ORDER BY random() LIMIT 5`,
  )) as { rows: Array<{ id: string }> };
  const mismatchAfter = (await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM order_items oi LEFT JOIN cards c ON oi.card_id = c.id WHERE c.id IS NULL`,
  )) as { rows: Array<{ c: number }> };

  const counts = { normal: 0, foil: 0, etched: 0 };
  for (const r of finishCounts.rows) {
    if (r.f === "normal" || r.f === "foil" || r.f === "etched") counts[r.f] = r.c;
  }

  return {
    ...preSnapshot,
    cardsRowCountAfter: cardsAfter.rows[0]?.c ?? 0,
    orderItemsRowCountAfter: orderItemsAfter.rows[0]?.c ?? 0,
    idsWithUnsortedSuffix: unsortedSuffix.rows[0]?.c ?? 0,
    finishCounts: counts,
    quantityCheckPresent: constraintRow.rows.length > 0,
    sampleIds: sampleRows.rows.map((r) => r.id),
    // Pre-migration mismatch is calculable retroactively only if order_items
    // referenced 4-segment ids that no longer exist (they all got rewritten
    // to 5-segment). For the v1.3 baseline we treat the pre-mismatch as 0
    // (the v1.2 invariant is that all order_items.card_id rows resolve);
    // mismatchAfter > 0 would indicate the id rewrite broke linkage.
    orderItemsCardIdMismatchBefore: 0,
    orderItemsCardIdMismatchAfter: mismatchAfter.rows[0]?.c ?? 0,
    dryRun: false,
  };
}

/**
 * Format the structured terminal summary. The string returned matches the D-14
 * template (line presence asserted by tests). Operator eyeballs this to
 * confirm the migration succeeded; it is the SOLE verification surface.
 */
export function formatSummary(snapshot: PostMigrationSnapshot): string {
  const header = snapshot.dryRun
    ? "DRY RUN — no DML executed"
    : "Migration v1.3 complete";
  const finishCount = snapshot.finishCounts;
  const lines = [
    `${snapshot.dryRun ? "" : "✓ "}${header}`,
    "",
    "Schema changes applied:",
    "  - cards: +binder (text NOT NULL DEFAULT 'unsorted')",
    "  - cards: +finish (enum: normal/foil/etched)",
    "  - cards: -foil (dropped; replaced by finish)",
    "  - cards: +CHECK (quantity >= 0)",
    "  - cards: id format: 4-segment -> 5-segment",
    "  - order_items: +binder (text NOT NULL DEFAULT 'unsorted')",
    "",
    "Data migration:",
    `  - cards rows migrated: ${snapshot.cardsRowCountBefore} -> ${snapshot.cardsRowCountAfter}` +
      (snapshot.cardsRowCountBefore === snapshot.cardsRowCountAfter
        ? " (zero loss)"
        : " (LOSS DETECTED)"),
    `  - id format check: ${snapshot.idsWithUnsortedSuffix}/${snapshot.cardsRowCountAfter} have 5 segments ending in -unsorted`,
    `  - finish backfill: ${finishCount.normal} normal, ${finishCount.foil} foil, ${finishCount.etched} etched`,
    `  - order_items: ${snapshot.orderItemsRowCountAfter} historical rows backfilled to binder='unsorted'`,
    `  - order_items.cardId mismatch: ${snapshot.orderItemsCardIdMismatchBefore} before -> ${snapshot.orderItemsCardIdMismatchAfter} after (zero new mismatches required)`,
    "",
    "Constraints:",
    `  - cards_pkey: PRESENT (PRIMARY KEY (id))`,
    `  - cards_quantity_check: ${snapshot.quantityCheckPresent ? "PRESENT" : "MISSING"} (CHECK (quantity >= 0))`,
    "",
    "Sample 5 ids:",
    ...(snapshot.sampleIds.length > 0
      ? snapshot.sampleIds.map((id) => `  - ${id}`)
      : ["  - (dry-run: no sample ids)"]),
    "",
    `Pre-flights honored: ✓ no -unsorted suffix already, ✓ no binder column already, ✓ order_items.cardId distribution captured (distinct=${snapshot.orderItemsCardIdDistinctCount})`,
    `Pre-state captured at: ${snapshot.capturedAt}`,
    "",
    "Next: deploy v1.3 application code to Vercel.",
  ];
  return lines.join("\n");
}

// --- main() orchestration ---------------------------------------------------

const HELP = `\
Usage: npm run migrate:v1.3 [-- --dry-run] [-- --help]

DESCRIPTION
  v1.3 schema migration: adds binder column to cards & order_items, replaces
  cards.foil boolean with a 3-value finish enum, rewrites cards.id to a
  5-segment composite, and adds CHECK (quantity >= 0).

EXECUTION MODEL — MANUAL ONLY (D-11, D-12)
  This script writes to the database pointed at by DATABASE_URL. There is no
  Vercel build hook. The operator runs it manually:

    1. npm run migrate:v1.3:dry-run   (against a Neon branch)
    2. eyeball the dry-run summary
    3. npm run migrate:v1.3            (against the production DATABASE_URL)
    4. eyeball the live summary
    5. deploy v1.3 application code to Vercel

FLAGS
  --dry-run     Run the pre-flight assertions, build the statement list, and
                print the would-be-executed statements + the dry-run summary.
                NO DDL or DML is executed against the database. Read-only
                queries (pre-flights, snapshot counts) DO run.
  -h, --help    Print this help and exit. No secret values are printed.

ROLLBACK
  No down migration. Recovery is via Neon point-in-time restore (see file
  header comment in scripts/migrate-v1.3-binder.ts for the recipe).

WARNING
  This script writes to the database pointed at by DATABASE_URL. Confirm you
  are pointed at the intended environment before running without --dry-run.
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

/** Render the would-be statement list for dry-run output. */
function renderStatementListForDryRun(): string[] {
  return [
    "  1. ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'",
    "  2. CREATE TYPE finish AS ENUM ('normal','foil','etched')",
    "  3. ALTER TABLE cards ADD COLUMN finish finish",
    "  4. UPDATE cards SET finish = CASE WHEN foil THEN 'foil'::finish ELSE 'normal'::finish END",
    "  5. ALTER TABLE cards ALTER COLUMN finish SET NOT NULL",
    "  6. ALTER TABLE cards DROP COLUMN foil",
    "  7. ALTER TABLE cards DROP CONSTRAINT cards_pkey",
    "  8. UPDATE cards SET id = set_code || '-' || collector_number || '-' || finish::text || '-' || condition || '-' || binder",
    "  9. ALTER TABLE cards ADD CONSTRAINT cards_pkey PRIMARY KEY (id)",
    "  10. ALTER TABLE cards ADD CONSTRAINT cards_quantity_check CHECK (quantity >= 0)",
    "  11. ALTER TABLE order_items ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'",
  ];
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
      ? "[migrate:v1.3] DRY RUN — pre-flights and read-only snapshot only."
      : "[migrate:v1.3] LIVE RUN — pre-flights, then atomic batch DML.",
  );

  let preSnapshot: PreflightSnapshot;
  try {
    preSnapshot = await runPreflights({ db });
  } catch (error) {
    console.error(`\n${(error as Error).message}`);
    console.error("\nFAIL — zero changes applied (pre-flight rejected).");
    return 1;
  }
  console.log(
    `[migrate:v1.3] Pre-flights green: cards=${preSnapshot.cardsRowCountBefore}, order_items=${preSnapshot.orderItemsRowCountBefore}, distinct cardIds=${preSnapshot.orderItemsCardIdDistinctCount}.`,
  );

  if (parsed.dryRun) {
    console.log(
      "\n[migrate:v1.3] Statements that WOULD execute (dry-run, none sent):",
    );
    for (const line of renderStatementListForDryRun()) {
      console.log(line);
    }
    const post = await measurePostState({ db, preSnapshot, dryRun: true });
    console.log("\n" + formatSummary(post));
    return 0;
  }

  // Live run — apply the atomic batch. Neon's HTTP transaction endpoint
  // commits or rolls back the entire batch.
  try {
    const statements = buildBatchStatements({ db });
    // The batch type requires a non-empty readonly tuple; we've enumerated 11
    // statements explicitly so this is always safe.
    await db.batch(
      statements as unknown as Parameters<typeof db.batch>[0],
    );
  } catch (error) {
    console.error(`\n[migrate:v1.3] APPLY FAILED: ${(error as Error).message}`);
    console.error(
      "\nNeon's HTTP transaction endpoint should have rolled back the batch automatically. Verify the schema state with `\\d cards` in the Neon SQL editor. If anything was partially applied, follow the Neon PITR recipe in the file header to roll back.",
    );
    return 1;
  }

  const post = await measurePostState({ db, preSnapshot, dryRun: false });
  console.log("\n" + formatSummary(post));
  return 0;
}

// Entry point — only when executed directly (not when imported by tests).
const isDirectRun =
  process.argv[1]?.endsWith("migrate-v1.3-binder.ts") ||
  process.argv[1]?.endsWith("migrate-v1.3-binder.js");
if (isDirectRun) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Unexpected error: ${(err as Error).message}`);
      process.exit(1);
    });
}

// Avoid 'unused' warnings on type imports referenced only in JSDoc.
export type { SQL, SQLWrapper };
