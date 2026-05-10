import { getOrderById, updateOrderWorkflow } from "@/db/orders";
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";

const ORDER_STATUSES = ["pending", "confirmed", "completed"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];
const MAX_INTERNAL_NOTE_LENGTH = 1000;

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUSES.includes(value as OrderStatus);
}

function parseAdminNote(value: unknown): string | null | undefined | Response {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    return Response.json({ error: "Internal note must be a string" }, { status: 400 });
  }
  if (value.length > MAX_INTERNAL_NOTE_LENGTH) {
    return Response.json(
      { error: "Internal note must be 1000 characters or fewer" },
      { status: 400 },
    );
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  return Response.json({ order });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

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

  const payload = body as { status?: unknown; adminNote?: unknown };
  const updates: { orderId: string; status?: OrderStatus; adminNote?: string | null } = {
    orderId: id,
  };

  if (payload.status !== undefined) {
    if (!isOrderStatus(payload.status)) {
      return Response.json(
        { error: "Invalid status. Must be one of: pending, confirmed, completed" },
        { status: 400 },
      );
    }
    updates.status = payload.status;
  }

  if ("adminNote" in payload) {
    const adminNote = parseAdminNote(payload.adminNote);
    if (adminNote instanceof Response) return adminNote;
    updates.adminNote = adminNote;
  }

  if (updates.status === undefined && !("adminNote" in updates)) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const order = await updateOrderWorkflow({
    ...updates,
    audit: { actorEmail: result.user.email },
  });
  if (!order) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  return Response.json({ success: true, order });
}
