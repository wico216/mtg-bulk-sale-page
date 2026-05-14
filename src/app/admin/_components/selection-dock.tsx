"use client";

interface SelectionDockProps {
  count: number;
  deleting: boolean;
  exporting: boolean;
  onRequestDelete: () => void;
  onExport: () => void;
  onClear: () => void;
}

/**
 * Floating bottom-center action bar that appears when the operator has
 * selected one or more rows. Replaces the "N selected" chip + Delete-
 * selected button that used to live in the ActionBar.
 *
 * Pattern: iOS Mail / Apple Notes selection mode. Backdrop blur + brand
 * surface + strong border + slide-up entrance.
 */
export function SelectionDock({
  count,
  deleting,
  exporting,
  onRequestDelete,
  onExport,
  onClear,
}: SelectionDockProps) {
  if (count === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-40 px-4 pointer-events-none"
      role="region"
      aria-label="Bulk selection actions"
    >
      <div className="mx-auto max-w-md pointer-events-auto">
        <div
          className="rounded-2xl backdrop-blur flex items-center gap-2 px-3 py-2"
          style={{
            background: "color-mix(in oklab, var(--surface) 92%, transparent)",
            border: "1px solid var(--border-strong)",
            boxShadow:
              "0 10px 25px -8px color-mix(in oklab, var(--bg) 60%, transparent), 0 4px 10px -4px color-mix(in oklab, var(--ink) 30%, transparent)",
            animation:
              "admin-slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums whitespace-nowrap"
            style={{
              background: "color-mix(in oklab, var(--accent) 20%, transparent)",
              color: "var(--ink)",
            }}
          >
            <span style={{ color: "var(--accent)" }} aria-hidden="true">
              ✦
            </span>
            {count.toLocaleString()} selected
          </span>

          <div className="flex-1" />

          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
          >
            {exporting ? "Exporting…" : "Export"}
          </button>

          <button
            type="button"
            onClick={onRequestDelete}
            disabled={deleting}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            style={{
              background: "rgb(220 38 38 / 0.16)",
              border: "1px solid rgb(220 38 38 / 0.4)",
              color: "rgb(248 113 113)",
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>

          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="rounded-lg h-8 w-8 inline-flex items-center justify-center transition-colors"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
