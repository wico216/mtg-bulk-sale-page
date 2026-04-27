import Image from "next/image";
import Link from "next/link";
import type { AdminOrderDetail } from "@/db/orders";
import { conditionToAbbr } from "@/lib/condition-map";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCurrency(value: number | null): string {
  return value === null ? "N/A" : currencyFormatter.format(value);
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function OrderDetail({ order }: { order: AdminOrderDetail }) {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/orders"
          className="text-sm font-semibold text-accent hover:text-accent-hover hover:underline"
        >
          ← Back to Orders
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Order {order.orderRef}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Placed {formatDate(order.createdAt)} · {order.status}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 px-4 py-3 text-right dark:border-zinc-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Total
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {currencyFormatter.format(order.totalPrice)}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {order.totalItems} items
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            Buyer
          </h2>
          <p className="mt-2 font-semibold">{order.buyerName}</p>
          <a
            href={`mailto:${order.buyerEmail}`}
            className="text-sm text-accent hover:text-accent-hover hover:underline"
          >
            {order.buyerEmail}
          </a>
        </div>

        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            Message
          </h2>
          {order.message ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
              {order.message}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              No message provided.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            Items
          </h2>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {order.items.map((item) => (
            <div
              key={`${item.cardId}-${item.quantity}`}
              className="flex items-center gap-4 p-4"
            >
              <div className="h-[70px] w-[50px] flex-shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    width={50}
                    height={70}
                    className="h-[70px] w-[50px] object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] text-zinc-400">
                    No img
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {item.name}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {item.setCode.toUpperCase()} #{item.collectorNumber} · {item.setName} · {conditionToAbbr(item.condition)}
                </div>
              </div>

              <div className="text-right text-sm tabular-nums">
                <div className="text-zinc-500 dark:text-zinc-400">
                  {formatCurrency(item.price)} × {item.quantity}
                </div>
                <div className="mt-1 font-semibold">
                  {formatCurrency(item.lineTotal)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
