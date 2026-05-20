#!/usr/bin/env tsx
/**
 * One-shot backfill: populate cards.scryfall_id by looking up
 * (set_code, collector_number) against Scryfall's /cards/collection
 * batch endpoint.
 *
 * Context: src/db/seed.ts:cardToRow shipped with `scryfallId: null`
 * hardcoded for every CSV import (fixed in commit f1312ad). Every prior
 * Manabox import silently dropped the Scryfall UUID, so the v1.4 price-
 * refresh feature was dead-on-arrival against existing inventory
 * (runPriceRefresh skips rows with no scryfallId per D-10). This script
 * fills the gap for the 2353 rows currently sitting with scryfall_id IS NULL.
 *
 * USAGE
 *   # Preview only, no DB writes
 *   npx tsx scripts/backfill-scryfall-ids.ts --dry-run
 *
 *   # Apply the backfill (writes to whichever DATABASE_URL is in .env.local)
 *   npx tsx scripts/backfill-scryfall-ids.ts
 *
 * DESIGN
 *   - Unique-key reduction: cards have N rows per printing
 *     (finish x condition x binder); scryfall_id is the same across them.
 *     SELECT DISTINCT (set_code, collector_number) collapses to the work set.
 *   - Batch fetch via /cards/collection (75 ids per POST, 250ms gate),
 *     mirroring the spacing used in src/lib/scryfall.ts fetchCollectionBatch
 *     so we stay well under Scryfall's documented ~10 req/sec ceiling.
 *   - UPDATE is grouped by (set_code, collector_number) so a single statement
 *     hits every (finish, condition, binder) variant of one printing.
 *   - WHERE scryfall_id IS NULL: idempotent. Rerun is safe; the second run
 *     just no-ops anything already populated.
 *
 * REPORT
 *   On exit, prints:
 *     - unique printings queried, matched, not-found
 *     - rows updated, rows untouched (already-set), rows still null
 *     - duration
 *
 * NOT IN SCOPE
 *   - Reverse mapping (drop scryfall_id back to null) — Neon point-in-time
 *     restore is the rollback path.
 *   - Updating other Scryfall-derived fields (image_url, color_identity,
 *     etc.). This is scryfall_id only so the price-refresh feature can run.
 */
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { config } from "dotenv";

config({ path: ".env.local" });

const BATCH_SIZE = 75;
const RATE_LIMIT_MS = 250;
const SCRYFALL_URL = "https://api.scryfall.com/cards/collection";

interface Printing {
  set_code: string;
  collector_number: string;
}

interface ScryfallCard {
  id: string;
  set: string;
  collector_number: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBatch(printings: Printing[]): Promise<ScryfallCard[]> {
  const body = JSON.stringify({
    identifiers: printings.map((p) => ({
      set: p.set_code,
      collector_number: p.collector_number,
    })),
  });
  const response = await fetch(SCRYFALL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    console.warn(`  Scryfall ${response.status} for batch of ${printings.length} — skipping`);
    return [];
  }
  const json = (await response.json()) as { data?: ScryfallCard[]; not_found?: unknown[] };
  return Array.isArray(json.data) ? json.data : [];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set in .env.local");
    process.exit(1);
  }

  const db = drizzle(databaseUrl);
  const started = Date.now();

  console.log(`\n=== backfill-scryfall-ids ${dryRun ? "(DRY-RUN)" : "(LIVE)"} ===`);
  console.log(`  Target DB: ${databaseUrl.split("@")[1]?.split("/")[0] ?? "?"}`);

  // ---- Discover unique printings with no scryfall_id ----------------------
  const printingsResult = await db.execute<Printing>(sql`
    SELECT DISTINCT set_code, collector_number
    FROM cards
    WHERE scryfall_id IS NULL
    ORDER BY set_code, collector_number
  `);
  const printings: Printing[] = printingsResult.rows ?? (printingsResult as unknown as Printing[]);
  const totalPrintings = printings.length;

  const rowCountResult = await db.execute<{ count: string }>(sql`
    SELECT count(*)::text AS count FROM cards WHERE scryfall_id IS NULL
  `);
  const rowsBefore = parseInt(
    (rowCountResult.rows ?? (rowCountResult as unknown as Array<{ count: string }>))[0]?.count ?? "0",
    10,
  );

