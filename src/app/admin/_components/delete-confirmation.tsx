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
      className="flex items-center justify-between px-4 py-2"
    >
      <span className="text-sm">
        Delete {cardName}?
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`px-3 py-1 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors ${
            deleting ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          {deleting ? "Deleting..." : "Delete Card"}
        </button>
        <button
          onClick={onCancel}
          disabled={deleting}
          className="px-3 py-1 text-sm font-semibold rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Keep Card
        </button>
      </div>
    </div>
  );
}
