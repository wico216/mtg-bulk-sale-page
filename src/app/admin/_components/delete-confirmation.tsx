"use client";
import { useState } from "react";

interface DeleteConfirmationProps {
  cardName: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteConfirmation({
  cardName,
  onConfirm,
  onCancel,
}: DeleteConfirmationProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onConfirm();
  }

  return (
    <div
      role="alertdialog"
      aria-label={`Confirm deletion of ${cardName}`}
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      style={{
        background: "rgb(220 38 38 / 0.08)",
        borderLeft: "2px solid rgb(248 113 113)",
      }}
    >
      <div>
        <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          Delete {cardName}?
        </span>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Export first if you need a backup. A successful delete is recorded in Audit.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          disabled={deleting}
          className="px-3 py-1 text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          }}
        >
          Keep
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-1 text-xs font-semibold rounded-md transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          style={{
            background: "rgb(220 38 38)",
            color: "white",
          }}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
