import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { cards } from "@/db/schema";
import { fetchCardsByScryfallIds } from "@/lib/scryfall";
import type { ScryfallCard } from "@/lib/types";
import { getPrice } from "@/lib/enrichment";
import { createAdminAuditEntry } from "@/db/queries";
import { logEvent } from "@/lib/logger";

/**
 * Phase 23 Plan 23-01 — Daily price refresh shared service.
 *
 * Server-only. Auth-agnostic. Called from two thin route handlers:
 *   - GET /api/cron/refresh-prices (Bearer-token auth, Vercel cron)
 *   - POST /api/admin/prices/refresh (requireAdmin + ADMIN_BULK rate-limit)
 *
 * Load-bearing invariants (per .planning/phases/23-import-ux-price-refresh/23-CONTEXT.md):
 *   - D-08: Postgres advisory lock single-flights cron-vs-manual + Vercel
 *     double-delivery. Non-blocking acquire; auto-released on neon-http
 *     connection close (each request gets a fresh connection).
 *   - D-09: UPDATE by 5-segment `cards.id` composite PK. NEVER by
 *     `scryfall_id` — multiple rows (finish x condition x binder) can share
 *     a scryfall_id and need finish-aware prices applied per row. Updating
 *     by scryfall_id would re-introduce the v1.2 etched-mispricing bug.
 *   - D-10: Skip rows with no `scryfallId` (`skipped++`); on Scryfall
 *     `not_found` (id absent from response Map) preserve existing price
 *     (`failed++`, do NOT write NULL); only write NULL when Scryfall
 *     explicitly returned `prices.usd === null`.
 *   - D-14: `cards.price` is integer cents — `Math.round(usd * 100)`.
 *   - D-04: Audit metadata is exactly
 *     `{ trigger, updated, unchanged, failed, skipped, durationMs }` — only
 *     locked scalars. Per-card failure detail flows through `logEvent` so
 *     the 4KB audit cap is preserved.
 *   - D-12: Auth-agnostic. Route handlers gate access; this module never
 *     reads session state or env vars (except via shared `db` client).
 */

const ADVISORY_LOCK_KEY = "cron.refresh_prices";
const UPDATE_CHUNK_SIZE = 500;

/**
 * Result summary returned from a successful refresh run. Also the exact shape
 * of the audit metadata object (six locked scalars; D-04).
 */
