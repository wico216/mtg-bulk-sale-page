"use client";

import { type SortOption, useFilterStore } from "@/lib/store/filter-store";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "price-desc", label: "Price (high → low)" },
  { value: "price-asc", label: "Price (low → high)" },
  { value: "set", label: "Set" },
  { value: "rarity", label: "Rarity" },
];

function IconSearch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export default function SortBar() {
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const sortBy = useFilterStore((s) => s.sortBy);
  const setSortBy = useFilterStore((s) => s.setSortBy);
  const getFilteredCards = useFilterStore((s) => s.getFilteredCards);

  const filteredCount = getFilteredCards().length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 32px 0",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 420 }}>
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
          }}
        >
          <IconSearch />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by card name…"
          style={{
            width: "100%",
            padding: "9px 12px 9px 34px",
            border: "1px solid var(--border)",
            borderRadius: 3,
            background: "var(--surface-2)",
            color: "var(--ink)",
            fontSize: 13,
            fontFamily: "inherit",
            boxSizing: "border-box",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 11,
          color: "var(--muted)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {filteredCount.toLocaleString()} {filteredCount === 1 ? "card" : "cards"} in stock
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Sort
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            style={{
              background: "var(--surface-2)",
              color: "var(--ink)",
              border: "1px solid var(--border)",
              padding: "6px 8px",
              fontSize: 12,
              borderRadius: 3,
              fontFamily: "inherit",
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
