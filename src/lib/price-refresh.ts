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
 *   - D-08: Single-flight cron-vs-manual + Vercel double-delivery. Originally
 *     specified as a Postgres advisory lock, but `pg_advisory_lock` is
 *     session-scoped and the neon-http driver opens a fresh HTTP session
 *     for every `db.execute()` call — the lock would be released BEFORE
 *     the actual refresh work runs (Phase 23 REVIEW.md CR-01). Replaced
 *     with a row-based lease in `price_refresh_lock` that survives across
 *     per-statement sessions. See ACQUIRE_LOCK_SQL below.
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

const UPDATE_CHUNK_SIZE = 500;

/**
 * Stale-lease threshold for `price_refresh_lock` recovery. If a previous
 * `runPriceRefresh` call crashed before reaching the `finally` release step,
 * the row will linger past this threshold and the next caller's atomic
 * `INSERT ... ON CONFLICT DO UPDATE WHERE acquired_at < (NOW() - INTERVAL)`
 * upsert will take it over. 10 minutes is comfortably > the longest
 * observed refresh duration (~26s cold cache, target ceiling 300s per
 * `maxDuration` on the route handlers) but short enough that an actually-
 * stuck lease doesn't block the next cron firing window (daily at 09:00 UTC).
 */
const LOCK_STALE_AFTER_MINUTES = 10;

let lockTableEnsured = false;

/**
 * Lazily create the `price_refresh_lock` table on first call. Mirrors the
 * lazy-create pattern used by `createPostgresRateLimitStore.ensureTable()`
 * in `src/lib/rate-limit.ts` so we don't need a fresh drizzle migration to
 * deploy the CR-01 fix.
 *
 * The table has a single row (id = 1 enforced by CHECK). `acquired_at`
 * records when the current lease was taken; the next caller can take it
 * over only when `acquired_at < NOW() - INTERVAL '10 minutes'` — see
 * `acquireRefreshLock` below.
 */
async function ensureLockTable(): Promise<void> {
  if (lockTableEnsured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS price_refresh_lock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  lockTableEnsured = true;
}

/**
 * Atomic acquire-or-fail using a single round-trip. The CTE-free form:
 *
 *   INSERT INTO price_refresh_lock (id, acquired_at)
 *   VALUES (1, NOW())
 *   ON CONFLICT (id) DO UPDATE
 *     SET acquired_at = NOW()
 *     WHERE price_refresh_lock.acquired_at < (NOW() - INTERVAL '10 minutes')
 *   RETURNING id;
 *
 * Three outcomes, all captured in one statement (no SELECT-then-INSERT
 * race window):
 *   1. Row doesn't exist → INSERT, RETURNING { id: 1 } → acquired.
 *   2. Row exists, lease is stale (>10min old) → UPDATE refreshes
 *      acquired_at, RETURNING { id: 1 } → acquired (recovery path).
 *   3. Row exists, lease is fresh → UPDATE's WHERE filter rejects,
 *      no row returned → throw `PriceRefreshLockedError`.
 *
 * This is the row-based "secondary signal" pattern PITFALLS.md:466
 * names as acceptable, promoted to PRIMARY because neon-http's
 * per-statement HTTP session model makes `pg_advisory_lock` ineffective
 * (REVIEW.md CR-01).
 */
async function acquireRefreshLock(): Promise<void> {
  await ensureLockTable();
  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO price_refresh_lock (id, acquired_at)
    VALUES (1, NOW())
    ON CONFLICT (id) DO UPDATE
      SET acquired_at = NOW()
      WHERE price_refresh_lock.acquired_at <
        (NOW() - (${LOCK_STALE_AFTER_MINUTES} || ' minutes')::interval)
    RETURNING id
  `);
  if (result.rows.length === 0) {
    throw new PriceRefreshLockedError();
  }
}

/**
 * Release the lease unconditionally. Always run from a `finally` block so a
 * crashed refresh doesn't strand the row (in which case the stale-lease
 * recovery path inside `acquireRefreshLock` would still let the NEXT caller
 * take over after `LOCK_STALE_AFTER_MINUTES` — release-on-finally is
 * defense-in-depth on top of that recovery floor).
 *
 * Errors during release are swallowed: at this point the refresh work has
 * already either succeeded or failed and produced its audit row. Failing
 * the function on a release blip would surface a misleading 500 to the
 * caller; the stale-lease recovery path is the safety net.
 */
async function releaseRefreshLock(): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM price_refresh_lock WHERE id = 1`);
  } catch {
    // Best-effort. The stale-lease recovery path in acquireRefreshLock will
    // unstick the next call after LOCK_STALE_AFTER_MINUTES.
  }
}

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
 * Thrown when `acquireRefreshLock` cannot take the `price_refresh_lock`
 * lease — another `runPriceRefresh` is already in flight (cron-vs-manual
 * race, or Vercel double-delivery per PITFALLS Pitfall 14). Route handlers
 * map this to HTTP 409 (admin manual) or a quiet 200 with
 * `{ reason: "locked" }` (cron) — the cron caller should not alarm on the
 * expected single-flight contention.
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
 * Throws `PriceRefreshLockedError` when the refresh lease is already held.
 * Re-throws any other error after best-effort logging (route handler maps
 * to HTTP 500).
 */
