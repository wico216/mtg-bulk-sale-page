"use client";

import { useMemo } from "react";

export type InventorySortKey =
  | "name-asc"
  | "name-desc"
  | "quantity-desc"
  | "quantity-asc"
  | "price-desc"
  | "price-asc";

interface FilterRailProps {
  binderFilter: string;
  onBinderFilterChange: (value: string) => void;
  availableBinders: string[];
  setFilter: string;
  onSetFilterChange: (value: string) => void;
  availableSets: string[];
  conditionFilter: string;
  onConditionFilterChange: (value: string) => void;
  sort: InventorySortKey;
  onSortChange: (next: InventorySortKey) => void;
  onReset: () => void;
  hasActiveFilter: boolean;
  // Optional: total cards in the unfiltered universe, shown next to "All binders".
  totalUniverse: number;
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3
        className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </h3>
      {children}
    </div>
  );
}

function RadioRow({
  checked,
  label,
  onSelect,
  showCount,
  hint,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
  showCount?: number;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className="group w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left"
      style={{
        background: checked
          ? "color-mix(in oklab, var(--accent) 14%, transparent)"
          : "transparent",
        color: checked ? "var(--ink)" : "var(--muted)",
      }}
      onMouseEnter={(e) => {
        if (!checked) {
          e.currentTarget.style.background =
            "color-mix(in oklab, var(--ink) 5%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        if (!checked) e.currentTarget.style.background = "transparent";
      }}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden="true"
          className="inline-flex h-3 w-3 rounded-full shrink-0 transition-all"
          style={{
            background: checked ? "var(--accent)" : "transparent",
            border: `1.5px solid ${
              checked ? "var(--accent)" : "var(--border-strong)"
            }`,
          }}
        />
        <span className="truncate">
          {label}
          {hint && (
            <span className="ml-1" style={{ color: "var(--muted)" }}>
              {hint}
            </span>
          )}
        </span>
      </span>
      {typeof showCount === "number" && (
        <span
          className="text-[10px] tabular-nums shrink-0"
          style={{ color: "var(--muted)" }}
        >
          {showCount.toLocaleString()}
        </span>
      )}
    </button>
  );
}

const SORT_OPTIONS: ReadonlyArray<{ value: InventorySortKey; label: string }> =
  [
    { value: "name-asc", label: "Name A→Z" },
    { value: "name-desc", label: "Name Z→A" },
    { value: "quantity-desc", label: "Qty high→low" },
    { value: "quantity-asc", label: "Qty low→high" },
    { value: "price-desc", label: "Price high→low" },
    { value: "price-asc", label: "Price low→high" },
  ];

const CONDITION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "All conditions" },
  { value: "near_mint", label: "Near mint" },
  { value: "lightly_played", label: "Lightly played" },
  { value: "moderately_played", label: "Moderately played" },
  { value: "heavily_played", label: "Heavily played" },
  { value: "damaged", label: "Damaged" },
];

export function FilterRail({
  binderFilter,
  onBinderFilterChange,
  availableBinders,
  setFilter,
  onSetFilterChange,
  availableSets,
  conditionFilter,
  onConditionFilterChange,
  sort,
  onSortChange,
  onReset,
  hasActiveFilter,
  totalUniverse,
}: FilterRailProps) {
  // Sort binders so "unsorted" sinks to the bottom; everything else
  // alphabetical. The operator's primary binders ("a02", "a05") naturally
  // surface to the top.
  const sortedBinders = useMemo(() => {
    return [...availableBinders].sort((a, b) => {
      if (a === "unsorted" && b !== "unsorted") return 1;
      if (b === "unsorted" && a !== "unsorted") return -1;
      return a.localeCompare(b);
    });
  }, [availableBinders]);

  const railBody = (
    <div className="space-y-6 lg:pr-4">
      <FilterGroup label="Binder">
        <div className="space-y-0.5">
          <RadioRow
            checked={binderFilter === ""}
            label="All binders"
            onSelect={() => onBinderFilterChange("")}
            showCount={totalUniverse}
          />
          {sortedBinders.map((b) => (
            <RadioRow
              key={b}
              checked={binderFilter === b}
              label={b}
              onSelect={() => onBinderFilterChange(b)}
              hint={b === "unsorted" ? "(legacy)" : undefined}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Set">
        <select
          value={setFilter}
          onChange={(e) => onSetFilterChange(e.target.value)}
          aria-label="Filter by set"
          className="w-full rounded-md px-2.5 py-1.5 text-sm focus:outline-none"
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
      </FilterGroup>

      <FilterGroup label="Condition">
        <select
          value={conditionFilter}
          onChange={(e) => onConditionFilterChange(e.target.value)}
          aria-label="Filter by condition"
          className="w-full rounded-md px-2.5 py-1.5 text-sm focus:outline-none"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          }}
        >
          {CONDITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="Sort by">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as InventorySortKey)}
          aria-label="Sort order"
          className="w-full rounded-md px-2.5 py-1.5 text-sm focus:outline-none"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--ink)",
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      {hasActiveFilter && (
        <button
          type="button"
          onClick={onReset}
          className="text-xs underline-offset-2 hover:underline"
          style={{ color: "var(--muted)" }}
        >
          Reset filters
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile: collapsible accordion */}
      <details
        className="lg:hidden rounded-lg"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <summary
          className="cursor-pointer list-none px-4 py-3 flex items-center justify-between"
          style={{ color: "var(--ink)" }}
        >
          <span className="text-sm font-semibold">Filters</span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {hasActiveFilter ? "Active" : "Tap to expand"}
          </span>
        </summary>
        <div
          className="px-4 pb-4 pt-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {railBody}
        </div>
      </details>

      {/* Desktop: sticky left rail */}
      <aside
        className="hidden lg:block lg:sticky lg:top-[88px] lg:self-start"
        aria-label="Inventory filters"
      >
        {railBody}
      </aside>
    </>
  );
}