export interface PriceRefreshSummary {
  trigger: "cron" | "manual";
  updated: number;
  unchanged: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

/**
 * Thrown when `pg_try_advisory_lock` returns false — another `runPriceRefresh`
 * is already in flight (cron-vs-manual race, or Vercel double-delivery per
 * PITFALLS Pitfall 14). Route handlers map this to HTTP 409 (admin manual)
 * or a quiet 200 with `{ reason: "locked" }` (cron) — the cron caller should
 * not alarm on the expected single-flight contention.
 */
export class PriceRefreshLockedError extends Error {
  constructor() {
    super("Price refresh already in progress");
    this.name = "PriceRefreshLockedError";
  }
}

/**
 * Refresh `cards.price` for every row that has a `scryfallId`, using the
 * per-finish ladder from `getPrice(prices, finish)`. Writes exactly one
 * `admin_audit_log` row with `action='price_refresh'` and bounded metadata.
 *
 * Caller contract:
 *   - `trigger` MUST be set by the route handler (`"cron"` or `"manual"`).
 *   - `actorEmail` is `null` for cron, the admin session email for manual.
 *
 * Throws `PriceRefreshLockedError` when the advisory lock is already held.
 * Re-throws any other error after best-effort logging (route handler maps
 * to HTTP 500).
 */
export async function runPriceRefresh(opts: {
  trigger: "cron" | "manual";
  actorEmail?: string | null;
}): Promise<PriceRefreshSummary> {
  const started = Date.now();

  // ---- D-08: Postgres advisory lock single-flight --------------------------
  // `hashtext(...)` reduces an arbitrary string key to a 32-bit int that
  // `pg_try_advisory_lock(bigint)` accepts. Non-blocking — returns false
  // immediately when another session holds the lock. Auto-released at end
  // of the neon-http connection (one fresh session per request); we do NOT
  // pair this with `pg_advisory_unlock` because there's no shared session
  // to release from (PITFALLS Performance Traps).
  const lockResult = await db.execute<{ acquired: boolean }>(
    sql`SELECT pg_try_advisory_lock(hashtext(${ADVISORY_LOCK_KEY})) AS acquired`,
  );
  const acquired = lockResult.rows[0]?.acquired;
  if (acquired !== true) {
    throw new PriceRefreshLockedError();
  }

  // ---- Read every card row in scope ----------------------------------------
  // Select only the columns we need (id for the UPDATE key; scryfallId to
  // call Scryfall; finish for the per-row price ladder; current price to
  // bucket unchanged rows correctly).
  const rows = await db
    .select({
      id: cards.id,
      scryfallId: cards.scryfallId,
      finish: cards.finish,
      currentPriceCents: cards.price,
    })
    .from(cards);

  // ---- D-10: bucket rows with no scryfallId straight into `skipped` --------
  // Those rows will not be touched by either the Scryfall call or any
  // subsequent UPDATE. Their existing `cards.price` is preserved verbatim.
  const uniqueIds = Array.from(
    new Set(
      rows
        .map((r) => r.scryfallId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  // When every row lacked a scryfallId, skip the Scryfall call entirely and
  // operate on an empty Map. `fetchCardsByScryfallIds([])` is also a no-op
  // returning an empty Map per its contract, but explicitly short-circuiting
  // here keeps the cron path zero-network when inventory is fully unmapped.
  const scryfallMap: Map<string, ScryfallCard> =
    uniqueIds.length > 0
      ? await fetchCardsByScryfallIds(uniqueIds)
      : new Map<string, ScryfallCard>();

  // ---- D-09 + D-10: per-row classification ---------------------------------
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let skipped = 0;
  const updates: Array<{ id: string; priceCents: number | null }> = [];

  for (const row of rows) {
    if (!row.scryfallId) {
      // D-10: no scryfallId → skip entirely (preserve existing price).
      skipped++;
      continue;
    }
    if (!scryfallMap.has(row.scryfallId)) {
      // D-10: Scryfall returned `not_found` → preserve existing price.
      // NEVER write NULL here. Per-card detail flows through the logger
      // (D-04 keeps audit metadata bounded to locked scalars only).
      failed++;
      logEvent({
        level: "info",
        event: "price_refresh.not_found",
        route: "lib/price-refresh",
        metadata: { cardId: row.id, scryfallId: row.scryfallId },
      });
      continue;
    }

    // D-09: per-row, per-finish price ladder. Two rows with the same
    // scryfallId but different finish receive DIFFERENT priceCents. This is
    // the bridge from the v1.2 etched-mispricing fix into the refresh path.
    const scryCard = scryfallMap.get(row.scryfallId)!;
    const priceUsd = getPrice(scryCard.prices, row.finish);
    const priceCents =
      // D-14: cents conversion. `priceUsd === null` IS a legitimate explicit
      // overwrite per D-10 (Scryfall explicitly returned `prices.usd === null`).
      priceUsd === null ? null : Math.round(priceUsd * 100);

    if (priceCents === row.currentPriceCents) {
      unchanged++;
      continue;
    }

    updates.push({ id: row.id, priceCents });
    updated++;
  }

  // ---- D-09: chunked UPDATE by 5-segment cards.id --------------------------
  // Build a parametrized `UPDATE ... FROM (VALUES (id, price), ...) AS v(id, price)
  // WHERE cards.id = v.id` per chunk. Drizzle `sql.join` keeps every id and
  // price value parametrized — never string-concatenated into SQL.
  //
  // Join key is `cards.id` (5-segment composite PK). Updating by `scryfall_id`
  // here would re-introduce the v1.2 etched-mispricing bug because the same
  // scryfallId maps to N rows (one per finish x condition x binder).
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE);
    const valuesSql = sql.join(
      chunk.map((u) => sql`(${u.id}::text, ${u.priceCents}::integer)`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE cards
      SET price = v.price,
          updated_at = NOW()
      FROM (VALUES ${valuesSql}) AS v(id, price)
      WHERE cards.id = v.id
    `);
  }

  const durationMs = Date.now() - started;

  // ---- D-04: one audit row, exactly six locked-scalar metadata keys --------
  // Only the six scalars below — no per-card failure arrays, no sample
  // payloads — per-card detail already flowed through `logEvent` at the
  // not_found branch above.
  await createAdminAuditEntry({
    action: "price_refresh",
    actorEmail: opts.actorEmail ?? null,
    targetType: "inventory",
    targetId: null,
    targetCount: updated,
    metadata: {
      trigger: opts.trigger,
      updated,
      unchanged,
      failed,
      skipped,
      durationMs,
    },
  });

  return {
    trigger: opts.trigger,
    updated,
    unchanged,
    failed,
    skipped,
    durationMs,
  };
}
