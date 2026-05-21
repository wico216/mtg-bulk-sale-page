#!/usr/bin/env tsx
/**
 * One-shot backfill: populate cards.mana_cost from Scryfall.
 *
 * Same shape as scripts/backfill-scryfall-ids.ts (which populated
 * cards.scryfall_id earlier this session). Each Scryfall printing has ONE
 * mana_cost; multiple cards rows (finish × condition × binder) share the
 * same scryfall_id and therefore the same mana_cost. We batch-fetch by
 * scryfall_id and UPDATE rows grouped by it.
 *
 * USAGE
 *   npm run backfill:mana-cost:dry-run   (preview only — no DB writes)
 *   npm run backfill:mana-cost           (live — writes to DATABASE_URL)
 *
 * DESIGN
 *   - Distinct on scryfall_id (Phase 17 D-07 — N rows per printing share id).
 *   - /cards/collection batch endpoint, 75 ids per POST.
 *   - 250 ms gate between batches (matches src/lib/scryfall.ts spacing).
 *   - WHERE mana_cost IS NULL on each UPDATE — idempotent. Reruns no-op.
 *   - mana_cost stored verbatim from Scryfall (e.g. "{1}{R}", "{X}{W}").
 *     Double-faced cards: front and back joined as "<front> // <back>".
 */
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { config } from "dotenv";

config({ path: ".env.local" });

const BATCH_SIZE = 75;
const RATE_LIMIT_MS = 250;
const SCRYFALL_URL = "https://api.scryfall.com/cards/collection";

interface ScryfallIdRow extends Record<string, unknown> {
  scryfall_id: string;
}

interface CountRow extends Record<string, unknown> {
  count: string;
}

