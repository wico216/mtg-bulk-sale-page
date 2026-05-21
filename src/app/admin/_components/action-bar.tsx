"use client";
import Link from "next/link";
import { DensityToggle, type RowDensity } from "./density-toggle";
import type { InventorySortKey } from "./filter-rail";

interface ActionBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  density: RowDensity;
  onDensityChange: (next: RowDensity) => void;
  sort: InventorySortKey;
  onSortChange: (next: InventorySortKey) => void;
  exporting: boolean;
  onExport: () => void;
}

const SORT_OPTIONS: ReadonlyArray<{ value: InventorySortKey; label: string }> =
  [
    { value: "name-asc", label: "Name ↑" },
    { value: "name-desc", label: "Name ↓" },
    { value: "quantity-desc", label: "Qty ↓" },
    { value: "quantity-asc", label: "Qty ↑" },
    { value: "price-desc", label: "Price ↓" },
    { value: "price-asc", label: "Price ↑" },
  ];

/**
 * Editorial-terminal toolbar — the band between the heading and the
 * table. Search input owns most of the width; density + sort + export
 * + import sit to the right. Sticks under the admin shell header so it
 * stays in reach while the operator scrolls.
 */
export function ActionBar({
  search,
  onSearchChange,
  density,
  onDensityChange,
  sort,
  onSortChange,
  exporting,
  onExport,
}: ActionBarProps) {
  return (
    <header
      className="sticky z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 backdrop-blur"
      style={{
        top: 56,
        background: "color-mix(in oklab, var(--bg) 88%, transparent)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="grid items-center gap-3 grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto]">
        {/* Search */}
        <label
          className="flex items-center gap-2.5 rounded-md px-3 col-span-3 sm:col-span-1"
          style={{
            height: 38,
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <span
            aria-hidden="true"
            className="flex items-center"
            style={{ color: "var(--muted)" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, set, or oracle text…"
            aria-label="Search inventory"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{
              color: "var(--ink)",
              fontFamily: "var(--font-inter), system-ui, sans-serif",
            }}
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              style={{ color: "var(--muted)" }}
              className="leading-none"
            >
              ✕
            </button>
          ) : (
            <span
              aria-hidden="true"
              className="hidden sm:inline-flex"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--muted)",
                background: "color-mix(in oklab, var(--ink) 8%, transparent)",
                padding: "4px 6px",
                borderRadius: 3,
              }}
            >
              ⌘ K
            </span>
          )}
        </label>

        {/* Density toggle */}
        <DensityToggle value={density} onChange={onDensityChange} />

        {/* Sort selector */}
        <SortSelect value={sort} onChange={onSortChange} options={SORT_OPTIONS} />

        {/* Export + Import (Import is the primary editorial CTA) */}
        <div className="hidden sm:flex items-center gap-2 ml-auto col-start-5">
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="rounded px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            style={{
              background: "transparent",
              border: "1px solid var(--border-strong)",
              color: "var(--ink)",
              fontFamily: "var(--font-inter), system-ui, sans-serif",
            }}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <Link
            href="/admin/import"
            className="rounded px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1"
            style={{
              background: "var(--ink)",
              color: "var(--bg)",
              border: "1px solid var(--ink)",
              fontFamily: "var(--font-inter), system-ui, sans-serif",
            }}
          >
            Import CSV <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function SortSelect({
  value,
  onChange,
  options,
}: {
  value: InventorySortKey;
  onChange: (next: InventorySortKey) => void;
  options: ReadonlyArray<{ value: InventorySortKey; label: string }>;
}) {
  return (
    <label
      className="inline-flex items-center gap-2 rounded-md px-3"
      style={{
        height: 38,
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        Sort
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as InventorySortKey)}
        aria-label="Sort order"
        className="bg-transparent outline-none text-xs font-medium cursor-pointer"
        style={{
          color: "var(--ink)",
          fontFamily: "var(--font-inter), system-ui, sans-serif",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
