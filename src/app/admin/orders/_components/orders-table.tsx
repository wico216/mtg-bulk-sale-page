import Link from "next/link";
import type { AdminOrdersResult, AdminOrderSummary } from "@/db/orders";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function StatusBadge({ status }: { status: AdminOrderSummary["status"] }) {
  const classes =
    status === "completed"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
      : status === "confirmed"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${classes}`}>
      {status}
    </span>
  );
}

function PageLink({
  page,
  disabled,
  children,
}: {
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-300 dark:border-zinc-800 dark:text-zinc-600">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={`/admin/orders?page=${page}`}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {children}
    </Link>
  );
}

export function OrdersTable({ result }: { result: AdminOrdersResult }) {
  if (result.orders.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 py-16 text-center dark:border-zinc-800">
        <h2 className="text-lg font-semibold">No orders yet</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Placed checkouts will appear here after checkout succeeds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left dark:bg-zinc-900">
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                Order
              </th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                Buyer
              </th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                Date
              </th>
              <th className="px-4 py-3 text-right font-semibold text-zinc-600 dark:text-zinc-400">
                Items
              </th>
              <th className="px-4 py-3 text-right font-semibold text-zinc-600 dark:text-zinc-400">
                Total
              </th>
              <th className="px-4 py-3 font-semibold text-zinc-600 dark:text-zinc-400">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {result.orders.map((order) => (
              <tr
                key={order.id}
                className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60"
              >
                <td className="px-4 py-3 font-mono text-xs">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="font-semibold text-accent hover:text-accent-hover hover:underline"
                  >
                    {order.id}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {order.buyerName}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {order.buyerEmail}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {formatDate(order.createdAt)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {order.totalItems}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatCurrency(order.totalPrice)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">
          Showing {(result.page - 1) * result.limit + 1}-
          {Math.min(result.page * result.limit, result.total)} of {result.total} orders
        </span>
        <div className="flex items-center gap-2">
          <PageLink page={result.page - 1} disabled={result.page <= 1}>
            Previous Page
          </PageLink>
          <span className="text-zinc-500 dark:text-zinc-400">
            Page {result.page} of {result.totalPages}
          </span>
          <PageLink
            page={result.page + 1}
            disabled={result.page >= result.totalPages}
          >
            Next Page
          </PageLink>
        </div>
      </div>
    </div>
  );
}
