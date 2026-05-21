"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AdminOrderDetail,
  OrderStatus,
  OrderTimelineEvent,
  OrderWorkflowStatus,
} from "@/db/orders";
import { conditionToAbbr } from "@/lib/condition-map";
import { formatBinderForDisplay } from "@/lib/binder-name";
import { binderColor } from "../../_components/binder-color";

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

const stampFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function formatCurrency(value: number | null): string {
  return value === null ? "—" : currencyFormatter.format(value);
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = then - now;
  const diffMin = Math.round(diffMs / 60_000);
  const absMin = Math.abs(diffMin);
  if (absMin < 1) return "just now";
  if (absMin < 60) return relativeTimeFormatter.format(diffMin, "minute");
  const diffHr = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHr) < 24) return relativeTimeFormatter.format(diffHr, "hour");
  const diffDay = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDay) < 30) return relativeTimeFormatter.format(diffDay, "day");
  const diffMonth = Math.round(diffMs / (30 * 86_400_000));
  return relativeTimeFormatter.format(diffMonth, "month");
}

function stampString(iso: string): string {
  // Format as `YYYY-MM-DD · HH:mm UTC` — terse, monospaced-friendly,
  // matches the mockup's timeline stamps. We pin to UTC so the picker's
  // workflow is locale-agnostic.
  const date = new Date(iso);
  const parts = stampFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} · ${get("hour")}:${get("minute")} utc`;
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

function statusLabel(status: OrderStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

interface CancelSkippedItem {
  cardId: string;
  name: string;
  quantity: number;
}

interface CancelOrderSuccessResult {
  order: AdminOrderDetail;
  alreadyCancelled: boolean;
  restoredQuantity: number;
  restoredRows: number;
  skippedItems: CancelSkippedItem[];
}

function describeCancellation(result: CancelOrderSuccessResult): string {
  if (result.alreadyCancelled) {
    return "Order was already cancelled. Inventory was not restored again.";
  }
  const restoredCopy =
    result.restoredQuantity > 0
      ? ` Restored ${result.restoredQuantity} item${result.restoredQuantity === 1 ? "" : "s"} across ${result.restoredRows} inventory row${result.restoredRows === 1 ? "" : "s"}.`
      : " Inventory was not restored.";
  const skippedCopy =
    result.skippedItems.length > 0
      ? ` Skipped ${result.skippedItems.length} missing inventory row${result.skippedItems.length === 1 ? "" : "s"}.`
      : "";
  return `Order cancelled.${restoredCopy}${skippedCopy}`;
}

// ─────────────────────────────────────────────────────────────────
// Order detail (top-level)
// ─────────────────────────────────────────────────────────────────

export function OrderDetail({
  order,
  timeline,
}: {
  order: AdminOrderDetail;
  timeline: OrderTimelineEvent[];
}) {
  const router = useRouter();
  const [adminNote, setAdminNote] = useState(order.adminNote ?? "");
  const [noteSavedAt, setNoteSavedAt] = useState<number | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState<OrderWorkflowStatus | null>(null);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [restoreInventory, setRestoreInventory] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [topMessage, setTopMessage] = useState<
    | { kind: "success"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);

  useEffect(() => {
    setAdminNote(order.adminNote ?? "");
    setShowCancelConfirmation(false);
    setRestoreInventory(false);
    setNoteSavedAt(null);
    setNoteError(null);
  }, [order.orderRef, order.status, order.adminNote]);

  useEffect(() => {
    if (!topMessage) return;
    const t = setTimeout(() => setTopMessage(null), 4000);
    return () => clearTimeout(t);
  }, [topMessage]);

  const canCancel = order.status === "pending" || order.status === "confirmed";
  const isTerminal =
    order.status === "completed" || order.status === "cancelled";

  // Quick-action primary CTA — same logic as the inline-row Confirm/Done
  // buttons on the list view, just spelled out.
  const nextStep: OrderWorkflowStatus | null =
    order.status === "pending"
      ? "confirmed"
      : order.status === "confirmed"
        ? "completed"
        : null;

  // Subtotal + binder summary derived from the items list. Both are pure
  // computations of `order.items` so they live behind useMemo to avoid
  // re-running on every keystroke in the admin-note textarea.
  const subtotal = useMemo(
    () => order.items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0),
    [order.items],
  );

  const binderSummary = useMemo(() => {
    const distinct = Array.from(new Set(order.items.map((i) => i.binder)));
    distinct.sort((a, b) => {
      if (a === "unsorted" && b !== "unsorted") return 1;
      if (b === "unsorted" && a !== "unsorted") return -1;
      return a.localeCompare(b);
    });
    return distinct;
  }, [order.items]);

  async function handleAdvance(next: OrderWorkflowStatus) {
    if (advancing) return;
    setAdvancing(next);
    setTopMessage(null);
    try {
      const response = await fetch(`/api/admin/orders/${order.orderRef}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        let error = `Update failed (${response.status})`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) error = body.error;
        } catch {}
        setTopMessage({ kind: "error", text: error });
        return;
      }
      setTopMessage({ kind: "success", text: `Status updated to ${next}.` });
      router.refresh();
    } catch (error) {
      setTopMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setAdvancing(null);
    }
  }

  const initialNoteRef = useRef(order.adminNote ?? "");
  useEffect(() => {
    initialNoteRef.current = order.adminNote ?? "";
  }, [order.adminNote]);

  async function persistNote() {
    if (adminNote === initialNoteRef.current) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const response = await fetch(`/api/admin/orders/${order.orderRef}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote }),
      });
      if (!response.ok) {
        let error = `Note save failed (${response.status})`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) error = body.error;
        } catch {}
        setNoteError(error);
        return;
      }
      initialNoteRef.current = adminNote;
      setNoteSavedAt(Date.now());
      router.refresh();
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Network error");
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleCancelOrder() {
    setIsCancelling(true);
    setTopMessage(null);
    try {
      const response = await fetch(
        `/api/admin/orders/${order.orderRef}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restoreInventory }),
        },
      );
      if (!response.ok) {
        let error = `Cancellation failed (${response.status})`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) error = body.error;
        } catch {}
        setTopMessage({ kind: "error", text: error });
        return;
      }
      const body = (await response.json()) as {
        result?: CancelOrderSuccessResult;
      };
      if (!body.result) {
        setTopMessage({
          kind: "error",
          text: "Cancellation returned no result",
        });
        return;
      }
      setTopMessage({
        kind: "success",
        text: describeCancellation(body.result),
      });
      setShowCancelConfirmation(false);
      setRestoreInventory(false);
      router.refresh();
    } catch (error) {
      setTopMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setIsCancelling(false);
    }
  }

  const { dollars, cents } = (() => {
    const totalCents = Math.round(order.totalPrice * 100);
    return {
      dollars: Math.floor(totalCents / 100).toLocaleString(),
      cents: (totalCents % 100).toString().padStart(2, "0"),
    };
  })();

  return (
    <div className="space-y-8 pb-32">
      {/* Back link */}
      <Link
        href="/admin/orders"
        className="inline-block"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--muted)",
          letterSpacing: "0.06em",
          textDecoration: "none",
        }}
      >
        ← back to queue
      </Link>

      {/* Heading + total — editorial band */}
      <header
        className="grid items-end gap-8 pb-6"
        style={{
          gridTemplateColumns: "1fr auto",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="min-w-0">
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
            Section · 02.a — Order detail
          </p>
          <div className="flex items-baseline gap-4 flex-wrap">
            <h1
              className="m-0"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontWeight: 600,
                fontSize: 28,
                color: "var(--ink)",
                letterSpacing: "0.02em",
              }}
            >
              {order.orderRef}
            </h1>
            <span
              className="inline-flex items-center"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "5px 10px",
                borderRadius: 4,
                ...statusChipStyle(order.status),
              }}
            >
              {statusLabel(order.status)}
            </span>
          </div>
          <p
            className="mt-2"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "var(--muted)",
              letterSpacing: "0.04em",
              lineHeight: 1.5,
            }}
          >
            Placed{" "}
            <strong
              style={{ color: "var(--ink-soft)", fontWeight: 600 }}
              title={absoluteDateFormatter.format(new Date(order.createdAt))}
            >
              {relativeTime(order.createdAt)}
            </strong>{" "}
            ·{" "}
            <strong style={{ color: "var(--ink-soft)", fontWeight: 600 }}>
              {order.items.length}{" "}
              {order.items.length === 1 ? "line" : "lines"}
            </strong>{" "}
            ·{" "}
            <strong style={{ color: "var(--ink-soft)", fontWeight: 600 }}>
              {order.totalItems}{" "}
              {order.totalItems === 1 ? "copy" : "copies"}
            </strong>
            {binderSummary.length > 0 && (
              <>
                {" · binders "}
                <strong style={{ color: "var(--ink-soft)", fontWeight: 600 }}>
                  {binderSummary
                    .map((b) => formatBinderForDisplay(b))
                    .join(" · ")}
                </strong>
              </>
            )}
          </p>
        </div>

        {/* Total */}
        <div className="text-right shrink-0">
          <div
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Order total
          </div>
          <div
            className="mt-1.5"
            style={{
              fontFamily:
                "var(--font-instrument-serif), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: 44,
              color: "var(--ink)",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "var(--dim)", fontSize: 24, marginRight: 2 }}>
              $
            </span>
            {dollars}
            <span style={{ color: "var(--muted)", fontSize: 24 }}>.{cents}</span>
          </div>
          <div
            className="mt-2"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "var(--muted)",
              letterSpacing: "0.04em",
            }}
          >
            {order.items.length}{" "}
            {order.items.length === 1 ? "line" : "lines"}
          </div>
        </div>
      </header>

      {/* Top messages */}
      {topMessage && (
        <div
          role={topMessage.kind === "error" ? "alert" : "status"}
          className="rounded-lg px-4 py-3"
          style={{
            fontSize: 13,
            background:
              topMessage.kind === "success"
                ? "color-mix(in oklab, var(--accent) 12%, transparent)"
                : "color-mix(in oklab, var(--bad) 10%, transparent)",
            borderLeft: `3px solid ${
              topMessage.kind === "success" ? "var(--accent)" : "var(--bad)"
            }`,
            color: "var(--ink)",
          }}
        >
          {topMessage.text}
        </div>
      )}

      {/* Main two-column grid: items + note (left) / actions + buyer (right) */}
      <div
        className="grid gap-10"
        style={{ gridTemplateColumns: "minmax(0,1fr) 320px" }}
      >
        <main className="min-w-0 space-y-8">
          {/* Items */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2
                className="m-0"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--dim)",
                }}
              >
                Items · pick list
              </h2>
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--muted)",
                  letterSpacing: "0.04em",
                }}
              >
                grouped as the picker will see it
              </span>
            </div>

            <div
              className="rounded-lg overflow-hidden"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {order.items.map((item) => (
                  <li
                    key={`${item.cardId}-${item.binder}-${item.quantity}`}
                    className="grid items-center"
                    style={{
                      gridTemplateColumns: "56px minmax(0,1fr) auto auto",
                      gap: 14,
                      padding: "12px 18px",
                      borderTop:
                        "1px solid color-mix(in oklab, var(--border) 60%, transparent)",
                    }}
                  >
                    <div
                      className="overflow-hidden rounded"
                      style={{
                        width: 56,
                        height: 78,
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          className="block h-full w-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-full w-full items-center justify-center text-[10px]"
                          style={{ color: "var(--muted)" }}
                        >
                          no img
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <span
                        className="block truncate"
                        style={{
                          fontFamily:
                            "var(--font-instrument-serif), ui-serif, Georgia, serif",
                          fontSize: 16,
                          color: "var(--ink)",
                          lineHeight: 1.1,
                        }}
                      >
                        {item.name}
                      </span>
                      <span
                        className="block mt-1"
                        style={{
                          fontFamily: "var(--font-geist-mono), monospace",
                          fontSize: 10,
                          fontWeight: 500,
                          letterSpacing: "0.06em",
                          color: "var(--muted)",
                        }}
                      >
                        <span
                          style={{
                            color: "var(--ink-soft)",
                            fontWeight: 600,
                          }}
                        >
                          {item.setCode.toUpperCase()}
                        </span>
                        <span style={{ color: "var(--dim)", margin: "0 4px" }}>
                          ·
                        </span>
                        <span>#{item.collectorNumber}</span>
                        <span style={{ color: "var(--dim)", margin: "0 4px" }}>
                          ·
                        </span>
                        <span>{item.setName}</span>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 5px",
                            border: "1px solid var(--border)",
                            borderRadius: 2,
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            marginLeft: 6,
                            color: "var(--muted)",
                          }}
                        >
                          {conditionToAbbr(item.condition)}
                        </span>
                      </span>
                    </div>

                    {/* Binder chip */}
                    <span
                      data-binder-pill
                      className="inline-flex items-center"
                      style={{
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        padding: "4px 8px",
                        border: "1px solid var(--border)",
                        borderLeft: `3px solid ${binderColor(item.binder)}`,
                        borderRadius: 3,
                        color: "var(--ink-soft)",
                        background: "var(--surface-2)",
                      }}
                    >
                      [{formatBinderForDisplay(item.binder)}]
                    </span>

                    {/* Price */}
                    <div className="text-right">
                      <div
                        style={{
                          fontFamily: "var(--font-geist-mono), monospace",
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--ink)",
                        }}
                      >
                        {formatCurrency(item.price)} × {item.quantity}
                      </div>
                      <div
                        className="mt-1"
                        style={{
                          fontFamily: "var(--font-geist-mono), monospace",
                          fontSize: 10,
                          fontWeight: 500,
                          color: "var(--muted)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {formatCurrency(item.lineTotal)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Subtotal/total footer */}
              <footer
                className="grid items-baseline px-5 py-3 gap-x-6 gap-y-1"
                style={{
                  gridTemplateColumns: "1fr auto",
                  background: "var(--surface-2)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: "var(--muted)",
                    letterSpacing: "0.04em",
                  }}
                >
                  Subtotal
                </span>
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 12,
                    color: "var(--ink)",
                  }}
                >
                  {currencyFormatter.format(subtotal)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Total
                </span>
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily:
                      "var(--font-instrument-serif), ui-serif, Georgia, serif",
                    fontWeight: 400,
                    fontSize: 22,
                    color: "var(--ink)",
                  }}
                >
                  {currencyFormatter.format(order.totalPrice)}
                </span>
              </footer>
            </div>
          </section>

          {/* Event timeline (replaces the workflow stepper) */}
          <EventTimeline events={timeline} status={order.status} />

          {/* Internal note */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <label
                htmlFor="admin-note"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--dim)",
                }}
              >
                Internal note
              </label>
              <NoteSaveStatus
                saving={noteSaving}
                savedAt={noteSavedAt}
                error={noteError}
                dirty={adminNote !== initialNoteRef.current}
              />
            </div>
            <textarea
              id="admin-note"
              value={adminNote}
              onChange={(event) => {
                setAdminNote(event.target.value);
                setNoteError(null);
              }}
              onBlur={persistNote}
              maxLength={1000}
              rows={3}
              placeholder="Private fulfillment notes for the seller."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-y"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
                minHeight: 80,
                fontFamily: "var(--font-inter), system-ui, sans-serif",
              }}
            />
            <div
              className="mt-1.5 flex items-center justify-between"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                color: "var(--muted)",
                letterSpacing: "0.04em",
              }}
            >
              <span>Private admin-only note. Not shown to buyers.</span>
              <span className="tabular-nums">{adminNote.length} / 1000</span>
            </div>
          </section>
        </main>

        {/* Right rail */}
        <aside className="space-y-4">
          {/* Quick actions */}
          {nextStep && (
            <Card title="Quick actions">
              <ActionButton
                tone="primary"
                onClick={() => handleAdvance(nextStep)}
                disabled={advancing !== null}
              >
                {advancing === nextStep
                  ? "Advancing…"
                  : `→ Mark ${nextStep}`}
              </ActionButton>
              {order.status === "pending" && (
                <ActionButton
                  tone="ghost"
                  onClick={() => handleAdvance("completed")}
                  disabled={advancing !== null}
                >
                  {advancing === "completed" ? "…" : "Skip to done"}
                </ActionButton>
              )}
              <ActionButton
                tone="ghost"
                onClick={() => {
                  window.location.href = `mailto:${order.buyerEmail}`;
                }}
              >
                Email buyer
              </ActionButton>
            </Card>
          )}

          {/* Buyer */}
          <Card title="Buyer">
            <p
              className="m-0"
              style={{
                fontFamily:
                  "var(--font-instrument-serif), ui-serif, Georgia, serif",
                fontSize: 18,
                color: "var(--ink)",
                lineHeight: 1.2,
              }}
            >
              {order.buyerName}
            </p>
            <p className="mt-2 m-0">
              <a
                href={`mailto:${order.buyerEmail}`}
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--accent)",
                  letterSpacing: "0.04em",
                  textDecoration: "none",
                }}
              >
                {order.buyerEmail}
              </a>
            </p>
            {order.buyerPhone ? (
              <p className="mt-1 m-0">
                <a
                  href={`tel:${order.buyerPhone}`}
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: "var(--accent)",
                    letterSpacing: "0.04em",
                    textDecoration: "none",
                  }}
                >
                  {order.buyerPhone}
                </a>
              </p>
            ) : (
              <p
                className="mt-1 m-0"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10,
                  fontStyle: "italic",
                  color: "var(--muted)",
                  letterSpacing: "0.04em",
                }}
              >
                No phone provided.
              </p>
            )}
          </Card>

          {/* Buyer message */}
          <Card title="Buyer message">
            {order.message ? (
              <p
                className="m-0"
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontStyle: "italic",
                  color: "var(--ink-soft)",
                }}
              >
                &ldquo;{order.message}&rdquo;
              </p>
            ) : (
              <p
                className="m-0"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  fontStyle: "italic",
                  color: "var(--muted)",
                  letterSpacing: "0.04em",
                }}
              >
                No message provided.
              </p>
            )}
          </Card>

          {/* Picker hints */}
          {binderSummary.length > 0 && (
            <Card title="Picker hints">
              <p
                className="m-0"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--muted)",
                  letterSpacing: "0.04em",
                  lineHeight: 1.5,
                }}
              >
                Walk binders{" "}
                {binderSummary.map((b, i) => (
                  <span key={b}>
                    <strong
                      style={{ color: "var(--ink-soft)", fontWeight: 600 }}
                    >
                      {formatBinderForDisplay(b)}
                    </strong>
                    {i < binderSummary.length - 1 ? " · " : ""}
                  </span>
                ))}
                .
              </p>
              <p
                className="mt-2 m-0"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--muted)",
                  letterSpacing: "0.04em",
                  lineHeight: 1.5,
                }}
              >
                {order.items.length}{" "}
                {order.items.length === 1 ? "card" : "cards"} ·{" "}
                {order.totalItems}{" "}
                {order.totalItems === 1 ? "copy" : "copies"}.
              </p>
            </Card>
          )}
        </aside>
      </div>

      {/* Danger zone */}
      <section
        aria-labelledby="danger-zone-heading"
        className="pt-8"
        style={{ marginTop: "2rem", borderTop: "1px solid var(--border)" }}
      >
        <div className="mb-3 flex items-center gap-3 pt-6">
          <h2
            id="danger-zone-heading"
            className="m-0"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Danger zone
          </h2>
        </div>

        <div
          className="rounded-lg p-5"
          style={{
            background: "color-mix(in oklab, var(--bad) 5%, var(--surface))",
            border:
              "1px solid color-mix(in oklab, var(--bad) 25%, var(--border))",
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <h3
                className="m-0"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ink)",
                }}
              >
                Cancel this order
              </h3>
              <p
                className="mt-1 m-0"
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--muted)",
                }}
              >
                Marks the order as cancelled without deleting history. Item
                snapshots are preserved. You&rsquo;ll have the option to
                restore inventory quantities.
              </p>
            </div>
            {canCancel ? (
              <button
                type="button"
                onClick={() => {
                  setTopMessage(null);
                  setShowCancelConfirmation(true);
                }}
                disabled={showCancelConfirmation || isCancelling}
                className="rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  border: "1px solid color-mix(in oklab, var(--bad) 40%, var(--border-strong))",
                  color: "var(--bad-soft)",
                  fontFamily: "var(--font-inter), system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel order…
              </button>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10,
                  fontStyle: "italic",
                  color: "var(--muted)",
                  maxWidth: 180,
                  letterSpacing: "0.04em",
                  margin: 0,
                }}
              >
                {order.status === "completed"
                  ? "Completed orders can't be cancelled."
                  : "Already cancelled."}
              </p>
            )}
          </div>

          {showCancelConfirmation && (
            <div
              role="alertdialog"
              aria-label={`Confirm cancellation of ${order.orderRef}`}
              className="mt-5 rounded p-4"
              style={{
                background: "color-mix(in oklab, var(--bad) 8%, transparent)",
                border:
                  "1px solid color-mix(in oklab, var(--bad) 30%, transparent)",
              }}
            >
              <h4
                className="m-0"
                style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
              >
                Cancel {order.orderRef}?
              </h4>
              <p
                className="mt-1 m-0"
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--muted)",
                }}
              >
                This marks the order as cancelled without deleting history.
                Choose whether to restore matching inventory rows below.
              </p>

              <label
                className="mt-4 flex items-start gap-2.5 cursor-pointer"
                style={{ fontSize: 13, color: "var(--ink)" }}
              >
                <input
                  type="checkbox"
                  checked={restoreInventory}
                  onChange={(event) =>
                    setRestoreInventory(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span style={{ fontWeight: 500 }}>
                    Restore inventory quantities
                  </span>
                  <span
                    className="block mt-0.5"
                    style={{ fontSize: 11, color: "var(--muted)" }}
                  >
                    Missing card rows (from re-import) will be skipped and
                    reported.
                  </span>
                </span>
              </label>

              <div
                className="mt-4 pt-4 flex flex-wrap items-center justify-end gap-2"
                style={{
                  borderTop:
                    "1px solid color-mix(in oklab, var(--bad) 20%, transparent)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelConfirmation(false);
                    setRestoreInventory(false);
                  }}
                  disabled={isCancelling}
                  className="rounded disabled:opacity-50"
                  style={{
                    padding: "6px 12px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Keep order
                </button>
                <button
                  type="button"
                  onClick={handleCancelOrder}
                  disabled={isCancelling}
                  className="rounded disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{
                    padding: "6px 12px",
                    background: "var(--bad)",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: 0,
                  }}
                >
                  {isCancelling ? "Cancelling…" : "Confirm cancellation"}
                </button>
              </div>
            </div>
          )}
        </div>

        {isTerminal && (
          <p
            className="mt-3"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              fontStyle: "italic",
              color: "var(--muted)",
              letterSpacing: "0.04em",
            }}
          >
            This order is in a terminal state. No further destructive actions
            are available.
          </p>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Event timeline
