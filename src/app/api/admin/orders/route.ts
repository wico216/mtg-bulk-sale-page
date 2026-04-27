import { getAdminOrders } from "@/db/orders";
import { requireAdmin } from "@/lib/auth/admin-check";

function parseIntegerParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const page = parseIntegerParam(url.searchParams.get("page"), 1);
  const limit = parseIntegerParam(url.searchParams.get("limit"), 25);

  const data = await getAdminOrders({ page, limit });
  return Response.json(data);
}