  console.log(`  Rows with scryfall_id IS NULL: ${rowsBefore}`);
  console.log(`  Unique printings to look up:   ${totalPrintings}`);

  if (totalPrintings === 0) {
    console.log("  Nothing to backfill. Exiting.");
    return;
  }

  // ---- Batch + fetch from Scryfall ----------------------------------------
  const matches = new Map<string, string>(); // `${set}-${num}` -> scryfall_id
  const notFound: Printing[] = [];

  const batchCount = Math.ceil(totalPrintings / BATCH_SIZE);
  for (let i = 0; i < totalPrintings; i += BATCH_SIZE) {
    const batch = printings.slice(i, i + BATCH_SIZE);
    const batchNum = i / BATCH_SIZE + 1;
    process.stdout.write(`  Batch ${batchNum}/${batchCount} (${batch.length} printings)... `);
    const data = await fetchBatch(batch);
    const matched = new Set<string>();
    for (const card of data) {
      const key = `${card.set}-${card.collector_number}`;
      matches.set(key, card.id);
      matched.add(key);
    }
    for (const p of batch) {
      const key = `${p.set_code}-${p.collector_number}`;
      if (!matched.has(key)) notFound.push(p);
    }
    console.log(`${data.length} matched, ${batch.length - data.length} not_found`);
    if (i + BATCH_SIZE < totalPrintings) await sleep(RATE_LIMIT_MS);
  }

  console.log(`\n  Scryfall lookup complete:`);
  console.log(`    matched:   ${matches.size}/${totalPrintings}`);
  console.log(`    not_found: ${notFound.length}`);

  // ---- Dry-run: print sample and exit -------------------------------------
  if (dryRun) {
    console.log(`\n  DRY-RUN: would UPDATE rows for ${matches.size} printings.`);
    const sample = [...matches.entries()].slice(0, 5);
    console.log(`  Sample mappings (first 5):`);
    for (const [key, id] of sample) {
      console.log(`    ${key.padEnd(15)} → ${id}`);
    }
    if (notFound.length > 0) {
      console.log(`\n  not_found sample (first 5):`);
      for (const p of notFound.slice(0, 5)) {
        console.log(`    ${p.set_code}-${p.collector_number}`);
      }
    }
    const ms = Date.now() - started;
    console.log(`\n  Done (${(ms / 1000).toFixed(1)}s). Re-run without --dry-run to apply.`);
    return;
  }

  // ---- Live: UPDATE per matched printing ----------------------------------
  console.log(`\n  Applying UPDATEs...`);
  let totalRowsUpdated = 0;
  let printingsApplied = 0;
  for (const [key, scryfallId] of matches) {
    const idx = key.indexOf("-");
    const setCode = key.slice(0, idx);
    const collectorNumber = key.slice(idx + 1);
    const result = await db.execute(sql`
      UPDATE cards
      SET scryfall_id = ${scryfallId}
      WHERE set_code = ${setCode}
        AND collector_number = ${collectorNumber}
        AND scryfall_id IS NULL
    `);
    const updated = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    totalRowsUpdated += updated;
    printingsApplied++;
    if (printingsApplied % 50 === 0) {
      console.log(`    ${printingsApplied}/${matches.size} printings applied (${totalRowsUpdated} rows so far)`);
    }
  }

  // ---- Final stats --------------------------------------------------------
  const afterRowsResult = await db.execute<{ count: string }>(sql`
    SELECT count(*)::text AS count FROM cards WHERE scryfall_id IS NULL
  `);
  const rowsAfter = parseInt(
    (afterRowsResult.rows ?? (afterRowsResult as unknown as Array<{ count: string }>))[0]?.count ?? "0",
    10,
  );

  const ms = Date.now() - started;
  console.log(`\n  === BACKFILL COMPLETE ===`);
  console.log(`    printings updated: ${printingsApplied}`);
  console.log(`    rows updated:      ${totalRowsUpdated}`);
  console.log(`    rows before NULL:  ${rowsBefore}`);
  console.log(`    rows after NULL:   ${rowsAfter}  (${rowsBefore - rowsAfter} populated)`);
  console.log(`    not_found:         ${notFound.length} printings (those rows remain NULL)`);
  console.log(`    duration:          ${(ms / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
