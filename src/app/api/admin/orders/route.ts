import { getAdminOrders } from "@/db/orders";
import { requireAdmin } from "@/lib/auth/admin-check";

const ORDER_STATUSES = ["pending", "confirmed", "completed"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

function parseIntegerParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStatusParam(value: string | null): OrderStatus | "all" | undefined {
  if (!value || value === "all") return undefined;
  return ORDER_STATUSES.includes(value as OrderStatus)
    ? (value as OrderStatus)
    : undefined;
}

function parseSearchParam(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function GET(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const page = parseIntegerParam(url.searchParams.get("page"), 1);
  const limit = parseIntegerParam(url.searchParams.get("limit"), 25);
  const q = parseSearchParam(url.searchParams.get("q"));
  const status = parseStatusParam(url.searchParams.get("status"));

  const data = await getAdminOrders({
    page,
    limit,
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
  });
  return Response.json(data);
}
