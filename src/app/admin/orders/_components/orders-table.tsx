"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  AdminOrdersResult,
  AdminOrderStatusCounts,
  AdminOrderSummary,
  OrderQueryStatus,
  OrderStatus,
  OrderWorkflowStatus,
} from "@/db/orders";
import { Pagination } from "../../_components/pagination";
import { binderColor } from "../../_components/binder-color";
import { formatBinderForDisplay } from "@/lib/binder-name";

interface TickerData {
  queue: number;
  pending: number;
  confirmed: number;
  todayValue: number;
  oldestAgeText: string | null;
  oldestAgeBand: "warm" | "hot" | "";
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const absoluteDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/**
 * "Time is the protagonist" — relative-age string + a band token that maps
 * to the row color. Tunings:
 *   < 12h        — plain muted
 *   12–24h       — warm (yellow)
 *   24–72h       — warm (yellow)
 *   ≥ 72h        — hot (red), bold weight
 *
 * Only pending/confirmed orders get the band treatment; completed and
 * cancelled orders stay muted regardless of age (the SLA clock has stopped).
 */
function ageInfo(
  iso: string,
  status: OrderStatus,
): { text: string; band: "warm" | "hot" | "" } {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return { text: "just now", band: "" };
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  let text: string;
  if (hours < 1) text = `${Math.max(1, minutes)}m`;
  else if (hours < 24) text = `${hours}h`;
  else {
    const remHours = hours % 24;
    text = remHours ? `${days}d ${remHours}h` : `${days}d`;
  }
  if (status !== "pending" && status !== "confirmed") return { text, band: "" };
  if (days >= 3) return { text, band: "hot" };
  if (hours >= 12) return { text, band: "warm" };
  return { text, band: "" };
}

function statusLetter(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "P";
    case "confirmed":
      return "C";
    case "completed":
      return "D"; // "Done" — D reads better than C/C overload
    case "cancelled":
      return "X";
  }
}

function statusEdgeColor(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "var(--accent)";
    case "confirmed":
      return "oklch(0.72 0.13 245)";
    case "completed":
      return "var(--good, oklch(0.74 0.16 145))";
    case "cancelled":
      return "var(--muted)";
  }
}

function statusChipStyle(status: OrderStatus): React.CSSProperties {
  switch (status) {
    case "pending":
      return {
        background: "color-mix(in oklab, var(--accent) 22%, transparent)",
        color: "var(--accent)",
      };
    case "confirmed":
      return {
        background:
          "color-mix(in oklab, oklch(0.72 0.13 245) 28%, transparent)",
        color: "oklch(0.85 0.12 245)",
      };
    case "completed":
      return {
        background:
          "color-mix(in oklab, oklch(0.74 0.16 145) 20%, transparent)",
        color: "oklch(0.74 0.16 145)",
      };
    case "cancelled":
      return {
        background: "transparent",
        color: "var(--muted)",
        border: "1px solid var(--border)",
      };
  }
}

function dollarsCents(value: number): {
  dollars: string;
  cents: string;
} {
  const cents = Math.round(value * 100);
  const d = Math.floor(cents / 100).toLocaleString();
  const c = (cents % 100).toString().padStart(2, "0");
  return { dollars: d, cents: c };
}

function buildOrdersHref({
  page,
  q,
  status,
}: {
  page: number;
  q?: string;
  status?: OrderQueryStatus;
}): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q) params.set("q", q);
  // "queue" is the default landing view — omit it from the URL so /admin/orders
  // and /admin/orders?status=queue resolve to the same canonical URL.
  if (status && status !== "queue") params.set("status", status);
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

const STATUS_TABS: ReadonlyArray<{
  key: OrderQueryStatus;
  label: string;
  countKey: keyof AdminOrderStatusCounts;
}> = [
  { key: "queue", label: "Queue", countKey: "queue" },
  { key: "completed", label: "Completed", countKey: "completed" },
  { key: "cancelled", label: "Cancelled", countKey: "cancelled" },
  { key: "all", label: "All", countKey: "all" },
];

