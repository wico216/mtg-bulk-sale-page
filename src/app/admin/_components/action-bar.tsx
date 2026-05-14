"use client";
import Link from "next/link";

interface ActionBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  setFilter: string;
  onSetFilterChange: (value: string) => void;
  binderFilter: string;
  onBinderFilterChange: (value: string) => void;
  conditionFilter: string;
  onConditionFilterChange: (value: string) => void;
  availableSets: string[];
  availableBinders: string[];
  exporting: boolean;
  onExport: () => void;
  deletingAll: boolean;
  deleteDisabled: boolean;
  onRequestDeleteAll: () => void;
  selectedCount: number;
  deletingSelected: boolean;
  onRequestDeleteSelected: () => void;
  inventoryTotal: number;
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap"
      style={{
        background: active
          ? "color-mix(in oklab, var(--accent) 18%, transparent)"
          : "transparent",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--ink)" : "var(--muted)",
      }}
    >
      {label}
    </button>
  );
}

export function ActionBar({
  search,
  onSearchChange,
  setFilter,
  onSetFilterChange,
  binderFilter,
  onBinderFilterChange,
  conditionFilter,
  onConditionFilterChange,
  availableSets,
  availableBinders,
  exporting,
  onExport,
  deletingAll,
  deleteDisabled,
  onRequestDeleteAll,
  selectedCount,
  deletingSelected,
  onRequestDeleteSelected,
  inventoryTotal,
}: ActionBarProps) {
  const bulkDeleteDisabled = selectedCount === 0 || deletingSelected;
  const hasFilter = search || setFilter || conditionFilter || binderFilter;

  return (
    <div
      className="sticky top-[57px] z-20 -mx-4 px-4 py-3 mb-4 backdrop-blur"
      style={{
        background: "color-mix(in oklab, var(--bg) 90%, transparent)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex flex-col gap-3">
        {/* Row 1: search + primary actions */}
        <div className="flex flex-wrap items-center gap-2">
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
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search cards by name"
              className="w-full rounded-md pl-8 pr-8 py-2 text-sm transition-colors focus:outline-none"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
              }}
            />
            {search && (
              <button
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

          <span
            className="text-xs tabular-nums whitespace-nowrap"
            style={{ color: "var(--muted)" }}
          >
            <span style={{ color: "var(--accent)" }}>✦</span>{" "}
            <span style={{ color: "var(--ink)" }}>
              {inventoryTotal.toLocaleString()}
            </span>{" "}
            total
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link
              href="/admin/import"
              className="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              Import CSV
            </Link>
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
              }}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        {/* Row 2: filter chips + dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            Binder
          </span>
          <Chip
            label="All"
            active={binderFilter === ""}
            onClick={() => onBinderFilterChange("")}
          />
          {availableBinders.map((b) => (
            <Chip
              key={b}
              label={b}
              active={binderFilter === b}
              onClick={() => onBinderFilterChange(b)}
            />
          ))}

          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px"
            style={{ background: "var(--border)" }}
          />

          <select
            value={setFilter}
            onChange={(e) => onSetFilterChange(e.target.value)}
            aria-label="Filter by set"
            className="rounded-md px-2.5 py-1 text-xs transition-colors focus:outline-none"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
          >
            <option value="">All sets</option>
            {availableSets.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={conditionFilter}
            onChange={(e) => onConditionFilterChange(e.target.value)}
            aria-label="Filter by condition"
            className="rounded-md px-2.5 py-1 text-xs transition-colors focus:outline-none"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
          >
            <option value="">All conditions</option>
            <option value="near_mint">NM</option>
            <option value="lightly_played">LP</option>
            <option value="moderately_played">MP</option>
            <option value="heavily_played">HP</option>
            <option value="damaged">DMG</option>
          </select>

          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                onSearchChange("");
                onSetFilterChange("");
                onBinderFilterChange("");
                onConditionFilterChange("");
              }}
              className="ml-1 text-xs underline-offset-2 hover:underline"
              style={{ color: "var(--muted)" }}
            >
              Clear filters
            </button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selectedCount > 0 && (
              <>
                <span
                  className="text-xs font-semibold rounded-md px-2 py-1"
                  style={{
                    background: "color-mix(in oklab, var(--accent) 16%, transparent)",
                    color: "var(--ink)",
                  }}
                >
                  {selectedCount} selected
                </span>
                <button
                  type="button"
                  onClick={onRequestDeleteSelected}
                  disabled={bulkDeleteDisabled}
                  className="rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "rgb(220 38 38 / 0.12)",
                    border: "1px solid rgb(220 38 38 / 0.4)",
                    color: "rgb(248 113 113)",
                  }}
                >
                  {deletingSelected
                    ? "Deleting…"
                    : `Delete ${selectedCount}`}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onRequestDeleteAll}
              disabled={deleteDisabled || deletingAll}
              className="rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--muted)",
              }}
            >
              {deletingAll ? "Deleting…" : "Delete inventory"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
