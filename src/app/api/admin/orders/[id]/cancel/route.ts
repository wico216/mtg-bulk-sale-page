import { cancelOrder } from "@/db/orders";
import { requireAdmin } from "@/lib/auth/admin-check";

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

  const cancellation = await cancelOrder({ orderId: id, restoreInventory });

  if (!cancellation.ok) {
    return Response.json(
      { error: cancellation.message, code: cancellation.code },
      { status: cancellation.code === "not_found" ? 404 : 409 },
    );
  }

  return Response.json({ success: true, result: cancellation });
}
