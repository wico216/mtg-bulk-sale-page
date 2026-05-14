"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  AdminOrdersResult,
  AdminOrderStatusCounts,
  AdminOrderSummary,
  OrderStatus,
  OrderWorkflowStatus,
} from "@/db/orders";
import { Pagination } from "../../_components/pagination";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
});

const absoluteDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = then - now; // negative for past
  const diffMin = Math.round(diffMs / 60_000);
  const absMin = Math.abs(diffMin);
  if (absMin < 1) return "just now";
  if (absMin < 60) return relativeTimeFormatter.format(diffMin, "minute");
  const diffHr = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHr) < 24)
    return relativeTimeFormatter.format(diffHr, "hour");
  const diffDay = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDay) < 30)
    return relativeTimeFormatter.format(diffDay, "day");
  const diffMonth = Math.round(diffMs / (30 * 86_400_000));
  return relativeTimeFormatter.format(diffMonth, "month");
}

function statusColor(status: OrderStatus): {
  bg: string;
  fg: string;
  dot: string;
} {
  switch (status) {
    case "pending":
      return {
        bg: "color-mix(in oklab, var(--accent) 16%, transparent)",
        fg: "var(--accent)",
        dot: "var(--accent)",
      };
    case "confirmed":
      return {
        bg: "color-mix(in oklab, rgb(96 165 250) 20%, transparent)",
        fg: "rgb(147 197 253)",
        dot: "rgb(96 165 250)",
      };
    case "completed":
      return {
        bg: "color-mix(in oklab, var(--ink) 8%, transparent)",
        fg: "var(--muted)",
        dot: "rgb(74 222 128)",
      };
    case "cancelled":
      return {
        bg: "transparent",
        fg: "var(--muted)",
        dot: "var(--muted)",
      };
  }
}

function StatusPill({ status }: { status: OrderStatus }) {
  const c = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, color: c.fg }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: c.dot }}
      />
      {status}
    </span>
  );
}

function buildOrdersHref({
  page,
  q,
  status,
}: {
  page: number;
  q?: string;
  status?: OrderStatus | "all";
}): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("status", status);
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

