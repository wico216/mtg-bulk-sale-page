import { timingSafeEqual } from "node:crypto";
import {
  PriceRefreshLockedError,
  runPriceRefresh,
} from "@/lib/price-refresh";
import { logEvent, logError } from "@/lib/logger";

/**
 * Phase 23 Plan 23-01 — Daily price-refresh cron endpoint.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (D-12). Fails closed when the
 * env var is unset — 401 even if the caller sent a header.
 *
 * Runtime: Node.js (advisory-lock SQL needs neon-http, which only runs under
 * the nodejs runtime — NOT the edge runtime).
 *
 * maxDuration = 300s (D-18). Vercel Hobby 2026 default with fluid compute is
 * 300s; ~26s cold-cache refresh has 11x headroom.
 *
 * Vercel cron delivery is at-least-once (PITFALLS Pitfall 14). The shared
 * service's advisory lock single-flights cron-vs-manual and cron-vs-cron;
 * a double-delivered cron event maps to a quiet 200 with `reason: "locked"`
 * so the cron run history does not show repeated 5xx alarm noise.
 *
 * NEVER:
 *   - Log the Authorization header value or `process.env.CRON_SECRET`
 *     (PITFALLS Security Mistakes; `logger.ts` redaction keys on
 *     password/secret/token/authorization but the header value lives in
 *     `Authorization: Bearer ...` — defense-in-depth says don't pass it).
 *   - Gate with an admin session here (no admin session on a cron caller).
 *   - Apply a rate-limit here (single trusted caller — Vercel scheduler).
 */

const ROUTE = "/api/cron/refresh-prices";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Constant-time Bearer-header comparison (REVIEW WR-01). The raw `!==`
 * we previously used short-circuits at the first differing byte, leaking
 * timing about the secret's prefix. Remote-timing attacks against a
 * V8 string compare across a network are practically infeasible for a
 * 256-bit hex secret, but defense-in-depth says use the constant-time
 * primitive that already ships with Node.
 *
 * Length-equalize first: `timingSafeEqual` requires equal-length buffers
 * and throws otherwise (its constant-time guarantee is conditional on
 * that precondition). A mismatched length is always a fail-fast 401 — we
 * deliberately reveal a length-bucket signal here rather than padding
 * because the Authorization header's shape ("Bearer <hex>") is
 * well-known and the secret's length (`hex 32` -> 64 chars -> "Bearer "
 * + 64 = 71 byte string) is not the secret material itself.
 */
function bearerMatches(
  authHeader: string | null,
  secret: string,
): boolean {
  if (!authHeader) return false;
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // D-12: fail closed when env unset. The `!cronSecret` clause means a
  // production deploy without CRON_SECRET set returns 401 to every cron
  // event — better an audible 401 than a silent unauthenticated refresh.
  if (!cronSecret || !bearerMatches(authHeader, cronSecret)) {
    logEvent({
      level: "warn",
      event: "cron.refresh_prices.unauthorized",
      route: ROUTE,
    });
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runPriceRefresh({ trigger: "cron" });
    logEvent({
      level: "info",
      event: "cron.refresh_prices.succeeded",
      route: ROUTE,
      metadata: { ...summary },
    });
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    // PriceRefreshLockedError is the expected single-flight contention
    // signal (cron-vs-manual race, or Vercel double-delivery). Return a
    // quiet 200 so the cron run history doesn't accumulate fake 5xx events.
    if (err instanceof PriceRefreshLockedError) {
      logEvent({
        level: "info",
        event: "cron.refresh_prices.locked",
        route: ROUTE,
      });
      return Response.json({ ok: false, reason: "locked" }, { status: 200 });
    }
    logError({
      event: "cron.refresh_prices.failed",
      route: ROUTE,
      error: err,
    });
    return Response.json(
      { ok: false, error: "Refresh failed" },
      { status: 500 },
    );
  }
}
