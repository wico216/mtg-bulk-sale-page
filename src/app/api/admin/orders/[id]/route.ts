import { getOrderById } from "@/db/orders";
import { requireAdmin } from "@/lib/auth/admin-check";

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
