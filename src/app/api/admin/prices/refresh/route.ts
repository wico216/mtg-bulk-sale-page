import { requireAdmin } from "@/lib/auth/admin-check";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";
import {
  PriceRefreshLockedError,
  runPriceRefresh,
} from "@/lib/price-refresh";

/**
 * Phase 23 Plan 23-01 — Admin manual price refresh.
 *
 * Auth: `requireAdmin()` first (Phase 15 invariant — auth before rate-limit
 * so a 401 is never hidden behind a 429). Rate-limit AFTER auth using
 * `ADMIN_BULK` (20/min). Body: empty — this POST carries no payload.
 *
 * Maps `PriceRefreshLockedError` to HTTP 409 (NOT 5xx) so the
 * `<RefreshPricesButton />` UX can show the operator a distinct
 * "Refresh in progress — try again in a moment" message vs a generic
 * "Refresh failed — check logs" message (D-03).
 *
 * No HTTP between this route and the cron route — both call
 * `runPriceRefresh()` directly per D-12.
 */

const ROUTE = "/api/admin/prices/refresh";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  // Phase 15 invariant: rate-limit AFTER auth. ADMIN_BULK is the right
  // bucket because each refresh is expensive (full inventory scan +
  // Scryfall batch fetch + chunked UPDATE). 20/min cap prevents stuck-
  // clicking operator from DDoSing Scryfall through the manual button.
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.price_refresh.rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }

  try {
    const summary = await runPriceRefresh({
      trigger: "manual",
      actorEmail: result.user.email,
    });
    logEvent({
      level: "info",
      event: "admin.price_refresh.succeeded",
      route: ROUTE,
      actor: result.user.email,
      metadata: { ...summary },
    });
    return Response.json({ success: true, ...summary });
  } catch (err) {
    // Distinct 409 mapping (not 500) so the button can show the operator
    // "try again in a moment" vs "check logs" per D-03. Lock contention is
    // expected behavior under cron-vs-manual race, not a server failure.
    if (err instanceof PriceRefreshLockedError) {
      logEvent({
        level: "info",
        event: "admin.price_refresh.locked",
        route: ROUTE,
        actor: result.user.email,
      });
      return Response.json(
        { error: "Refresh in progress" },
        { status: 409 },
      );
    }
    logError({
      event: "admin.price_refresh.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
    });
    return Response.json(
      { error: "Price refresh failed" },
      { status: 500 },
    );
  }
}
