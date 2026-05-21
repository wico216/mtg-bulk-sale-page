import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getAdminOrders,
  getAdminOrderStatusCounts,
  type OrderQueryStatus,
} from "@/db/orders";
import { isAdminEmail } from "@/lib/auth/helpers";
import { OrdersTable } from "./_components/orders-table";

export const metadata: Metadata = {
  title: "Orders — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

const ORDER_QUERY_STATUSES: readonly OrderQueryStatus[] = [
  "queue",
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "all",
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

/**
 * Resolve the requested tab. Default = `"queue"` (pending + confirmed) per
 * the post-v1.4 orders redesign — the operator's landing view should be
 * everything-that-needs-action, not the full archive.
 */
function parseStatus(value: string | undefined): OrderQueryStatus {
  if (!value) return "queue";
  return ORDER_QUERY_STATUSES.includes(value as OrderQueryStatus)
    ? (value as OrderQueryStatus)
    : "queue";
}

/**
 * Relative-age signal used in the ticker. Reads the oldest pending+confirmed
 * order's createdAt and bucketizes it the same way the row's `data-age`
 * attribute does, so the ticker's color matches the loudest row's color.
 */
function formatAge(iso: string): { text: string; band: "warm" | "hot" | "" } {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return { text: "just now", band: "" };
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(ms / 60_000));
    return { text: `${minutes}m`, band: "" };
  }
  if (hours < 24) {
    return { text: `${hours}h`, band: hours >= 12 ? "warm" : "" };
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const text = remHours ? `${days}d ${remHours}h` : `${days}d`;
  return { text, band: days >= 3 ? "hot" : "warm" };
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

  // For the "oldest unfilled" ticker stat we run an extra tiny query: the
  // first row of the queue (pending+confirmed) sorted oldest-first. Doing
  // it as its own request keeps the main list paginated naturally and
  // costs one indexed lookup. Falls through to null on an empty queue.
  const oldestUnfilledPromise = getAdminOrders({
    page: 1,
    limit: 1,
    status: "queue",
  })
    .then((result) => result.orders[0] ?? null)
    .catch(() => null);

  try {
    const [result, counts, oldestUnfilled] = await Promise.all([
      getAdminOrders({
        page,
        limit: 25,
        ...(q ? { q } : {}),
        // `status: "all"` is implicit absence — pass nothing in that case.
        ...(status !== "all" ? { status } : {}),
      }),
      getAdminOrderStatusCounts({ ...(q ? { q } : {}) }),
      oldestUnfilledPromise,
    ]);

    const oldestAge = oldestUnfilled
      ? formatAge(oldestUnfilled.createdAt)
      : null;

    // "Value today" = sum of totals on orders created since the start of
    // today (UTC). Cheap to derive from the current page if it includes
    // today's orders; fall back to 0 otherwise so the ticker stays honest
    // rather than guessing. Improving this would need its own SQL — out
    // of scope for the redesign port.
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const todayValue = result.orders
      .filter(
        (o) => new Date(o.createdAt).getTime() >= startOfToday.getTime(),
      )
      .reduce((sum, o) => sum + o.totalPrice, 0);

    return (
      <OrdersTable
        result={result}
        counts={counts}
        q={q}
        status={status}
        ticker={{
          queue: counts.queue,
          pending: counts.pending,
          confirmed: counts.confirmed,
          todayValue,
          oldestAgeText: oldestAge?.text ?? null,
          oldestAgeBand: oldestAge?.band ?? "",
        }}
      />
    );
  } catch (error) {
    console.error("[ADMIN ORDERS] Failed to load orders:", error);
    return (
      <div className="space-y-4">
        <h1
          className="m-0"
          style={{
            fontFamily:
              "var(--font-instrument-serif), ui-serif, Georgia, serif",
            fontWeight: 400,
            fontSize: 36,
            color: "var(--ink)",
          }}
        >
          Orders<em style={{ fontStyle: "italic", color: "var(--accent)" }}>.</em>
        </h1>
        <div
          className="rounded-md p-4 text-sm"
          style={{
            background: "color-mix(in oklab, var(--bad) 8%, transparent)",
            borderLeft: "3px solid var(--bad)",
            color: "var(--ink)",
          }}
        >
          Failed to load orders. Try refreshing the page.
        </div>
      </div>
    );
  }
}
