"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminOrderDetail, OrderStatus } from "@/db/orders";
import { conditionToAbbr } from "@/lib/condition-map";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type WorkflowStatus = Exclude<OrderStatus, "cancelled">;

const ORDER_WORKFLOW_STATUSES: Array<{ value: WorkflowStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
];

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

function formatCurrency(value: number | null): string {
  return value === null ? "N/A" : currencyFormatter.format(value);
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function workflowStatusFromOrder(status: OrderStatus): WorkflowStatus {
  return status === "cancelled" ? "pending" : status;
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

export function OrderDetail({ order }: { order: AdminOrderDetail }) {
  const router = useRouter();
  const [status, setStatus] = useState<WorkflowStatus>(
    workflowStatusFromOrder(order.status),
  );
  const [adminNote, setAdminNote] = useState(order.adminNote ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [restoreInventory, setRestoreInventory] = useState(false);
  const [message, setMessage] = useState<
    | { kind: "success"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);

  useEffect(() => {
    setStatus(workflowStatusFromOrder(order.status));
    setAdminNote(order.adminNote ?? "");
    setShowCancelConfirmation(false);
    setRestoreInventory(false);
  }, [order.orderRef, order.status, order.adminNote]);

  const hasStatusChange = order.status !== "cancelled" && status !== order.status;
  const hasNoteChange = adminNote !== (order.adminNote ?? "");
  const hasChanges = hasStatusChange || hasNoteChange;
  const canCancel = order.status === "pending" || order.status === "confirmed";

  async function handleSaveWorkflow() {
    setIsSaving(true);
    setMessage(null);

    try {
      const payload: { status?: WorkflowStatus; adminNote?: string } = { adminNote };
      if (hasStatusChange) payload.status = status;

      const response = await fetch(`/api/admin/orders/${order.orderRef}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let error = `Order update failed (${response.status})`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) error = body.error;
        } catch {}
        setMessage({ kind: "error", text: error });
        return;
      }

      setMessage({ kind: "success", text: "Order workflow updated." });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelOrder() {
    setIsCancelling(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/orders/${order.orderRef}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restoreInventory }),
      });

      if (!response.ok) {
        let error = `Order cancellation failed (${response.status})`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) error = body.error;
        } catch {}
        setMessage({ kind: "error", text: error });
        return;
      }

      const body = (await response.json()) as {
        result?: CancelOrderSuccessResult;
      };
      if (!body.result) {
        setMessage({ kind: "error", text: "Order cancellation returned no result" });
        return;
      }

      setMessage({ kind: "success", text: describeCancellation(body.result) });
      setShowCancelConfirmation(false);
      setRestoreInventory(false);
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setIsCancelling(false);
    }
  }

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

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="w-full max-w-xs">
            <label
              htmlFor="order-status"
              className="text-sm font-semibold text-zinc-700 dark:text-zinc-200"
            >
              Status
            </label>
            {order.status === "cancelled" ? (
              <div className="mt-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                Cancelled
              </div>
            ) : (
              <select
                id="order-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as WorkflowStatus)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {ORDER_WORKFLOW_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="button"
            onClick={handleSaveWorkflow}
            disabled={isSaving || !hasChanges}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save order workflow"}
          </button>
        </div>

        {order.status === "cancelled" && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Cancelled orders cannot be moved through the normal status workflow.
          </p>
        )}

        <div className="mt-4">
          <label
            htmlFor="admin-note"
            className="text-sm font-semibold text-zinc-700 dark:text-zinc-200"
          >
            Internal note
          </label>
          <textarea
            id="admin-note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Private fulfillment notes for the seller."
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Private admin-only note. Not shown to buyers. {adminNote.length}/1000
          </p>
        </div>

        {message && (
          <div
            role={message.kind === "error" ? "alert" : "status"}
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              message.kind === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            }`}
          >
            {message.text}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50/60 p-4 dark:border-red-950 dark:bg-red-950/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-red-800 dark:text-red-200">
              Cancel order
            </h2>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              Cancellation keeps the order record and item snapshots. Inventory is restored only when explicitly selected.
            </p>
          </div>
          {canCancel ? (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setShowCancelConfirmation(true);
              }}
              disabled={showCancelConfirmation || isCancelling}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel order
            </button>
          ) : (
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {order.status === "completed"
                ? "Completed orders cannot be cancelled through the normal workflow."
                : "This order is already cancelled."}
            </p>
          )}
        </div>

        {showCancelConfirmation && (
          <div
            role="alertdialog"
            aria-label={`Confirm cancellation of ${order.orderRef}`}
            className="mt-4 rounded-lg border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-zinc-950"
          >
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Cancel {order.orderRef}?
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              This marks the order as cancelled without deleting history. Choose whether to restore matching existing inventory rows.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={restoreInventory}
                onChange={(event) => setRestoreInventory(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-accent focus:ring-accent"
              />
              <span>
                Restore inventory quantities for existing card rows. Missing rows will be skipped and reported.
              </span>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={isCancelling}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCancelling ? "Cancelling..." : "Confirm cancellation"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCancelConfirmation(false);
                  setRestoreInventory(false);
                }}
                disabled={isCancelling}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Keep order
              </button>
            </div>
          </div>
        )}
      </section>

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
            Buyer message
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