// ─────────────────────────────────────────────────────────────────

function EventTimeline({
  events,
  status,
}: {
  events: OrderTimelineEvent[];
  status: OrderStatus;
}) {
  // Each timeline node sits under the rail; the rail itself is a single
  // 1.5px line absolutely positioned behind the dots. We assert "current"
  // on the last non-terminal event so it pulses; if the order is in a
  // terminal state (completed/cancelled) the last event IS the terminal
  // event and gets the done styling instead.
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="m-0"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--dim)",
          }}
        >
          Event timeline
        </h2>
        <span
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: "0.04em",
          }}
        >
          stamped history · not aspirational state
        </span>
      </div>

      <ol
        className="relative m-0 p-0"
        style={{ listStyle: "none" }}
      >
        {/* Rail */}
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            left: 7,
            top: 6,
            bottom: 14,
            width: 1.5,
            background: "var(--border)",
          }}
        />
        {events.map((event, idx) => {
          const isLast = idx === events.length - 1;
          const isTerminal = status === "completed" || status === "cancelled";
          const isCurrent = isLast && !isTerminal;
          return (
            <TimelineEvent
              key={`${event.kind}-${event.at}-${idx}`}
              event={event}
              isCurrent={isCurrent}
              isTerminal={isLast && isTerminal}
            />
          );
        })}
      </ol>
    </section>
  );
}

