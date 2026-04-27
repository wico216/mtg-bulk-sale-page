import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAdminOrders, type OrderStatus } from "@/db/orders";
import { isAdminEmail } from "@/lib/auth/helpers";
import { OrdersTable } from "./_components/orders-table";

export const metadata: Metadata = {
  title: "Orders -- Viki MTG Bulk Store",
};

export const dynamic = "force-dynamic";

const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "completed",
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSearch(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseStatus(value: string | undefined): OrderStatus | "all" {
  if (!value || value === "all") return "all";
  return ORDER_STATUSES.includes(value as OrderStatus)
    ? (value as OrderStatus)
    : "all";
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
  const q = parseSearch(firstParam(resolvedSearchParams.q));
  const status = parseStatus(firstParam(resolvedSearchParams.status));

  try {
    const result = await getAdminOrders({
      page,
      limit: 25,
      ...(q ? { q } : {}),
      ...(status !== "all" ? { status } : {}),
    });

    return (
      <div>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Orders</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Review checkout history, find buyers, and manage order workflow.
            </p>
          </div>

          <form action="/admin/orders" className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="q">
              Search orders
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Search ref, buyer, or email..."
              className="min-w-[260px] rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />

            <label className="sr-only" htmlFor="status">
              Filter by status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
            </select>

            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              Filter
            </button>

            {(q || status !== "all") && (
              <a
                href="/admin/orders"
                className="rounded-md border border-zinc-300 px-4 py-2 text-center text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Clear
              </a>
            )}
          </form>
        </div>

        <OrdersTable result={result} q={q} status={status} />
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