const STATUS_TABS: ReadonlyArray<{ key: OrderStatus | "all"; label: string }> =
  [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "confirmed", label: "Confirmed" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

function StatusTabs({
  active,
  counts,
  q,
}: {
  active: OrderStatus | "all";
  counts: AdminOrderStatusCounts;
  q?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter by status"
      className="flex flex-wrap items-center gap-1.5"
    >
      {STATUS_TABS.map((tab) => {
        const isActive = active === tab.key;
        const count = counts[tab.key];
        const isPending = tab.key === "pending" && count > 0;
        return (
          <Link
            key={tab.key}
            href={buildOrdersHref({ page: 1, q, status: tab.key })}
            role="tab"
            aria-selected={isActive}
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap"
            style={{
              background: isActive
                ? "color-mix(in oklab, var(--accent) 18%, transparent)"
                : "transparent",
              border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
              color: isActive ? "var(--ink)" : "var(--muted)",
            }}
          >
            <span>{tab.label}</span>
            <span
              className="tabular-nums text-[10px] font-bold rounded-full px-1.5 py-0.5"
              style={{
                background: isActive
                  ? "var(--accent)"
                  : isPending
                  ? "color-mix(in oklab, var(--accent) 24%, transparent)"
                  : "color-mix(in oklab, var(--ink) 8%, transparent)",
                color: isActive
                  ? "var(--accent-fg)"
                  : isPending
                  ? "var(--accent)"
                  : "var(--muted)",
                minWidth: "1.4rem",
                textAlign: "center",
              }}
            >
              {count.toLocaleString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

interface InlineActionProps {
  orderRef: string;
  nextStatus: OrderWorkflowStatus;
  label: string;
  tone: "primary" | "ghost";
  onActionStart: () => void;
  onActionComplete: (success: boolean, message?: string) => void;
}

function InlineStatusButton({
  orderRef,
  nextStatus,
  label,
  tone,
  onActionStart,
  onActionComplete,
}: InlineActionProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    onActionStart();
    try {
      const response = await fetch(`/api/admin/orders/${orderRef}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        let message = `Failed (${response.status})`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {}
        onActionComplete(false, message);
      } else {
        onActionComplete(true);
      }
    } catch {
      onActionComplete(false, "Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const primaryStyle =
    tone === "primary"
      ? { background: "var(--accent)", color: "var(--accent-fg)" }
      : {
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--ink)",
        };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      style={primaryStyle}
    >
      {busy ? "…" : label}
    </button>
  );
}

function inlineActionsFor(status: OrderStatus): Array<{
  next: OrderWorkflowStatus;
  label: string;
  tone: "primary" | "ghost";
}> {
  switch (status) {
    case "pending":
      return [
        { next: "confirmed", label: "→ Confirm", tone: "primary" },
        { next: "completed", label: "Done", tone: "ghost" },
      ];
    case "confirmed":
      return [{ next: "completed", label: "→ Mark done", tone: "primary" }];
    case "completed":
    case "cancelled":
      return [];
  }
}

export function OrdersTable({
  result,
  counts,
  q,
  status,
}: {
  result: AdminOrdersResult;
  counts: AdminOrderStatusCounts;
  q?: string;
  status: OrderStatus | "all";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<
    | { kind: "success"; orderRef: string; message: string }
    | { kind: "error"; orderRef: string; message: string }
    | null
  >(null);

  const onActionComplete = (
    orderRef: string,
    success: boolean,
    message?: string,
  ) => {
    if (success) {
      setFlash({
        kind: "success",
        orderRef,
        message: "Status updated",
      });
      startTransition(() => router.refresh());
      setTimeout(() => setFlash(null), 2500);
    } else {
      setFlash({
        kind: "error",
        orderRef,
        message: message ?? "Update failed",
      });
      setTimeout(() => setFlash(null), 4000);
    }
  };

  return (
    <div className="space-y-4">
      <StatusTabs active={status} counts={counts} q={q} />

      {result.orders.length === 0 ? (
        <div
          className="rounded-lg py-20 text-center"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="text-4xl mb-2"
            style={{ color: "var(--accent)", opacity: 0.6 }}
          >
            ✦
          </div>
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--ink)" }}
          >
            No orders found
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            {q || status !== "all"
              ? "Try changing the search or status filter."
              : "Checkouts will appear here after a buyer completes one."}
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Desktop: full row layout */}
          <ul className="divide-y" role="list">
            {result.orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onActionComplete={onActionComplete}
                flashState={flash?.orderRef === order.id ? flash : null}
                isRefreshing={isPending}
              />
            ))}
          </ul>
        </div>
      )}

      {result.totalPages > 1 && (
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          limit={result.limit}
          onPageChange={(p) => {
            router.push(buildOrdersHref({ page: p, q, status }));
          }}
          unit="orders"
        />
      )}
    </div>
  );
}

function OrderRow({
  order,
  onActionComplete,
  flashState,
  isRefreshing,
}: {
  order: AdminOrderSummary;
  onActionComplete: (orderRef: string, success: boolean, message?: string) => void;
  flashState:
    | { kind: "success"; orderRef: string; message: string }
    | { kind: "error"; orderRef: string; message: string }
    | null;
  isRefreshing: boolean;
}) {
  const actions = inlineActionsFor(order.status);
  const isMuted = order.status === "completed" || order.status === "cancelled";

  return (
    <li
      className="px-4 py-3 transition-colors"
      style={{
        borderColor: "var(--border)",
        background:
          flashState?.kind === "success"
            ? "color-mix(in oklab, var(--accent) 10%, transparent)"
            : flashState?.kind === "error"
            ? "rgb(220 38 38 / 0.08)"
            : "transparent",
        opacity: isMuted ? 0.72 : 1,
      }}
    >
      <div className="grid gap-x-4 gap-y-2 items-center grid-cols-1 sm:grid-cols-[minmax(140px,180px)_1fr_auto_auto] sm:gap-x-6">
        {/* Ref + time */}
        <div className="min-w-0">
          <Link
            href={`/admin/orders/${order.id}`}
            className="font-mono text-sm font-semibold transition-colors"
            style={{ color: "var(--ink)" }}
          >
            {order.id}
          </Link>
          <div
            className="mt-0.5 text-xs"
            style={{ color: "var(--muted)" }}
            title={absoluteDateFormatter.format(new Date(order.createdAt))}
          >
            {relativeTime(order.createdAt)}
          </div>
        </div>

        {/* Buyer */}
        <div className="min-w-0">
          <div
            className="text-sm font-medium truncate"
            style={{ color: "var(--ink)" }}
          >
            {order.buyerName}
          </div>
          <div
            className="text-xs truncate"
            style={{ color: "var(--muted)" }}
          >
            {order.buyerEmail}
          </div>
        </div>

        {/* Totals */}
        <div className="text-right whitespace-nowrap">
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--ink)" }}
          >
            {formatCurrency(order.totalPrice)}
          </div>
          <div
            className="text-xs tabular-nums"
            style={{ color: "var(--muted)" }}
          >
            {order.totalItems} {order.totalItems === 1 ? "item" : "items"}
          </div>
        </div>

        {/* Status + actions */}
        <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
          <StatusPill status={order.status} />
          {actions.length > 0 && (
            <div className="flex items-center gap-1.5">
              {actions.map((action) => (
                <InlineStatusButton
                  key={action.next}
                  orderRef={order.id}
                  nextStatus={action.next}
                  label={action.label}
                  tone={action.tone}
                  onActionStart={() => {}}
                  onActionComplete={(success, message) => {
                    onActionComplete(order.id, success, message);
                  }}
                />
              ))}
            </div>
          )}
          <Link
            href={`/admin/orders/${order.id}`}
            className="text-xs underline-offset-2 hover:underline"
            style={{ color: "var(--muted)" }}
            aria-label={`Open order ${order.id}`}
          >
            Open →
          </Link>
        </div>
      </div>

      {flashState && (
        <div
          className="mt-2 text-xs font-medium"
          style={{
            color:
              flashState.kind === "success" ? "var(--accent)" : "rgb(248 113 113)",
          }}
          role="status"
        >
          {flashState.message}
          {isRefreshing && flashState.kind === "success" && (
            <span style={{ color: "var(--muted)" }}> · refreshing…</span>
          )}
        </div>
      )}
    </li>
  );
}
