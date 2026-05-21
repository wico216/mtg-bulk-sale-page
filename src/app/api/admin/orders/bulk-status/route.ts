import { updateOrderWorkflow, type OrderWorkflowStatus } from "@/db/orders";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";

const ROUTE = "/api/admin/orders/bulk-status";
const ORDER_STATUSES: readonly OrderWorkflowStatus[] = [
  "pending",
  "confirmed",
  "completed",
];
const MAX_BULK_IDS = 50;

function isOrderStatus(value: unknown): value is OrderWorkflowStatus {
  return (
    typeof value === "string" &&
    ORDER_STATUSES.includes(value as OrderWorkflowStatus)
  );
}

/**
 * Bulk workflow status update.
 *
 * Called by the pick-batch surface (`/admin/orders/pick`) when the operator
 * finishes a pick and clicks "Mark batch confirmed". The handler validates
 * the requested status, then walks the id list serially through
 * `updateOrderWorkflow` so each transition gets its own audit-log entry —
 * the same per-order audit shape an inline-row Confirm action produces. We
 * deliberately do not coalesce into a single UPDATE for that reason.
 *
 * Behaviour:
 *  - Each id is attempted independently. If updateOrderWorkflow returns
 *    null (id not found) we record it in `notFound` and keep going.
 *  - The response shape mirrors `/api/admin/cards/bulk-delete`:
 *    `{ success, updated, ids, notFound }`. `notFound` is empty in the
 *    happy path.
 */
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
      event: "admin.order_bulk_status.rate_limited",
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

  const payload = body as { ids?: unknown; status?: unknown };

  if (!isOrderStatus(payload.status)) {
    return Response.json(
      {
        error:
          "Invalid status. Must be one of: pending, confirmed, completed",
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(payload.ids) || payload.ids.length === 0) {
    return Response.json(
      { error: "ids must be a non-empty array of order references" },
      { status: 400 },
    );
  }

  if (payload.ids.length > MAX_BULK_IDS) {
    return Response.json(
      { error: `Cannot bulk-update more than ${MAX_BULK_IDS} orders at once` },
      { status: 400 },
    );
  }

  const ids = payload.ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (ids.length === 0) {
    return Response.json(
      { error: "ids must contain at least one valid string reference" },
      { status: 400 },
    );
  }

  const updatedIds: string[] = [];
  const notFound: string[] = [];

  try {
    for (const id of ids) {
      const order = await updateOrderWorkflow({
        orderId: id,
        status: payload.status,
        audit: {
          actorEmail: result.user.email,
          metadata: { batch: true, batchSize: ids.length },
        },
      });
      if (order) {
        updatedIds.push(id);
      } else {
        notFound.push(id);
      }
    }

    logEvent({
      level: "info",
      event: "admin.order_bulk_status.updated",
      route: ROUTE,
      actor: result.user.email,
      metadata: {
        status: payload.status,
        updated: updatedIds.length,
        notFound: notFound.length,
      },
    });

    return Response.json({
      success: true,
      updated: updatedIds.length,
      ids: updatedIds,
      notFound,
    });
  } catch (err) {
    logError({
      event: "admin.order_bulk_status.failed",
      route: ROUTE,
      actor: result.user.email,
      error: err,
      metadata: {
        attempted: ids.length,
        updated: updatedIds.length,
      },
    });
    return Response.json(
      {
        error: "Bulk status update partially failed",
        updated: updatedIds.length,
        ids: updatedIds,
      },
      { status: 500 },
    );
  }
}
