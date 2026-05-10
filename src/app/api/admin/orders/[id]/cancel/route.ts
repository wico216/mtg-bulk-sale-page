import { cancelOrder } from "@/db/orders";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";

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
  if (rateLimited) return rateLimited;

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

  const cancellation = await cancelOrder({
    orderId: id,
    restoreInventory,
    audit: { actorEmail: result.user.email },
  });

  if (!cancellation.ok) {
    return Response.json(
      { error: cancellation.message, code: cancellation.code },
      { status: cancellation.code === "not_found" ? 404 : 409 },
    );
  }

  return Response.json({ success: true, result: cancellation });
}