function TimelineEvent({
  event,
  isCurrent,
  isTerminal,
}: {
  event: OrderTimelineEvent;
  isCurrent: boolean;
  isTerminal: boolean;
}) {
  const dotState =
    event.kind === "cancel"
      ? "cancel"
      : isCurrent
        ? "current"
        : isTerminal
          ? "done"
          : "done";

  return (
    <li
      className="relative"
      style={{ padding: "4px 0 18px 28px" }}
    >
      <TimelineDot state={dotState} />
      <div
        style={{
          fontSize: 13,
          color: "var(--ink)",
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          fontWeight: 500,
          lineHeight: 1.3,
        }}
      >
        {event.label}
        {event.actorEmail && (
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              fontWeight: 500,
              color: "var(--muted)",
              letterSpacing: "0.04em",
              marginLeft: 8,
            }}
          >
            · by {event.actorEmail}
          </span>
        )}
      </div>
      <div
        className="mt-1"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          color: "var(--muted)",
          letterSpacing: "0.04em",
          lineHeight: 1.4,
        }}
        title={absoluteDateFormatter.format(new Date(event.at))}
      >
        {stampString(event.at)} · {relativeTime(event.at)}
      </div>
    </li>
  );
}

function TimelineDot({
  state,
}: {
  state: "current" | "done" | "cancel";
}) {
  const styles: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 6,
    width: 14,
    height: 14,
    borderRadius: "50%",
  };
  if (state === "cancel") {
    return (
      <span
        aria-hidden="true"
        style={{
          ...styles,
          background: "var(--surface-2)",
          border: "1.5px solid var(--muted)",
        }}
      />
    );
  }
  if (state === "current") {
    return (
      <span
        aria-hidden="true"
        style={{
          ...styles,
          background: "var(--accent)",
          border: "1.5px solid var(--accent)",
          boxShadow:
            "0 0 0 4px color-mix(in oklab, var(--accent) 14%, transparent)",
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        ...styles,
        background: "var(--accent)",
        border: "1.5px solid var(--accent)",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// Small atoms (Card / ActionButton / NoteSaveStatus)
// ─────────────────────────────────────────────────────────────────

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <h3
        className="m-0 mb-2.5"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--dim)",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "primary" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="block w-full text-left mb-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        padding: "10px 12px",
        borderRadius: 4,
        background:
          tone === "primary" ? "var(--accent)" : "transparent",
        border: `1px solid ${tone === "primary" ? "var(--accent)" : "var(--border)"}`,
        color: tone === "primary" ? "var(--accent-fg)" : "var(--ink)",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        fontSize: 12,
        fontWeight: tone === "primary" ? 600 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function NoteSaveStatus({
  saving,
  savedAt,
  error,
  dirty,
}: {
  saving: boolean;
  savedAt: number | null;
  error: string | null;
  dirty: boolean;
}) {
  const base: React.CSSProperties = {
    fontFamily: "var(--font-geist-mono), monospace",
    fontSize: 11,
    letterSpacing: "0.04em",
  };
  if (error) {
    return (
      <span role="alert" style={{ ...base, color: "var(--bad-soft)" }}>
        {error}
      </span>
    );
  }
  if (saving) {
    return <span style={{ ...base, color: "var(--muted)" }}>Saving…</span>;
  }
  if (dirty) {
    return (
      <span style={{ ...base, color: "var(--muted)" }}>
        Unsaved · save on blur
      </span>
    );
  }
  if (savedAt) {
    return (
      <span
        style={{
          ...base,
          color: "var(--accent)",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <svg
          aria-hidden="true"
          width={11}
          height={11}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Saved
      </span>
    );
  }
  return null;
}
