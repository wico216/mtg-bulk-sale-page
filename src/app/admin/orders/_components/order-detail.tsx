"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminOrderDetail, OrderStatus, OrderWorkflowStatus } from "@/db/orders";
import { conditionToAbbr } from "@/lib/condition-map";

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
// Status workflow stepper
// ─────────────────────────────────────────────────────────────────

const WORKFLOW: ReadonlyArray<{
  value: OrderWorkflowStatus;
  label: string;
  helper: string;
}> = [
  { value: "pending", label: "Pending", helper: "Awaiting acceptance" },
  {
    value: "confirmed",
    label: "Confirmed",
    helper: "Accepted, fulfilling",
  },
  { value: "completed", label: "Completed", helper: "Shipped / handed off" },
];

function StepperDot({
  state,
}: {
  state: "done" | "current" | "future" | "cancelled";
}) {
  if (state === "cancelled") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
        style={{
          background: "var(--surface-2)",
          border: "1.5px solid var(--border-strong)",
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors"
      style={{
        background:
          state === "done" || state === "current"
            ? "var(--accent)"
            : "var(--surface-2)",
        border:
          state === "current"
            ? "3px solid color-mix(in oklab, var(--accent) 28%, transparent)"
            : `1.5px solid ${state === "done" ? "var(--accent)" : "var(--border-strong)"}`,
        boxShadow:
          state === "current"
            ? "0 0 0 4px color-mix(in oklab, var(--accent) 14%, transparent)"
            : undefined,
      }}
    />
  );
}

function StatusWorkflowStepper({
  status,
  onAdvance,
  advancing,
}: {
  status: OrderStatus;
  onAdvance: (next: OrderWorkflowStatus) => Promise<void>;
  advancing: OrderWorkflowStatus | null;
}) {
  const isCancelled = status === "cancelled";
  const currentIndex = isCancelled
    ? -1
    : WORKFLOW.findIndex((s) => s.value === status);
  const nextStep =
    currentIndex >= 0 && currentIndex < WORKFLOW.length - 1
      ? WORKFLOW[currentIndex + 1]
      : null;

  return (
    <section
      aria-label="Order workflow"
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <header className="flex items-baseline justify-between mb-4">
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--muted)" }}
        >
          Workflow
        </h2>
        {isCancelled && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              background: "color-mix(in oklab, var(--ink) 8%, transparent)",
              color: "var(--muted)",
            }}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--muted)" }}
            />
            Cancelled
          </span>
        )}
      </header>

      {/* Stepper rail */}
      <div className="relative">
        {/* Background track */}
        <div
          aria-hidden="true"
          className="absolute left-[7px] right-[7px] top-[6px] h-0.5 rounded-full"
          style={{
            background: "var(--border)",
          }}
        />
        {/* Filled track up to current step */}
        {!isCancelled && currentIndex > 0 && (
          <div
            aria-hidden="true"
            className="absolute left-[7px] top-[6px] h-0.5 rounded-full transition-all"
            style={{
              width: `calc(${(currentIndex / (WORKFLOW.length - 1)) * 100}% - 14px)`,
              background: "var(--accent)",
            }}
          />
        )}
        <ol className="relative grid grid-cols-3 gap-2">
          {WORKFLOW.map((step, idx) => {
            const state: "done" | "current" | "future" | "cancelled" =
              isCancelled
                ? "cancelled"
                : idx < currentIndex
                ? "done"
                : idx === currentIndex
                ? "current"
                : "future";
            return (
              <li
                key={step.value}
                className="flex flex-col items-start min-w-0"
              >
                <StepperDot state={state} />
                <div
                  className="mt-2 text-sm font-medium leading-tight"
                  style={{
                    color:
                      state === "current"
                        ? "var(--ink)"
                        : state === "done"
                        ? "var(--ink)"
                        : "var(--muted)",
                  }}
                >
                  {step.label}
                </div>
                <div
                  className="mt-0.5 text-[11px] leading-tight"
                  style={{ color: "var(--muted)" }}
                >
                  {step.helper}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Primary advance action */}
      {nextStep && !isCancelled && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onAdvance(nextStep.value)}
            disabled={advancing !== null}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            {advancing === nextStep.value ? (
              <span>Advancing…</span>
            ) : (
              <>
                <span>Mark as {nextStep.label}</span>
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Or use the timeline above to jump steps.
          </span>
        </div>
      )}

      {/* Backwards / skip controls — quieter ghost buttons */}
      {!isCancelled && (
        <div
          className="mt-4 flex flex-wrap items-center gap-1.5 pt-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span
            className="text-[11px] font-semibold uppercase tracking-wider mr-1"
            style={{ color: "var(--muted)" }}
          >
            Jump to
          </span>
          {WORKFLOW.map((step) => {
            const isCurrent = step.value === status;
            return (
              <button
                key={step.value}
                type="button"
                onClick={() => onAdvance(step.value)}
                disabled={isCurrent || advancing !== null}
                aria-current={isCurrent ? "step" : undefined}
                className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed"
                style={{
                  background: isCurrent
                    ? "color-mix(in oklab, var(--accent) 16%, transparent)"
                    : "transparent",
                  border: `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
                  color: isCurrent ? "var(--ink)" : "var(--muted)",
                  opacity: advancing === step.value ? 0.6 : 1,
                }}
              >
                {advancing === step.value ? "…" : step.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// Order detail
// ─────────────────────────────────────────────────────────────────

export function OrderDetail({ order }: { order: AdminOrderDetail }) {
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

  // Reset when order prop changes (e.g. router.refresh)
  useEffect(() => {
    setAdminNote(order.adminNote ?? "");
    setShowCancelConfirmation(false);
    setRestoreInventory(false);
    setNoteSavedAt(null);
    setNoteError(null);
  }, [order.orderRef, order.status, order.adminNote]);

  // Auto-dismiss the top message after 4s
  useEffect(() => {
    if (!topMessage) return;
    const t = setTimeout(() => setTopMessage(null), 4000);
    return () => clearTimeout(t);
  }, [topMessage]);

  const canCancel = order.status === "pending" || order.status === "confirmed";
  const isTerminal =
    order.status === "completed" || order.status === "cancelled";

  // ── Status transitions ─────────────────────────────────────────
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
      setTopMessage({
        kind: "success",
        text: `Status updated to ${next}.`,
      });
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

  // ── Note auto-save (debounced on blur) ─────────────────────────
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

  // ── Cancel order ───────────────────────────────────────────────
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

  // ── Derived bits ────────────────────────────────────────────────
  const subtotal = order.items.reduce(
    (sum, item) => sum + (item.lineTotal ?? 0),
    0,
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Back link */}
      <div>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 text-sm transition-colors hover:underline"
          style={{ color: "var(--muted)" }}
        >
          <span aria-hidden="true">←</span> Back to Orders
        </Link>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1
              className="font-mono text-xl sm:text-2xl font-semibold tracking-tight"
              style={{ color: "var(--ink)" }}
            >
              {order.orderRef}
            </h1>
            <StatusTopBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Placed{" "}
            <span
              title={absoluteDateFormatter.format(new Date(order.createdAt))}
            >
              {relativeTime(order.createdAt)}
            </span>
            {" · "}
            {order.totalItems} {order.totalItems === 1 ? "item" : "items"}
          </p>
        </div>

        {/* Totals card */}
        <div
          className="rounded-2xl px-5 py-4 text-right shrink-0"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            minWidth: 200,
          }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--muted)" }}
          >
            Order total
          </div>
          <div
            className="mt-1 text-2xl font-semibold tabular-nums leading-none"
            style={{
              color: "var(--ink)",
              fontFamily: "var(--font-display)",
            }}
          >
            {currencyFormatter.format(order.totalPrice)}
          </div>
          <div
            className="mt-2 text-xs tabular-nums"
            style={{ color: "var(--muted)" }}
          >
            {order.totalItems}{" "}
            {order.totalItems === 1 ? "item" : "items"} ·{" "}
            {order.items.length}{" "}
            {order.items.length === 1 ? "row" : "rows"}
          </div>
        </div>
      </header>

      {/* Top-of-page feedback */}
      {topMessage && (
        <div
          role={topMessage.kind === "error" ? "alert" : "status"}
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background:
              topMessage.kind === "success"
                ? "color-mix(in oklab, var(--accent) 12%, transparent)"
                : "rgb(220 38 38 / 0.1)",
            borderLeft: `3px solid ${
              topMessage.kind === "success"
                ? "var(--accent)"
                : "rgb(248 113 113)"
            }`,
            color: "var(--ink)",
          }}
        >
          {topMessage.text}
        </div>
      )}

      {/* Workflow */}
      <StatusWorkflowStepper
        status={order.status}
        onAdvance={handleAdvance}
        advancing={advancing}
      />

      {/* Buyer + Message */}
      <section
        className="rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="p-5 sm:p-6"
          style={{
            borderRight: "1px solid var(--border)",
          }}
        >
          <h2
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--muted)" }}
          >
            Buyer
          </h2>
          <p
            className="mt-2 text-base font-medium"
            style={{ color: "var(--ink)" }}
          >
            {order.buyerName}
          </p>
          <a
            href={`mailto:${order.buyerEmail}`}
            className="text-sm transition-colors hover:underline"
            style={{ color: "var(--accent)" }}
          >
            {order.buyerEmail}
          </a>
        </div>
        <div className="p-5 sm:p-6">
          <h2
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--muted)" }}
          >
            Buyer message
          </h2>
          {order.message ? (
            <p
              className="mt-2 whitespace-pre-wrap text-sm leading-relaxed"
              style={{ color: "var(--ink)" }}
            >
              {order.message}
            </p>
          ) : (
            <p
              className="mt-2 text-sm italic"
              style={{ color: "var(--muted)" }}
            >
              No message provided.
            </p>
          )}
        </div>
      </section>

      {/* Items */}
      <section
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <header
          className="flex items-baseline justify-between px-5 sm:px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--muted)" }}
          >
            Items
          </h2>
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--muted)" }}
          >
            {order.items.length}{" "}
            {order.items.length === 1 ? "line" : "lines"} · {order.totalItems}{" "}
            {order.totalItems === 1 ? "copy" : "copies"}
          </span>
        </header>
        <ul
          role="list"
          className="divide-y"
          style={{ borderColor: "var(--border)" }}
        >
          {order.items.map((item) => (
            <li
              // Phase 21 D-07: include binder in the React key so multi-binder
              // same-card lines (two OrderItems with identical cardId+qty but
              // different binders) reconcile as distinct rows.
              key={`${item.cardId}-${item.binder}-${item.quantity}`}
              className="flex items-center gap-4 px-5 sm:px-6 py-4"
              style={{ borderTopColor: "var(--border)" }}
            >
              <div
                className="h-[80px] w-[58px] flex-shrink-0 overflow-hidden rounded-lg"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt=""
                    aria-hidden="true"
                    width={58}
                    height={80}
                    className="h-[80px] w-[58px] object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-[10px]"
                    style={{ color: "var(--muted)" }}
                  >
                    no img
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {/* Phase 21 D-05/D-06: [binder] pill sourced from
                    item.binder snapshot — NEVER joined to live `cards`.
                    Survives re-imports. Legacy pre-v1.3 rows render
                    '[unsorted]' (Phase 16 D-09 migration default). */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--ink)" }}
                  >
                    {item.name}
                  </span>
                  <span
                    data-binder-pill
                    className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    [{item.binder}]
                  </span>
                </div>
                <div
                  className="mt-1 text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  <span className="font-mono">
                    {item.setCode.toUpperCase()}
                  </span>
                  {" · "}#{item.collectorNumber}
                  {" · "}
                  {item.setName}
                  {" · "}
                  {conditionToAbbr(item.condition)}
                </div>
              </div>

              <div className="text-right tabular-nums shrink-0">
                <div
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  {formatCurrency(item.price)} × {item.quantity}
                </div>
                <div
                  className="mt-0.5 text-sm font-semibold"
                  style={{ color: "var(--ink)" }}
                >
                  {formatCurrency(item.lineTotal)}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Items summary footer */}
        <footer
          className="px-5 sm:px-6 py-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 items-baseline"
          style={{
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Subtotal
          </span>
          <span
            className="text-sm tabular-nums"
            style={{ color: "var(--ink)" }}
          >
            {currencyFormatter.format(subtotal)}
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--ink)" }}
          >
            Total
          </span>
          <span
            className="text-base font-semibold tabular-nums"
            style={{
              color: "var(--ink)",
              fontFamily: "var(--font-display)",
            }}
          >
            {currencyFormatter.format(order.totalPrice)}
          </span>
        </footer>
      </section>

      {/* Internal note */}
      <section
        className="rounded-2xl p-5 sm:p-6"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-baseline justify-between mb-2">
          <label
            htmlFor="admin-note"
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--muted)" }}
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
          }}
        />
        <div
          className="mt-1 flex items-center justify-between text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          <span>Private admin-only note. Not shown to buyers.</span>
          <span className="tabular-nums">{adminNote.length}/1000</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          Danger zone — destructive actions live at the bottom,
          de-emphasized, behind a confirmation gate.
          ───────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="danger-zone-heading"
        className="pt-8"
        style={{ marginTop: "2rem" }}
      >
        <div className="mb-3 flex items-center gap-3">
          <h2
            id="danger-zone-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--muted)" }}
          >
            Danger zone
          </h2>
          <div
            className="flex-1 h-px"
            style={{ background: "var(--border)" }}
          />
        </div>

        <div
          className="rounded-2xl p-5 sm:p-6"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--ink)" }}
              >
                Cancel this order
              </h3>
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{ color: "var(--muted)" }}
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
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                style={{
                  background: "transparent",
                  border: "1px solid rgb(248 113 113 / 0.4)",
                  color: "rgb(248 113 113)",
                }}
              >
                Cancel order…
              </button>
            ) : (
              <p
                className="text-xs italic max-w-[180px]"
                style={{ color: "var(--muted)" }}
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
              className="mt-5 rounded-xl p-4"
              style={{
                background: "rgb(220 38 38 / 0.08)",
                border: "1px solid rgb(220 38 38 / 0.3)",
              }}
            >
              <h4
                className="text-sm font-semibold"
                style={{ color: "var(--ink)" }}
              >
                Cancel {order.orderRef}?
              </h4>
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                This marks the order as cancelled without deleting history.
                Choose whether to restore matching inventory rows below.
              </p>

              <label
                className="mt-4 flex items-start gap-2.5 text-sm cursor-pointer"
                style={{ color: "var(--ink)" }}
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
                  <span className="font-medium">
                    Restore inventory quantities
                  </span>
                  <span
                    className="block text-xs mt-0.5"
                    style={{ color: "var(--muted)" }}
                  >
                    Missing cards rows (from re-import) will be skipped and
                    reported.
                  </span>
                </span>
              </label>

              <div
                className="mt-4 pt-4 flex flex-wrap items-center justify-end gap-2"
                style={{ borderTop: "1px solid rgb(220 38 38 / 0.2)" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelConfirmation(false);
                    setRestoreInventory(false);
                  }}
                  disabled={isCancelling}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--ink)",
                  }}
                >
                  Keep order
                </button>
                <button
                  type="button"
                  onClick={handleCancelOrder}
                  disabled={isCancelling}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{
                    background: "rgb(220 38 38)",
                    color: "white",
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
            className="mt-3 text-[11px] italic"
            style={{ color: "var(--muted)" }}
          >
            This order is in a terminal state. No further destructive
            actions are available.
          </p>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Small atoms
// ─────────────────────────────────────────────────────────────────

function StatusTopBadge({ status }: { status: OrderStatus }) {
  const config: Record<
    OrderStatus,
    { bg: string; fg: string; dot: string; label: string }
  > = {
    pending: {
      bg: "color-mix(in oklab, var(--accent) 16%, transparent)",
      fg: "var(--accent)",
      dot: "var(--accent)",
      label: "Pending",
    },
    confirmed: {
      bg: "color-mix(in oklab, rgb(96 165 250) 20%, transparent)",
      fg: "rgb(147 197 253)",
      dot: "rgb(96 165 250)",
      label: "Confirmed",
    },
    completed: {
      bg: "color-mix(in oklab, var(--ink) 8%, transparent)",
      fg: "var(--muted)",
      dot: "rgb(74 222 128)",
      label: "Completed",
    },
    cancelled: {
      bg: "transparent",
      fg: "var(--muted)",
      dot: "var(--muted)",
      label: "Cancelled",
    },
  };
  const c = config[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{
        background: c.bg,
        color: c.fg,
        border:
          status === "cancelled"
            ? "1px solid var(--border)"
            : "1px solid transparent",
      }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: c.dot }}
      />
      {c.label}
    </span>
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
  if (error) {
    return (
      <span
        className="text-xs"
        style={{ color: "rgb(248 113 113)" }}
        role="alert"
      >
        {error}
      </span>
    );
  }
  if (saving) {
    return (
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        Unsaved · save on blur
      </span>
    );
  }
  if (savedAt) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs"
        style={{ color: "var(--accent)" }}
      >
        <svg
          aria-hidden="true"
          className="h-3 w-3"
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
