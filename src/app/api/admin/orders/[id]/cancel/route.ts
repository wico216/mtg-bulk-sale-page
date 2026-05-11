import { cancelOrder } from "@/db/orders";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";

const ROUTE = "/api/admin/orders/[id]/cancel";

function parseRestoreInventory(value: unknown): boolean | Response {
  if (typeof value !== "boolean") {
    return Response.json(
      { error: "restoreInventory must be a boolean" },
      { status: 400 },
    );
  }
  return value;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  // Cancellation can restore inventory, so it's a state-changing mutation.
  // Apply the admin-mutation bucket AFTER auth.
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_MUTATION,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.order_cancel.rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const restoreInventory = parseRestoreInventory(
    (body as { restoreInventory?: unknown }).restoreInventory,
  );
  if (restoreInventory instanceof Response) return restoreInventory;

  try {
    const cancellation = await cancelOrder({
      orderId: id,
      restoreInventory,
      audit: { actorEmail: result.user.email },
    });

    if (!cancellation.ok) {
      logEvent({
        level: "warn",
        event: "admin.order_cancel.rejected",
        route: ROUTE,
        actor: result.user.email,
        metadata: { orderId: id, code: cancellation.code },
      });
      return Response.json(
        { error: cancellation.message, code: cancellation.code },
        { status: cancellation.code === "not_found" ? 404 : 409 },
      );
    }

    logEvent({
      level: "info",
      event: "admin.order_cancel.succeeded",
      route: ROUTE,
      actor: result.user.email,
      metadata: {
        orderId: id,
        restoreInventory,
        alreadyCancelled: cancellation.alreadyCancelled,
        restoredQuantity: cancellation.restoredQuantity,
        restoredRows: cancellation.restoredRows,
      },
    });

    return Response.json({ success: true, result: cancellation });
  } catch (err) {
    logError({
      event: "admin.order_cancel.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: { orderId: id, restoreInventory },
    });
    // CR-04: match the "5xx -> JSON" invariant the rest of the admin routes
    // uphold (bulk-delete, delete-all, import-commit). Re-throwing surfaces
    // Next's default HTML error page and breaks any fetch(...).json() caller.
    return Response.json(
      { error: "Order cancellation failed — order unchanged" },
      { status: 500 },
    );
  }
}
