"use client";
import Link from "next/link";

interface ActionBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  setFilter: string;
  onSetFilterChange: (value: string) => void;
  conditionFilter: string;
  onConditionFilterChange: (value: string) => void;
  availableSets: string[];
  exporting: boolean;
  onExport: () => void;
  deletingAll: boolean;
  deleteDisabled: boolean;
  onRequestDeleteAll: () => void;
}

export function ActionBar({
  search,
  onSearchChange,
  setFilter,
  onSetFilterChange,
  conditionFilter,
  onConditionFilterChange,
  availableSets,
  exporting,
  onExport,
  deletingAll,
  deleteDisabled,
  onRequestDeleteAll,
}: ActionBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Search input (D-09, D-11) */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search cards by name"
          className="w-64 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg
              className="w-4 h-4"
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
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <option value="">All sets</option>
        {availableSets.map((s) => (
          <option key={s} value={s}>
            {s.toUpperCase()}
          </option>
        ))}
      </select>

      {/* Condition filter dropdown (D-10, D-11) */}
      <select
        value={conditionFilter}
        onChange={(e) => onConditionFilterChange(e.target.value)}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <option value="">All conditions</option>
        <option value="near_mint">NM</option>
        <option value="lightly_played">LP</option>
        <option value="moderately_played">MP</option>
        <option value="heavily_played">HP</option>
        <option value="damaged">DMG</option>
      </select>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRequestDeleteAll}
          disabled={deleteDisabled || deletingAll}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20 transition-colors ${
            deleteDisabled || deletingAll ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {deletingAll ? "Deleting..." : "Delete inventory"}
        </button>

        {/* D-02: Import CSV link (navigates — not a mutation — so it's a Link, not a button) */}
        <Link
          href="/admin/import"
          className="px-4 py-1.5 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Import CSV
        </Link>

        {/* Export CSV button (D-12) */}
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors ${
            exporting ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>
    </div>
  );
}