function inlineActionsFor(status: OrderStatus): Array<{
  next: OrderWorkflowStatus;
  label: string;
  tone: "primary" | "ghost";
}> {
  switch (status) {
    case "pending":
      return [
        { next: "confirmed", label: "Confirm", tone: "primary" },
        { next: "completed", label: "Done", tone: "ghost" },
      ];
    case "confirmed":
      return [{ next: "completed", label: "Mark done", tone: "primary" }];
    case "completed":
    case "cancelled":
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// Page-level shell
// ─────────────────────────────────────────────────────────────────────

export function OrdersTable({
  result,
  counts,
  q,
  status,
  ticker,
}: {
  result: AdminOrdersResult;
  counts: AdminOrderStatusCounts;
  q?: string;
  status: OrderQueryStatus;
  ticker: TickerData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<
    | { kind: "success"; orderRef: string; message: string }
    | { kind: "error"; orderRef: string; message: string }
    | null
  >(null);

  // Selection resets when the filter/page changes — same rationale as the
  // inventory table: a cleared list shouldn't carry stale ids.
  useEffect(() => {
    setSelected(new Set());
  }, [q, status, result.page]);

  const onActionComplete = (
    orderRef: string,
    success: boolean,
    message?: string,
  ) => {
    if (success) {
      setFlash({ kind: "success", orderRef, message: "Status updated" });
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

  const onToggle = (orderId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  };

  const selectableIds = useMemo(
    () =>
      result.orders
        .filter((o) => o.status === "pending" || o.status === "confirmed")
        .map((o) => o.id),
    [result.orders],
  );

  const allSelectableSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selected.has(id));

  return (
    <>
      {/* Ticker — sticky data band right under the admin shell header */}
      <OrdersTicker data={ticker} />

      {/* Heading band — editorial serif title + section caption */}
      <header className="grid items-end gap-6 pt-4 pb-3">
        <div>
          <p
            className="m-0 mb-2"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Section · 02 — Orders
          </p>
          <h1
            className="m-0"
            style={{
              fontFamily:
                "var(--font-instrument-serif), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: 44,
              letterSpacing: "-0.01em",
              lineHeight: 0.95,
              color: "var(--ink)",
            }}
          >
            Orders
            <em
              style={{
                fontStyle: "italic",
                color: "var(--accent)",
              }}
            >
              .
            </em>
          </h1>
        </div>
      </header>

      {/* Status tabs + search */}
      <StatusTabs active={status} counts={counts} q={q} />
      <SearchToolbar q={q} status={status} />

      {/* List body */}
      {result.orders.length === 0 ? (
        <EmptyState q={q} status={status} />
      ) : (
        <OrdersList
          orders={result.orders}
          selected={selected}
          onToggle={onToggle}
          allSelectableSelected={allSelectableSelected}
          selectableIds={selectableIds}
          flash={flash}
          isRefreshing={isPending}
          onActionComplete={onActionComplete}
        />
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

      {/* Selection dock */}
      <SelectionDock
        count={selected.size}
        onPickList={() => {
          const refs = Array.from(selected).join(",");
          router.push(`/admin/orders/pick?refs=${encodeURIComponent(refs)}`);
        }}
        onClear={() => setSelected(new Set())}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Ticker
// ─────────────────────────────────────────────────────────────────────

function OrdersTicker({ data }: { data: TickerData }) {
  return (
    <section
      aria-label="Orders ticker"
      className="sticky z-20 -mx-4 sm:mx-0 px-4 sm:px-0 backdrop-blur"
      style={{
        top: 56,
        background: "color-mix(in oklab, var(--bg) 92%, transparent)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="flex items-center gap-x-5 gap-y-1 flex-wrap overflow-x-auto whitespace-nowrap"
        style={{
          height: 38,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.04em",
        }}
      >
        <Stat
          label="pending"
          value={data.pending.toLocaleString()}
          warn={data.pending > 0}
        />
        <Sep />
        <Stat label="confirmed" value={data.confirmed.toLocaleString()} />
        <Sep />
        <Stat
          label="today"
          value={data.todayValue > 0 ? formatCurrency(data.todayValue) : "$0"}
        />
        <Sep />
        <Stat
          label="oldest unfilled"
          value={data.oldestAgeText ?? "—"}
          hot={data.oldestAgeBand === "hot"}
          warn={data.oldestAgeBand === "warm"}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  warn,
  hot,
}: {
  label: string;
  value: string;
  warn?: boolean;
  hot?: boolean;
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 shrink-0"
      style={{ color: "var(--muted)" }}
    >
      <span>{label}</span>
      <strong
        style={{
          color: hot
            ? "oklch(0.7 0.19 25)"
            : warn
              ? "var(--accent)"
              : "var(--ink)",
          fontWeight: 600,
        }}
      >
        {value}
      </strong>
    </span>
  );
}

function Sep() {
  return (
    <span aria-hidden="true" style={{ color: "var(--dim)", flexShrink: 0 }}>
      ·
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────

function StatusTabs({
  active,
  counts,
  q,
}: {
  active: OrderQueryStatus;
  counts: AdminOrderStatusCounts;
  q?: string;
}) {
  return (
    <nav
      role="tablist"
      aria-label="Filter by status"
      className="flex items-center gap-1 -mx-4 sm:mx-0 px-4 sm:px-0"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {STATUS_TABS.map((tab) => {
        const isActive = active === tab.key;
        const count = counts[tab.countKey] ?? 0;
        const isHot = tab.key === "queue" && count > 0;
        return (
          <Link
            key={tab.key}
            href={buildOrdersHref({ page: 1, q, status: tab.key })}
            role="tab"
            aria-selected={isActive}
            className="inline-flex items-baseline gap-2 px-3.5 py-2.5 transition-colors"
            style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.02em",
              color: isActive ? "var(--ink)" : "var(--muted)",
              borderBottom: `2px solid ${
                isActive ? "var(--accent)" : "transparent"
              }`,
              marginBottom: "-1px",
              textDecoration: "none",
            }}
          >
            <span>{tab.label}</span>
            <span
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 6px",
                borderRadius: 3,
                minWidth: 22,
                textAlign: "center",
                background: isActive
                  ? "var(--accent)"
                  : isHot
                    ? "color-mix(in oklab, var(--accent) 24%, transparent)"
                    : "color-mix(in oklab, var(--ink) 8%, transparent)",
                color: isActive
                  ? "var(--accent-fg)"
                  : isHot
                    ? "var(--accent)"
                    : "var(--muted)",
              }}
            >
              {count.toLocaleString()}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Search toolbar
// ─────────────────────────────────────────────────────────────────────

function SearchToolbar({
  q,
  status,
}: {
  q?: string;
  status: OrderQueryStatus;
}) {
  return (
    <form
      action="/admin/orders"
      method="get"
      className="grid grid-cols-[1fr_auto] gap-3 items-center py-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <label
        className="flex items-center gap-2.5 rounded-md px-3"
        style={{
          height: 38,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <span
          aria-hidden="true"
          className="flex items-center"
          style={{ color: "var(--muted)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder="Search ref, buyer name, or email…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{
            color: "var(--ink)",
            fontFamily: "var(--font-inter), system-ui, sans-serif",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            fontWeight: 500,
            color: "var(--muted)",
            background: "color-mix(in oklab, var(--ink) 8%, transparent)",
            padding: "4px 6px",
            borderRadius: 3,
          }}
        >
          ⏎
        </span>
      </label>
      {/* Preserve the active status when the form submits — status changes are
          link-driven, search is GET-driven. */}
      {status !== "queue" && (
        <input type="hidden" name="status" value={status} />
      )}
      {q ? (
        <Link
          href={buildOrdersHref({ page: 1, status })}
          className="rounded px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--muted)",
            textDecoration: "none",
          }}
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Orders list
// ─────────────────────────────────────────────────────────────────────

const COLS = "20px 28px 132px minmax(160px,1.1fr) minmax(0,1.2fr) auto 96px 76px";

function OrdersList({
  orders,
  selected,
  onToggle,
  allSelectableSelected,
  selectableIds,
  flash,
  isRefreshing,
  onActionComplete,
}: {
  orders: AdminOrderSummary[];
  selected: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  allSelectableSelected: boolean;
  selectableIds: string[];
  flash:
    | { kind: "success"; orderRef: string; message: string }
    | { kind: "error"; orderRef: string; message: string }
    | null;
  isRefreshing: boolean;
  onActionComplete: (
    orderRef: string,
    success: boolean,
    message?: string,
  ) => void;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 8,
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        className="grid items-center"
        style={{
          gridTemplateColumns: COLS,
          gap: 14,
          padding: "10px 18px 10px 14px",
          background: "color-mix(in oklab, var(--surface) 96%, transparent)",
          borderBottom: "1px solid var(--border)",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dim)",
        }}
      >
        <span>
          <input
            type="checkbox"
            aria-label="Select all selectable orders on this page"
            checked={allSelectableSelected}
            disabled={selectableIds.length === 0}
            onChange={(e) => {
              selectableIds.forEach((id) => onToggle(id, e.target.checked));
            }}
            className="h-4 w-4 cursor-pointer accent-[var(--accent)] disabled:opacity-30"
          />
        </span>
        <span />
        <span>Ref</span>
        <span>Buyer</span>
        <span>Items · Binders</span>
        <span className="text-right">Total</span>
        <span className="text-right">Age</span>
        <span />
      </div>

      <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {orders.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            selected={selected.has(order.id)}
            onToggle={onToggle}
            flash={flash?.orderRef === order.id ? flash : null}
            isRefreshing={isRefreshing}
            onActionComplete={onActionComplete}
          />
        ))}
      </ul>
    </div>
  );
}

function OrderRow({
  order,
  selected,
  onToggle,
  flash,
  isRefreshing,
  onActionComplete,
}: {
  order: AdminOrderSummary;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  flash:
    | { kind: "success"; orderRef: string; message: string }
    | { kind: "error"; orderRef: string; message: string }
    | null;
  isRefreshing: boolean;
  onActionComplete: (
    orderRef: string,
    success: boolean,
    message?: string,
  ) => void;
}) {
  const actions = inlineActionsFor(order.status);
  const isSelectable =
    order.status === "pending" || order.status === "confirmed";
  const age = ageInfo(order.createdAt, order.status);
  const { dollars, cents } = dollarsCents(order.totalPrice);
  const preview = order.previewItems.length
    ? order.previewItems.join(" · ")
    : "—";
  const more = Math.max(0, order.lineCount - order.previewItems.length);
  const flashBg =
    flash?.kind === "success"
      ? "color-mix(in oklab, var(--accent) 10%, transparent)"
      : flash?.kind === "error"
        ? "color-mix(in oklab, var(--bad) 12%, transparent)"
        : undefined;

  return (
    <li
      data-selected={selected ? "true" : "false"}
      className="relative grid items-center group transition-colors"
      style={{
        gridTemplateColumns: COLS,
        gap: 14,
        padding: "12px 18px 12px 14px",
        borderBottom:
          "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
        background: selected
          ? "color-mix(in oklab, var(--accent) 8%, transparent)"
          : flashBg,
      }}
      onMouseEnter={(e) => {
        if (!selected && !flash) {
          e.currentTarget.style.background =
            "color-mix(in oklab, var(--ink) 3%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected && !flash) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {/* Status edge */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0"
        style={{ width: 3, background: statusEdgeColor(order.status) }}
      />

      {/* Select */}
      <span>
        <input
          type="checkbox"
          aria-label={`Select ${order.id}`}
          checked={selected}
          disabled={!isSelectable}
          onChange={(e) => onToggle(order.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 cursor-pointer accent-[var(--accent)] disabled:opacity-25 disabled:cursor-not-allowed"
        />
      </span>

      {/* Status letter chip */}
      <span
        className="inline-flex items-center justify-center"
        title={order.status}
        aria-label={`Status: ${order.status}`}
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          fontWeight: 700,
          ...statusChipStyle(order.status),
        }}
      >
        {statusLetter(order.status)}
      </span>

      {/* Ref + relative date */}
      <Link
        href={`/admin/orders/${order.id}`}
        className="flex flex-col gap-[3px] hover:underline"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink)",
          letterSpacing: "0.02em",
          textDecoration: "none",
        }}
      >
        <span>{order.id}</span>
        <span
          title={absoluteDateFormatter.format(new Date(order.createdAt))}
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            color: "var(--dim)",
            letterSpacing: "0.04em",
            fontWeight: 500,
          }}
        >
          {age.text} ago
        </span>
      </Link>

      {/* Buyer */}
      <div className="min-w-0 flex flex-col gap-[3px]">
        <span
          className="truncate"
          style={{
            fontFamily:
              "var(--font-instrument-serif), ui-serif, Georgia, serif",
            fontSize: 15,
            color: "var(--ink)",
            lineHeight: 1.1,
          }}
        >
          {order.buyerName}
        </span>
        <span
          className="truncate"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: "0.04em",
            fontWeight: 500,
          }}
        >
          {order.buyerEmail}
        </span>
      </div>

      {/* Items preview + binders */}
      <div className="min-w-0 flex flex-col gap-[3px]">
        <span
          className="truncate"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--dim)",
            fontWeight: 600,
          }}
        >
          {order.lineCount.toLocaleString()}{" "}
          {order.lineCount === 1 ? "line" : "lines"} ·{" "}
          {order.totalItems.toLocaleString()}{" "}
          {order.totalItems === 1 ? "copy" : "copies"}
        </span>
        <span className="flex items-center gap-2 min-w-0">
          <span
            className="truncate"
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
            }}
            title={preview}
          >
            {preview}
            {more > 0 && (
              <span
                aria-hidden="true"
                style={{ color: "var(--dim)", marginLeft: 4 }}
              >
                +{more}
              </span>
            )}
          </span>
        </span>
        {order.binders.length > 0 && (
          <span className="inline-flex items-center gap-1 flex-wrap mt-1">
            {order.binders.map((b) => (
              <span
                key={b}
                className="inline-flex items-center"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: "var(--ink-soft)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${binderColor(b)}`,
                  borderRadius: 3,
                  padding: "2px 6px",
                }}
              >
                {formatBinderForDisplay(b)}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Total */}
      <span
        className="text-right shrink-0"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 14,
          fontWeight: 500,
          color: "var(--ink)",
        }}
      >
        <span style={{ color: "var(--dim)", fontSize: 11, marginRight: 1 }}>
          $
        </span>
        {dollars}
        <span style={{ color: "var(--muted)", fontSize: 11 }}>.{cents}</span>
      </span>

      {/* Age */}
      <span
        data-age={age.band || undefined}
        className="text-right shrink-0"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12,
          fontWeight: age.band === "hot" ? 600 : 500,
          color:
            age.band === "hot"
              ? "oklch(0.7 0.19 25)"
              : age.band === "warm"
                ? "oklch(0.78 0.17 60)"
                : "var(--muted)",
        }}
      >
        {age.text}
      </span>

      {/* Hover actions + arrow */}
      <span className="relative flex items-center justify-end">
        <Link
          href={`/admin/orders/${order.id}`}
          aria-label={`Open ${order.id}`}
          style={{ color: "var(--dim)", fontSize: 14, textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          →
        </Link>
        {actions.length > 0 && (
          <span
            className="absolute right-7 top-1/2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto transition-opacity"
            style={{ transform: "translateY(-50%)" }}
          >
            {actions.map((action) => (
              <InlineStatusButton
                key={action.next}
                orderRef={order.id}
                nextStatus={action.next}
                label={action.label}
                tone={action.tone}
                onActionComplete={onActionComplete}
              />
            ))}
          </span>
        )}
      </span>

      {flash && (
        <span
          role="status"
          className="absolute left-14 -bottom-1 text-[10px]"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            color:
              flash.kind === "success" ? "var(--accent)" : "var(--bad-soft)",
            letterSpacing: "0.04em",
            fontWeight: 600,
          }}
        >
          {flash.message}
          {isRefreshing && flash.kind === "success" && " · refreshing"}
        </span>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state + inline action button + dock
// ─────────────────────────────────────────────────────────────────────

function EmptyState({
  q,
  status,
}: {
  q?: string;
  status: OrderQueryStatus;
}) {
  return (
    <div
      className="text-center py-20 rounded-lg"
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
        style={{
          color: "var(--ink)",
          fontFamily:
            "var(--font-instrument-serif), ui-serif, Georgia, serif",
          fontWeight: 400,
        }}
      >
        No orders found
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        {q || status !== "queue"
          ? "Try changing the search or status filter."
          : "Nothing in the queue. Completed orders live behind the Completed tab."}
      </p>
    </div>
  );
}

function InlineStatusButton({
  orderRef,
  nextStatus,
  label,
  tone,
  onActionComplete,
}: {
  orderRef: string;
  nextStatus: OrderWorkflowStatus;
  label: string;
  tone: "primary" | "ghost";
  onActionComplete: (
    orderRef: string,
    success: boolean,
    message?: string,
  ) => void;
}) {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
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
        onActionComplete(orderRef, false, message);
      } else {
        onActionComplete(orderRef, true);
      }
    } catch {
      onActionComplete(orderRef, false, "Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const primaryStyle: React.CSSProperties =
    tone === "primary"
      ? {
          background: "var(--accent)",
          color: "var(--accent-fg)",
          border: "1px solid var(--accent)",
        }
      : {
          background: "color-mix(in oklab, var(--bg) 80%, transparent)",
          border: "1px solid var(--border-strong)",
          color: "var(--ink)",
        };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "5px 9px",
        borderRadius: 3,
        ...primaryStyle,
      }}
    >
      {busy ? "…" : label}
    </button>
  );
}

function SelectionDock({
  count,
  onPickList,
  onClear,
}: {
  count: number;
  onPickList: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  const divider = "1px solid color-mix(in oklab, var(--bg) 20%, transparent)";

  return (
    <div
      role="region"
      aria-label="Bulk order actions"
      className="fixed inset-x-0 z-40 px-4 pointer-events-none"
      style={{ bottom: 24 }}
    >
      <div
        className="mx-auto pointer-events-auto inline-flex items-center gap-4"
        style={{
          background: "var(--ink)",
          color: "var(--bg)",
          borderRadius: 10,
          padding: "10px 14px",
          boxShadow:
            "0 24px 60px -8px color-mix(in oklab, var(--bg) 55%, transparent)",
          animation: "admin-slide-up 200ms cubic-bezier(.2,.7,.4,1) both",
          maxWidth: "min(100%, 720px)",
          display: "flex",
        }}
      >
        <span
          className="tabular-nums inline-flex items-baseline gap-1.5"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.04em",
            paddingRight: 14,
            borderRight: divider,
          }}
        >
          <span>{count.toLocaleString()}</span>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>orders selected</span>
        </span>

        <button
          type="button"
          onClick={onPickList}
          className="inline-flex items-center gap-1.5 transition-colors"
          style={{
            background: "var(--accent)",
            color: "var(--accent-fg)",
            border: 0,
            cursor: "pointer",
            font: "inherit",
            padding: "8px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              "color-mix(in oklab, var(--accent) 88%, white)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--accent)";
          }}
        >
          Generate pick list <span aria-hidden="true">→</span>
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="leading-none ml-1"
          style={{
            background: "transparent",
            color: "color-mix(in oklab, var(--bg) 70%, var(--ink))",
            border: 0,
            cursor: "pointer",
            padding: 4,
            fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
