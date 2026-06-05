"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InventoryRow } from "@/lib/types";
import { conditionToAbbr } from "@/lib/condition-map";
import { formatBinderForDisplay } from "@/lib/binder-name";

interface VersionEditDialogProps {
  card: InventoryRow | null;
  saving: boolean;
  onClose: () => void;
  onSave: (setCode: string, collectorNumber: string) => Promise<void>;
}

export function VersionEditDialog({
  card,
  saving,
  onClose,
  onSave,
}: VersionEditDialogProps) {
  const [setCode, setSetCode] = useState(() => card?.setCode.toUpperCase() ?? "");
  const [collectorNumber, setCollectorNumber] = useState(
    () => card?.collectorNumber ?? "",
  );
  const setCodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!card) return;
    window.setTimeout(() => setCodeRef.current?.focus(), 0);
  }, [card]);

  useEffect(() => {
    if (!card) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [card, onClose, saving]);

  if (!card) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(setCode, collectorNumber);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-edit-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "color-mix(in oklab, var(--bg) 88%, transparent)",
        backdropFilter: "blur(8px)",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl p-5 sm:p-6 shadow-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--ink)",
          animation: "admin-slide-up 180ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--muted)" }}
            >
              Inventory · version edit
            </p>
            <h2
              id="version-edit-title"
              className="mt-1 text-2xl font-semibold leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Edit printing
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close version editor"
            className="h-9 w-9 rounded-full disabled:opacity-50"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
            }}
          >
            ✕
          </button>
        </div>

        <div
          className="mt-5 rounded-xl p-3 text-sm"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <p className="font-semibold">{card.name}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Current: <span className="font-mono">{card.setCode.toUpperCase()}</span> · #
            {card.collectorNumber} · {card.setName}
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Preserves {formatBinderForDisplay(card.binder)}, {card.finish}, {conditionToAbbr(card.condition)}, qty {card.quantity}.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1.4fr]">
          <label className="grid gap-1.5 text-sm font-medium">
            Set code
            <input
              ref={setCodeRef}
              value={setCode}
              onChange={(event) => setSetCode(event.target.value)}
              placeholder="CLU"
              disabled={saving}
              required
              className="rounded-lg px-3 py-2 font-mono text-sm disabled:opacity-60"
              style={{
                background: "var(--bg)",
                color: "var(--ink)",
                border: "1px solid var(--border)",
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Collector #
            <input
              value={collectorNumber}
              onChange={(event) => setCollectorNumber(event.target.value)}
              placeholder="141"
              disabled={saving}
              required
              className="rounded-lg px-3 py-2 font-mono text-sm disabled:opacity-60"
              style={{
                background: "var(--bg)",
                color: "var(--ink)",
                border: "1px solid var(--border)",
              }}
            />
          </label>
        </div>

        <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          The save validates the exact set/collector printing against Scryfall,
          then refreshes image, Scryfall ID, rules text, rarity, mana, and price
          for the existing inventory row.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{
              background: "transparent",
              color: "var(--ink)",
              border: "1px solid var(--border)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {saving ? "Saving…" : "Save version"}
          </button>
        </div>
      </form>
    </div>
  );
}
