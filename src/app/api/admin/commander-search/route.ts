import {
  normalizeCommanderSearchQuery,
  searchCommanderCards,
} from "@/db/commander-links";
import { requireAdmin } from "@/lib/auth/admin-check";
import { logError, logEvent } from "@/lib/logger";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";

const ROUTE = "/api/admin/commander-search";

export async function GET(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";
  if (rawQuery.trim().length < 2) {
    return Response.json({ results: [] });
  }

  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.commander_search.rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }

  let query: string;
  try {
    query = normalizeCommanderSearchQuery(rawQuery);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid commander search query" },
      { status: 400 },
    );
  }

  try {
    const results = await searchCommanderCards(query);
    return Response.json({ results });
  } catch (err) {
    logError({
      event: "admin.commander_search.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { query },
    });
    return Response.json({ error: "Failed to search commanders" }, { status: 500 });
  }
}