export async function runPriceRefresh(opts: {
  trigger: "cron" | "manual";
  actorEmail?: string | null;
}): Promise<PriceRefreshSummary> {
  const started = Date.now();

  // ---- D-08: row-based lease single-flight ---------------------------------
  // REVIEW.md CR-01: the original `pg_try_advisory_lock` design is inoperative
  // on neon-http because every `db.execute()` opens its own HTTP session and
  // `pg_advisory_lock` is session-scoped — the lock would be released BEFORE
  // any of the subsequent statements (SELECT, UPDATE, INSERT audit) run.
  // We use a row in `price_refresh_lock` instead: the row's presence IS the
  // lock, survives across per-statement sessions, and is taken atomically via
  // INSERT ... ON CONFLICT DO UPDATE with a stale-lease WHERE filter (see
  // `acquireRefreshLock` above). The lease is released in the `finally`
  // block at the bottom of this function.
  await acquireRefreshLock();
  try {
    // ---- Read every card row in scope --------------------------------------
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

    // ---- D-10: bucket rows with no scryfallId straight into `skipped` ----
    // Those rows will not be touched by either the Scryfall call or any
    // subsequent UPDATE. Their existing `cards.price` is preserved verbatim.
    const uniqueIds = Array.from(
      new Set(
        rows
          .map((r) => r.scryfallId)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
      ),
    );

    // When every row lacked a scryfallId, skip the Scryfall call entirely
    // and operate on an empty Map. `fetchCardsByScryfallIds([])` is also a
    // no-op returning an empty Map per its contract, but explicitly
    // short-circuiting here keeps the cron path zero-network when inventory
    // is fully unmapped.
    const scryfallMap: Map<string, ScryfallCard> =
      uniqueIds.length > 0
        ? await fetchCardsByScryfallIds(uniqueIds)
        : new Map<string, ScryfallCard>();

    // ---- D-09 + D-10: per-row classification -----------------------------
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
      // scryfallId but different finish receive DIFFERENT priceCents.
      // This is the bridge from the v1.2 etched-mispricing fix into the
      // refresh path.
      const scryCard = scryfallMap.get(row.scryfallId)!;
      const priceUsd = getPrice(scryCard.prices, row.finish);
      const priceCents =
        // D-14: cents conversion. `priceUsd === null` IS a legitimate
        // explicit overwrite per D-10 (Scryfall explicitly returned
        // `prices.usd === null`).
        priceUsd === null ? null : Math.round(priceUsd * 100);

      if (priceCents === row.currentPriceCents) {
        unchanged++;
        continue;
      }

      updates.push({ id: row.id, priceCents });
      updated++;
    }

    // ---- D-09: chunked UPDATE by 5-segment cards.id ----------------------
    // Build a parametrized `UPDATE ... FROM (VALUES (id, price), ...) AS
    // v(id, price) WHERE cards.id = v.id` per chunk. Drizzle `sql.join`
    // keeps every id and price value parametrized — never
    // string-concatenated into SQL.
    //
    // Join key is `cards.id` (5-segment composite PK). Updating by
    // `scryfall_id` here would re-introduce the v1.2 etched-mispricing
    // bug because the same scryfallId maps to N rows (one per finish x
    // condition x binder).
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

    // ---- D-04: one audit row, exactly six locked-scalar metadata keys ----
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
  } finally {
    // REVIEW.md CR-01: ALWAYS release the lease, even when the refresh body
    // threw. The release itself swallows DB errors (the stale-lease
    // recovery path in acquireRefreshLock is the safety net for an
    // unreleased row).
    await releaseRefreshLock();
  }
}
