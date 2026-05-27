import {
  getManaBoxRemovalReport,
  manaBoxRemovalReportToCsv,
  markManaBoxItemsRemoved,
} from "@/db/manabox-removals";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  clientKeyFromRequest,
  enforceRateLimit,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logError, logEvent } from "@/lib/logger";

const ROUTE = "/api/admin/manabox-removals";
const MAX_MARK_IDS = 500;

function parseOrderItemIds(value: unknown): number[] | Response {
  if (!Array.isArray(value) || value.length === 0) {
    return Response.json(
      { error: "orderItemIds must be a non-empty array of order item ids" },
      { status: 400 },
    );
  }

  if (value.length > MAX_MARK_IDS) {
    return Response.json(
      { error: `Cannot mark more than ${MAX_MARK_IDS} order items at once` },
      { status: 400 },
    );
  }

  const ids = value.filter((id): id is number => Number.isInteger(id) && id > 0);
  if (ids.length === 0) {
    return Response.json(
      { error: "orderItemIds must be a non-empty array of order item ids" },
      { status: 400 },
    );
  }
  return ids;
}

export async function GET(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  try {
    const report = await getManaBoxRemovalReport();
    const url = new URL(request.url);
    if (url.searchParams.get("format") === "csv") {
      const csv = manaBoxRemovalReportToCsv(report);
      const date = new Date().toISOString().split("T")[0];
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="manabox-removals-${date}.csv"`,
        },
      });
    }

    return Response.json({ report });
  } catch (err) {
    logError({
      event: "admin.manabox_removals.load_failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
    });
    return Response.json({ error: "Failed to load ManaBox removal report" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_MUTATION,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.manabox_removals.rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as { orderItemIds?: unknown };
  const orderItemIds = parseOrderItemIds(payload.orderItemIds);
  if (orderItemIds instanceof Response) return orderItemIds;

  try {
    const markResult = await markManaBoxItemsRemoved({
      orderItemIds,
      audit: { actorEmail: result.user.email },
    });
    const report = await getManaBoxRemovalReport();

    logEvent({
      level: "info",
      event: "admin.manabox_removals.marked",
      route: ROUTE,
      actor: result.user.email,
      metadata: {
        requested: markResult.requestedItemIds.length,
        markedRows: markResult.markedRows,
        markedQuantity: markResult.markedQuantity,
        skipped: markResult.skippedItemIds.length,
      },
    });

    return Response.json({ success: true, result: markResult, report });
  } catch (err) {
    logError({
      event: "admin.manabox_removals.mark_failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { requested: orderItemIds.length },
    });
    return Response.json(
      { error: "Failed to mark ManaBox removals — report unchanged" },
      { status: 500 },
    );
  }
}
