import { requireAdmin } from "@/lib/auth/admin-check";
import { getAdminHealthSnapshot } from "@/db/admin-health";
import { logError } from "@/lib/logger";

/**
 * Phase 15-02: Admin health surface.
 *
 * - Admin-only: returns 401/403 via `requireAdmin()` before any check runs.
 * - Configuration checks read env presence but NEVER echo values back. The
 *   response uses literal "configured" / "missing" strings.
 * - DB reachability + last order/import/audit/price-refresh timestamps come
 *   from `getAdminHealthSnapshot()`. The helper short-circuits to
 *   `database: "error"` when even SELECT 1 fails so the response stays
 *   predictable.
 *
 * Phase 23 (Plan 23-01) extensions:
 * - `cronSecret` env check (literal "configured" / "missing" only) is reported
 *   alongside the existing env checks. Top-level `ok` flips to `false` when
 *   `cronSecret === "missing"` (D-13) so deploys missing `CRON_SECRET` light
 *   up immediately on the health page.
 * - `lastPriceRefreshAt` REPLACES the retired notification-failure deferral
 *   field (D-06). The deferral row has been obsoleted; the queryable
 *   log-drain idea is now superseded by the durable `admin_audit_log` row
 *   written on every refresh.
 */

export interface AdminHealthCheckStatuses {
  database: "ok" | "error";
  authSecret: "configured" | "missing";
  googleOAuth: "configured" | "missing";
  email: "configured" | "missing";
  /**
   * Phase 23 D-13: presence-only literal for `CRON_SECRET`. Never echoes the
   * value. `/admin/health` top-level `ok` flips to `false` when missing.
   */
  cronSecret: "configured" | "missing";
}

export interface AdminHealthRecent {
  lastOrderAt: string | null;
  lastImportAt: string | null;
  lastAuditAt: string | null;
  /**
   * Phase 23 D-06: timestamp of the most recent admin_audit_log row with
   * `action='price_refresh'`. Replaces the retired notification-failure
   * deferral field.
   */
  lastPriceRefreshAt: string | null;
}

export interface AdminHealthResponse {
  ok: boolean;
  checks: AdminHealthCheckStatuses;
  recent: AdminHealthRecent;
}

function isPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function envChecks(): Omit<AdminHealthCheckStatuses, "database"> {
  const authSecret = isPresent(process.env.AUTH_SECRET) ? "configured" : "missing";
  const googleOAuth =
    isPresent(process.env.AUTH_GOOGLE_ID) && isPresent(process.env.AUTH_GOOGLE_SECRET)
      ? "configured"
      : "missing";
  const email =
    isPresent(process.env.RESEND_API_KEY) && isPresent(process.env.SELLER_EMAIL)
      ? "configured"
      : "missing";
  // Phase 23 D-13: presence-only; NEVER serialize the value.
  const cronSecret = isPresent(process.env.CRON_SECRET) ? "configured" : "missing";
  return { authSecret, googleOAuth, email, cronSecret };
}

export async function GET(_request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const envState = envChecks();

  let snapshot;
  try {
    snapshot = await getAdminHealthSnapshot();
  } catch (error) {
    logError({
      event: "admin.health.snapshot_failed",
      route: "api/admin/health",
      actor: result.user.email,
      error,
    });
    snapshot = {
      database: "error" as const,
      lastOrderAt: null,
      lastImportAt: null,
      lastAuditAt: null,
      lastPriceRefreshAt: null,
    };
  }

  const checks: AdminHealthCheckStatuses = {
    database: snapshot.database,
    authSecret: envState.authSecret,
    googleOAuth: envState.googleOAuth,
    email: envState.email,
    cronSecret: envState.cronSecret,
  };

  const ok =
    checks.database === "ok" &&
    checks.authSecret === "configured" &&
    checks.googleOAuth === "configured" &&
    checks.email === "configured" &&
    checks.cronSecret === "configured";

  const body: AdminHealthResponse = {
    ok,
    checks,
    recent: {
      lastOrderAt: snapshot.lastOrderAt,
      lastImportAt: snapshot.lastImportAt,
      lastAuditAt: snapshot.lastAuditAt,
      // Phase 23 D-06: replaces the retired notification-failure deferral.
      // The daily Vercel cron writes one admin_audit_log row per run; this
      // field surfaces the timestamp of the most recent.
      lastPriceRefreshAt: snapshot.lastPriceRefreshAt,
    },
  };

  // External HTTP-status monitors (Pingdom, Datadog HTTP checks, Vercel Uptime,
  // etc.) typically alert on status code, not body content. When the database
  // is unreachable we must surface 503 so a DB outage trips the monitor; we
  // still keep the detailed body for human/admin consumption. Env-config
  // "missing" states are intentionally NOT 503 -- a missing SELLER_EMAIL is a
  // configuration deficiency surfaced via the admin UI, not an outage.
  const status = checks.database === "error" ? 503 : 200;
  return Response.json(body, { status });
}
