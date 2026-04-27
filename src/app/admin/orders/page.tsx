import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAdminOrders } from "@/db/orders";
import { isAdminEmail } from "@/lib/auth/helpers";
import { OrdersTable } from "./_components/orders-table";

export const metadata: Metadata = {
  title: "Orders -- Viki MTG Bulk Store",
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  const resolvedSearchParams = await searchParams;
  const page = parsePositiveInt(firstParam(resolvedSearchParams.page), 1);

  try {
    const result = await getAdminOrders({ page, limit: 25 });

    return (
      <div>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Orders</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Review checkout history and open order details.
            </p>
          </div>
        </div>
        <OrdersTable result={result} />
      </div>
    );
  } catch (error) {
    console.error("[ADMIN ORDERS] Failed to load orders:", error);
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold">Orders</h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          Failed to load orders. Try refreshing the page.
        </div>
      </div>
    );
  }
}
