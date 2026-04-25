"use client";
import { useEffect, useRef, useState } from "react";

interface DeleteInventoryModalProps {
  currentTotal: number;
  onClose: () => void;
  onSuccess: (deletedCount: number) => void;
}

/**
 * Phase 10.1 D-12 typed-DELETE destructive confirmation modal.
 * Reused pattern: title + paragraph + typed-input + Cancel/Confirm.
 * Confirm stays disabled until input.trim() === "DELETE" exactly (case-sensitive).
 *
 * On confirm: DELETE /api/admin/inventory -> awaits { success, deleted }
 * -> bubbles deletedCount via onSuccess so the parent (InventoryTable) can
 * surface the green toast inline and re-fetch the empty inventory.
 */
export function DeleteInventoryModal({
  currentTotal,
  onClose,
  onSuccess,
}: DeleteInventoryModalProps) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the typed-DELETE input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape key closes (when not deleting).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleting, onClose]);

  const canConfirm = typed.trim() === "DELETE" && !deleting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setDeleting(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/admin/inventory", { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setDeleting(false);
      return;
    }

    if (!res.ok) {
      let msg = `Delete failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {}
      setError(msg);
      setDeleting(false);
      return;
    }

    const body = (await res.json()) as { success: true; deleted: number };
    // Hand off the count to the parent — it sets the toast and refreshes.
    onSuccess(body.deleted);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        // Close on backdrop click only (not when inner card clicked) and only when not deleting.
        if (e.target === e.currentTarget && !deleting) onClose();
      }}
    >
      <div className="w-full max-w-md mx-4 rounded-md bg-white dark:bg-zinc-900 shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
        <h2
          id="delete-modal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Delete all inventory
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          This will permanently delete all {currentTotal} cards. Type{" "}
          <strong className="font-mono">DELETE</strong> to confirm.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={deleting}
          aria-label="Type DELETE to confirm inventory deletion"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />

        {error && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-600 dark:text-red-400"
          >
            <p className="font-semibold mb-1">
              Delete failed — your inventory was not changed.
            </p>
            <p>{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm font-semibold rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Deleting…" : "Delete all"}
          </button>
        </div>
      </div>
    </div>
  );
}
