import { requireAdmin } from "@/lib/auth/admin-check";
import { getAdminHealthSnapshot } from "@/db/admin-health";
import { logError } from "@/lib/logger";

/**
 * Phase 15-02: Admin health surface.
 *
 * - Admin-only: returns 401/403 via `requireAdmin()` before any check runs.
 * - Configuration checks read env presence but NEVER echo values back. The
 *   response uses literal "configured" / "missing" strings.
 * - DB reachability + last order/import/audit timestamps come from
 *   `getAdminHealthSnapshot()`. The helper short-circuits to `database: "error"`
 *   when even SELECT 1 fails so the response stays predictable.
 * - `notificationFailuresLast24h` is exposed as a structured field. It is
 *   currently `null` because Phase 15-01 emits notification.*_failed log lines
 *   to Vercel function logs and there is no queryable log source on the
 *   serverless side yet. Phase 15 CONTEXT explicitly documented this deferral.
 *   Keeping the field present (with value `null`) lets the admin page render
 *   "unknown" without a UI conditional later when the log drain lands.
 */

export interface AdminHealthCheckStatuses {
  database: "ok" | "error";
  authSecret: "configured" | "missing";
  googleOAuth: "configured" | "missing";
  email: "configured" | "missing";
}

export interface AdminHealthRecent {
  lastOrderAt: string | null;
  lastImportAt: string | null;
  lastAuditAt: string | null;
  notificationFailuresLast24h: number | null;
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
  return { authSecret, googleOAuth, email };
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
    };
  }

  const checks: AdminHealthCheckStatuses = {
    database: snapshot.database,
    authSecret: envState.authSecret,
    googleOAuth: envState.googleOAuth,
    email: envState.email,
  };

  const ok =
    checks.database === "ok" &&
    checks.authSecret === "configured" &&
    checks.googleOAuth === "configured" &&
    checks.email === "configured";

  const body: AdminHealthResponse = {
    ok,
    checks,
    recent: {
      lastOrderAt: snapshot.lastOrderAt,
      lastImportAt: snapshot.lastImportAt,
      lastAuditAt: snapshot.lastAuditAt,
      // D-deferred: queryable notification-failure log source is not built yet.
      // See 15-01 SUMMARY "Known Limitations / Deferred Observability".
      notificationFailuresLast24h: null,
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
