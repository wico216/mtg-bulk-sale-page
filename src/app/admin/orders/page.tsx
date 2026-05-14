import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getAdminOrders,
  getAdminOrderStatusCounts,
  type OrderStatus,
} from "@/db/orders";
import { isAdminEmail } from "@/lib/auth/helpers";
import { OrdersTable } from "./_components/orders-table";

export const metadata: Metadata = {
  title: "Orders · Viki MTG Bulk Store",
};

export const dynamic = "force-dynamic";

const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
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
    const [result, counts] = await Promise.all([
      getAdminOrders({
        page,
        limit: 25,
        ...(q ? { q } : {}),
        ...(status !== "all" ? { status } : {}),
      }),
      getAdminOrderStatusCounts({ ...(q ? { q } : {}) }),
    ]);

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--ink)",
              }}
            >
              Orders
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Review checkout history, find buyers, and manage workflow.
            </p>
          </div>

          <form
            action="/admin/orders"
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <label className="sr-only" htmlFor="q">
              Search orders
            </label>
            <div className="relative">
              <svg
                aria-hidden="true"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                style={{ color: "var(--muted)" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                />
              </svg>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q ?? ""}
                placeholder="Search ref, buyer, or email…"
                className="w-full min-w-[240px] rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--ink)",
                }}
              />
            </div>
            {/* Hidden field preserves the active status when re-submitting the
                search form. Status itself is changed via the OrdersTable
                StatusTabs (links, not form submission). */}
            {status !== "all" && (
              <input type="hidden" name="status" value={status} />
            )}
            <button
              type="submit"
              className="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              Search
            </button>
            {q && (
              <a
                href={
                  status === "all" ? "/admin/orders" : `/admin/orders?status=${status}`
                }
                className="rounded-md px-3 py-2 text-center text-sm font-medium transition-colors"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                Clear
              </a>
            )}
          </form>
        </div>

        <OrdersTable result={result} counts={counts} q={q} status={status} />
      </div>
    );
  } catch (error) {
    console.error("[ADMIN ORDERS] Failed to load orders:", error);
    return (
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight mb-4"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--ink)",
          }}
        >
          Orders
        </h1>
        <div
          className="rounded-md p-4 text-sm"
          style={{
            background: "rgb(220 38 38 / 0.08)",
            borderLeft: "3px solid rgb(220 38 38)",
            color: "var(--ink)",
          }}
        >
          Failed to load orders. Try refreshing the page.
        </div>
      </div>
    );
  }
}
