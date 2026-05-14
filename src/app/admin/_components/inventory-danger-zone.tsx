"use client";

import { useState } from "react";

interface InventoryDangerZoneProps {
  inventoryTotal: number;
  onDeleteAll: () => Promise<void>;
}

/**
 * Bottom-of-page destructive section for the inventory page. Mirrors the
 * "Danger zone" pattern from the order-detail screen and the GitHub
 * repo-settings / macOS System Settings convention: destructive actions
 * live at the bottom, behind a confirmation gate, with quiet visual
 * weight (outlined text button, not a filled red CTA).
 */
export function InventoryDangerZone({
  inventoryTotal,
  onDeleteAll,
}: InventoryDangerZoneProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const empty = inventoryTotal === 0;

  async function handleConfirm() {
    setDeleting(true);
    try {
      await onDeleteAll();
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section
      aria-labelledby="inventory-danger-zone"
      className="pt-8"
      style={{ marginTop: "2.5rem" }}
    >
      <div className="mb-3 flex items-center gap-3">
        <h2
          id="inventory-danger-zone"
          className="text-[10px] font-semibold uppercase tracking-[0.12em]"
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
              Delete all inventory
            </h3>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              Empties the storefront until you import a new CSV. Export first
              if you need a backup. The deletion is recorded in Audit.
            </p>
          </div>
          {empty ? (
            <p
              className="text-xs italic max-w-[180px]"
              style={{ color: "var(--muted)" }}
            >
              Inventory is already empty.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={confirming || deleting}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              style={{
                background: "transparent",
                border: "1px solid rgb(248 113 113 / 0.4)",
                color: "rgb(248 113 113)",
              }}
            >
              Delete inventory…
            </button>
          )}
        </div>

        {confirming && (
          <div
            role="alertdialog"
            aria-label="Confirm deletion of all inventory"
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
              Delete all {inventoryTotal.toLocaleString()} cards?
            </h4>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              This removes every card across every binder. The storefront will
              be empty until you re-import. Item snapshots on past orders are
              preserved.
            </p>
            <div
              className="mt-4 pt-4 flex flex-wrap items-center justify-end gap-2"
              style={{ borderTop: "1px solid rgb(220 38 38 / 0.2)" }}
            >
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--ink)",
                }}
              >
                Keep inventory
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                style={{
                  background: "rgb(220 38 38)",
                  color: "white",
                }}
              >
                {deleting
                  ? "Deleting…"
                  : `Delete ${inventoryTotal.toLocaleString()}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
