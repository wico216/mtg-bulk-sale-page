"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ManaBoxReportActionsProps {
  orderItemIds: number[];
  disabled?: boolean;
}

export function ManaBoxReportActions({
  orderItemIds,
  disabled = false,
}: ManaBoxReportActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueOrderItemIds = useMemo(() => [...new Set(orderItemIds)], [orderItemIds]);
  const isDisabled = disabled || uniqueOrderItemIds.length === 0 || isPending;

  function printReport() {
    if (disabled || uniqueOrderItemIds.length === 0) return;
    window.print();
  }

  async function markRemoved() {
    if (isDisabled) return;
    setMessage(null);
    setError(null);

    const confirmed = window.confirm(
      `Mark ${uniqueOrderItemIds.length} sold line item${uniqueOrderItemIds.length === 1 ? "" : "s"} as removed from ManaBox?\n\nOnly do this after you've removed the pictured cards from your ManaBox collection.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/manabox-removals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderItemIds: uniqueOrderItemIds }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to mark ManaBox removals");
        }
        const markedQuantity = Number(data.result?.markedQuantity ?? 0);
        const skipped = Number(data.result?.skippedItemIds?.length ?? 0);
        setMessage(
          skipped > 0
            ? `Marked ${markedQuantity} card${markedQuantity === 1 ? "" : "s"}; ${skipped} line item${skipped === 1 ? " was" : "s were"} already handled or no longer eligible.`
            : `Marked ${markedQuantity} card${markedQuantity === 1 ? "" : "s"} as removed from ManaBox.`,
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to mark ManaBox removals");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={printReport}
        disabled={disabled || uniqueOrderItemIds.length === 0}
        className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: "var(--ink)", color: "var(--bg)" }}
      >
        Print visual report
      </button>
      <button
        type="button"
        onClick={markRemoved}
        disabled={isDisabled}
        className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        {isPending ? "Marking…" : "Mark current report removed"}
      </button>
      {(message || error) && (
        <p
          className="text-sm sm:ml-2"
          style={{ color: error ? "var(--bad)" : "var(--muted)" }}
          role={error ? "alert" : "status"}
        >
          {error ?? message}
        </p>
      )}
    </div>
  );
}
