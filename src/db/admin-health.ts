import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Phase 15-02: Operational health snapshot for the admin health surface.
 *
 * Returns DB reachability and the most recent timestamps from orders,
 * import_history, and admin_audit_log. These reads run in parallel after a
 * SELECT 1 connectivity probe. The probe is intentionally separate so a
 * connection failure produces ONE clear "database error" signal rather than
 * cascading per-table failures.
 *
 * Phase 23 (Plan 23-01 D-06): a fourth parallel read fetches
 * `MAX(created_at) WHERE action='price_refresh'` from admin_audit_log so the
 * `/admin/health` page can show `lastPriceRefreshAt` in place of the retired
 * "Notification failures (24h)" tile. The existing
 * `admin_audit_log_action_idx` covers the WHERE filter -- no new index needed.
 *
 * Secret-free by construction: this helper never reads env vars or returns
 * configuration values. Configuration presence is checked at the route layer
 * (`/api/admin/health`) so the db helper has no business touching process.env.
 */

export interface AdminHealthSnapshot {
  database: "ok" | "error";
  lastOrderAt: string | null;
  lastImportAt: string | null;
  lastAuditAt: string | null;
  /**
   * Phase 23 D-06: timestamp of the most recent admin_audit_log row with
   * `action='price_refresh'`. `null` when no refresh has run yet or when the
   * database is unreachable.
   */
  lastPriceRefreshAt: string | null;
}

function rowDateToIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    // Postgres timestamptz already arrives as an ISO string in most drivers,
    // but normalize defensively to avoid surfacing driver quirks to clients.
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

async function lastTimestamp(query: ReturnType<typeof sql>): Promise<string | null> {
  const result = await db.execute<{ last_at: Date | string | null }>(query);
  const value = result.rows[0]?.last_at ?? null;
  return rowDateToIso(value);
}

export async function getAdminHealthSnapshot(): Promise<AdminHealthSnapshot> {
  // Probe DB connectivity first. If this fails we know the per-table reads
  // would also fail; short-circuit with a single clear error signal.
  try {
    await db.execute(sql`SELECT 1 AS ok`);
  } catch {
    return {
      database: "error",
      lastOrderAt: null,
      lastImportAt: null,
      lastAuditAt: null,
      lastPriceRefreshAt: null,
    };
  }

  const [lastOrderAt, lastImportAt, lastAuditAt, lastPriceRefreshAt] =
    await Promise.all([
      lastTimestamp(sql`SELECT MAX(created_at) AS last_at FROM orders`),
      lastTimestamp(
        sql`SELECT MAX(committed_at) AS last_at FROM import_history`,
      ),
      lastTimestamp(sql`SELECT MAX(created_at) AS last_at FROM admin_audit_log`),
      lastTimestamp(
        sql`SELECT MAX(created_at) AS last_at FROM admin_audit_log WHERE action = 'price_refresh'`,
      ),
    ]);

  return {
    database: "ok",
    lastOrderAt,
    lastImportAt,
    lastAuditAt,
    lastPriceRefreshAt,
  };
}
