"use client";
import Link from "next/link";
import { DensityToggle, type RowDensity } from "./density-toggle";

interface ActionBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  density: RowDensity;
  onDensityChange: (next: RowDensity) => void;
  exporting: boolean;
  onExport: () => void;
  displayedCount: number;
  inventoryTotal: number;
  hasFilter: boolean;
}

/**
 * Top-of-content toolbar for the inventory page.
 *
 * Post-v1.4 redesign: this is dramatically slimmer than the original
 * action-bar. Filter chips moved to the left FilterRail; bulk-action
 * buttons moved to the floating SelectionDock; "Delete inventory"
 * moved to the bottom danger zone. What's left here is only the
 * "this is my workbench" controls: search, density, and the two
 * page-level CSV actions (Export current view, Import a new file).
 */
export function ActionBar({
  search,
  onSearchChange,
  density,
  onDensityChange,
  exporting,
  onExport,
  displayedCount,
  inventoryTotal,
  hasFilter,
}: ActionBarProps) {
  return (
    <header
      className="sticky top-[56px] z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 backdrop-blur"
      style={{
        background: "color-mix(in oklab, var(--bg) 88%, transparent)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{ color: "var(--muted)" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
            />
          </svg>
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search cards by name"
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none transition-colors"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--muted)" }}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        <DensityToggle value={density} onChange={onDensityChange} />

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <Link
            href="/admin/import"
            className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            Import CSV <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      <div
        className="mt-2 text-[11px] tabular-nums"
        style={{ color: "var(--muted)" }}
      >
        {hasFilter ? (
          <>
            Showing{" "}
            <span style={{ color: "var(--ink)" }}>
              {displayedCount.toLocaleString()}
            </span>{" "}
            of {inventoryTotal.toLocaleString()} cards
          </>
        ) : (
          <>
            <span style={{ color: "var(--ink)" }}>
              {inventoryTotal.toLocaleString()}
            </span>{" "}
            cards in inventory
          </>
        )}
      </div>
    </header>
  );
}
