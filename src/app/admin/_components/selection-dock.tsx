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
 * Floating bottom-center action dock — visible only when one or more
 * rows are selected. Editorial-terminal aesthetic: ink-coloured pill
 * with bg-coloured text, a mono `count` badge separated from the
 * actions by a thin divider, dock__action buttons that lift on hover.
 *
 * Animation lives in globals.css (`admin-slide-up`).
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

  const divider = `1px solid color-mix(in oklab, var(--bg) 20%, transparent)`;

  return (
    <div
      role="region"
      aria-label="Bulk selection actions"
      className="fixed inset-x-0 z-40 px-4 pointer-events-none"
      style={{ bottom: 24 }}
    >
      <div
        className="mx-auto pointer-events-auto inline-flex items-center gap-3 sm:gap-4"
        style={{
          background: "var(--ink)",
          color: "var(--bg)",
          borderRadius: 10,
          padding: "10px 14px",
          boxShadow:
            "0 24px 60px -8px color-mix(in oklab, var(--bg) 55%, transparent)",
          animation: "admin-slide-up 200ms cubic-bezier(.2,.7,.4,1) both",
          maxWidth: "min(100%, 720px)",
          display: "flex",
        }}
      >
        <span
          className="tabular-nums inline-flex items-baseline gap-1.5"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.04em",
            paddingRight: 14,
            borderRight: divider,
          }}
        >
          <span>{count.toLocaleString()}</span>
          <span style={{ opacity: 0.7, fontWeight: 500 }}>selected</span>
        </span>

        <DockButton onClick={onExport} disabled={exporting}>
          {exporting ? "Exporting…" : "Export"}
          <Kbd>⌥E</Kbd>
        </DockButton>

        <DockButton onClick={onRequestDelete} disabled={deleting} danger>
          {deleting ? "Deleting…" : "Delete"}
          <Kbd>⌫</Kbd>
        </DockButton>

        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="ml-1 leading-none"
          style={{
            background: "transparent",
            color: "color-mix(in oklab, var(--bg) 70%, var(--ink))",
            border: 0,
            cursor: "pointer",
            padding: 4,
            fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function DockButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: "transparent",
        color: "inherit",
        border: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        font: "inherit",
        padding: "6px 10px",
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 500,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (danger) {
          e.currentTarget.style.background =
            "color-mix(in oklab, var(--bad) 28%, transparent)";
          e.currentTarget.style.color = "#ffd5d0";
        } else {
          e.currentTarget.style.background =
            "color-mix(in oklab, var(--bg) 16%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "inherit";
      }}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      style={{
        opacity: 0.5,
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 10,
      }}
    >
      {children}
    </span>
  );
}