interface ScryfallCardLite {
  id: string;
  mana_cost?: string;
  card_faces?: Array<{ mana_cost?: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors getManaCost in src/lib/enrichment.ts. Double-faced cards keep both
// faces' costs joined by " // " (Scryfall's own notation).
function extractManaCost(card: ScryfallCardLite): string | null {
  if (typeof card.mana_cost === "string") return card.mana_cost;
  const faceCosts =
    card.card_faces
      ?.map((face) => (typeof face.mana_cost === "string" ? face.mana_cost : null))
      .filter((v): v is string => v !== null) ?? [];
  return faceCosts.length > 0 ? faceCosts.join(" // ") : null;
}

async function fetchBatch(ids: string[]): Promise<ScryfallCardLite[]> {
  const body = JSON.stringify({ identifiers: ids.map((id) => ({ id })) });
  const response = await fetch(SCRYFALL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    console.warn(`  Scryfall ${response.status} for batch of ${ids.length} — skipping`);
    return [];
  }
  const json = (await response.json()) as { data?: ScryfallCardLite[] };
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

  console.log(`\n=== backfill-mana-cost ${dryRun ? "(DRY-RUN)" : "(LIVE)"} ===`);
  console.log(`  Target DB: ${databaseUrl.split("@")[1]?.split("/")[0] ?? "?"}`);

  // Pre-flight: confirm the column exists (the migration must run first).
  const columnCheck = await db.execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'mana_cost'`,
  );
  const colRows =
    (columnCheck as unknown as { rows?: unknown[] }).rows ??
    (columnCheck as unknown as unknown[]);
  if (!Array.isArray(colRows) || colRows.length === 0) {
    console.error("  cards.mana_cost column not present. Run `npm run migrate:mana-cost` first.");
    process.exit(1);
  }

  const distinctIdsResult = await db.execute<ScryfallIdRow>(sql`
    SELECT DISTINCT scryfall_id
    FROM cards
    WHERE mana_cost IS NULL
      AND scryfall_id IS NOT NULL
    ORDER BY scryfall_id
  `);
  const distinctIds =
    distinctIdsResult.rows ?? (distinctIdsResult as unknown as ScryfallIdRow[]);
  const total = distinctIds.length;

  const rowCountResult = await db.execute<CountRow>(sql`
    SELECT count(*)::text AS count FROM cards WHERE mana_cost IS NULL
  `);
  const rowsBefore = parseInt(
    (rowCountResult.rows ?? (rowCountResult as unknown as CountRow[]))[0]?.count ?? "0",
    10,
  );

  console.log(`  Rows with mana_cost IS NULL: ${rowsBefore}`);
  console.log(`  Distinct scryfall_ids to look up: ${total}`);

  if (total === 0) {
    console.log("  Nothing to backfill. Exiting.");
    return;
  }

  // Batched Scryfall fetch.
  const matches = new Map<string, string | null>();
  const batchCount = Math.ceil(total / BATCH_SIZE);
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = distinctIds.slice(i, i + BATCH_SIZE).map((r) => r.scryfall_id);
    const batchNum = i / BATCH_SIZE + 1;
    process.stdout.write(`  Batch ${batchNum}/${batchCount} (${batch.length} ids)... `);
    const data = await fetchBatch(batch);
    for (const card of data) {
      matches.set(card.id, extractManaCost(card));
    }
    const matchedHere = data.length;
    console.log(`${matchedHere} matched, ${batch.length - matchedHere} not_found`);
    if (i + BATCH_SIZE < total) await sleep(RATE_LIMIT_MS);
  }

  const matched = matches.size;
  const notFound = total - matched;
  console.log(`\n  Scryfall lookup complete:`);
  console.log(`    matched:   ${matched}/${total}`);
  console.log(`    not_found: ${notFound}`);

  if (dryRun) {
    const sample = [...matches.entries()].slice(0, 8);
    console.log(`\n  DRY-RUN: would UPDATE rows for ${matched} scryfall_ids.`);
    console.log(`  Sample mappings (first 8):`);
    for (const [id, cost] of sample) {
      console.log(`    ${id} → ${cost === null ? "(null — land or unresolved)" : cost}`);
    }
    const ms = Date.now() - started;
    console.log(`\n  Done (${(ms / 1000).toFixed(1)}s). Re-run without --dry-run to apply.`);
    return;
  }

  console.log(`\n  Applying UPDATEs...`);
  let totalRowsUpdated = 0;
  let applied = 0;
  for (const [scryfallId, manaCost] of matches) {
    // mana_cost can legitimately be "" (lands) — store the empty string so
    // the field is "known empty" rather than "unknown null". We only skip
    // writes when extractManaCost returned null (no face had a mana_cost).
    if (manaCost === null) {
      applied++;
      continue;
    }
    const result = await db.execute(sql`
      UPDATE cards
      SET mana_cost = ${manaCost}
      WHERE scryfall_id = ${scryfallId}
        AND mana_cost IS NULL
    `);
    const updated = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    totalRowsUpdated += updated;
    applied++;
    if (applied % 100 === 0) {
      console.log(`    ${applied}/${matched} scryfall_ids applied (${totalRowsUpdated} rows so far)`);
    }
  }

  const afterRowsResult = await db.execute<CountRow>(sql`
    SELECT count(*)::text AS count FROM cards WHERE mana_cost IS NULL
  `);
  const rowsAfter = parseInt(
    (afterRowsResult.rows ?? (afterRowsResult as unknown as CountRow[]))[0]?.count ?? "0",
    10,
  );

  const ms = Date.now() - started;
  console.log(`\n  === BACKFILL COMPLETE ===`);
  console.log(`    scryfall_ids applied: ${applied}`);
  console.log(`    rows updated:         ${totalRowsUpdated}`);
  console.log(`    rows before NULL:     ${rowsBefore}`);
  console.log(`    rows after NULL:      ${rowsAfter}  (${rowsBefore - rowsAfter} populated)`);
  console.log(`    not_found:            ${notFound} (those rows remain NULL)`);
  console.log(`    duration:             ${(ms / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
