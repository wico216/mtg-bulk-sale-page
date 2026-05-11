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
}: ActionBarProps) {
  const bulkDeleteDisabled = selectedCount === 0 || deletingSelected;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      {/* Search input (D-09, D-11) */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search cards by name"
          className="w-64 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-accent dark:border-zinc-700"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
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

      {/* Set filter dropdown (D-10, D-11) */}
      <select
        value={setFilter}
        onChange={(e) => onSetFilterChange(e.target.value)}
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent dark:border-zinc-700"
      >
        <option value="">All sets</option>
        {availableSets.map((s) => (
          <option key={s} value={s}>
            {s.toUpperCase()}
          </option>
        ))}
      </select>

      {/* Binder filter dropdown (Phase 21 D-02) — verbatim lowercase per
          Phase 17 D-04 (binder names are NOT uppercased like set codes). */}
      <select
        value={binderFilter}
        onChange={(e) => onBinderFilterChange(e.target.value)}
        aria-label="Filter by binder"
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent dark:border-zinc-700"
      >
        <option value="">All binders</option>
        {availableBinders.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      {/* Condition filter dropdown (D-10, D-11) */}
      <select
        value={conditionFilter}
        onChange={(e) => onConditionFilterChange(e.target.value)}
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent dark:border-zinc-700"
      >
        <option value="">All conditions</option>
        <option value="near_mint">NM</option>
        <option value="lightly_played">LP</option>
        <option value="moderately_played">MP</option>
        <option value="heavily_played">HP</option>
        <option value="damaged">DMG</option>
      </select>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {selectedCount} selected
        </span>

        <button
          type="button"
          onClick={onRequestDeleteSelected}
          disabled={bulkDeleteDisabled}
          className={`rounded-md border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20 ${
            bulkDeleteDisabled ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          {deletingSelected ? "Deleting selected..." : "Delete selected"}
        </button>

        <button
          type="button"
          onClick={onRequestDeleteAll}
          disabled={deleteDisabled || deletingAll}
          className={`rounded-md border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20 ${
            deleteDisabled || deletingAll ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          {deletingAll ? "Deleting..." : "Delete inventory"}
        </button>

        {/* D-02: Import CSV link (navigates — not a mutation — so it's a Link, not a button) */}
        <Link
          href="/admin/import"
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Import CSV
        </Link>

        {/* Export CSV button (D-12) */}
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className={`rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover ${
            exporting ? "cursor-not-allowed opacity-70" : ""
          }`}
        >
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>
    </div>
  );
}
