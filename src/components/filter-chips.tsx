"use client";

import type { Finish } from "@/lib/types";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";
import { ManaSymbol } from "@/components/mana-symbol";

const COLOR_ORDER = ["W", "U", "B", "R", "G", "C"] as const;
const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};
const FINISH_NAMES: Record<Finish, string> = {
  normal: "Normal",
  foil: "Foil",
  etched: "Etched",
};

function IconX({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

interface Chip {
  key: string;
  label: React.ReactNode;
  ariaLabel: string;
  onRemove: () => void;
}

/**
 * Removable chips for every active filter value, rendered above the desktop
 * grid. Visibility is derived from the filter VALUES themselves — NOT
 * hasActiveFilters(), which also counts a non-default sort and would render
 * an empty chip row when the buyer merely re-sorts.
 */
export default function FilterChips() {
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectedColors = useFilterStore((s) => s.selectedColors);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const selectedRarities = useFilterStore((s) => s.selectedRarities);
  const selectedTypes = useFilterStore((s) => s.selectedTypes);
  const selectedFinishes = useFilterStore((s) => s.selectedFinishes);
  const priceRange = useFilterStore((s) => s.priceRange);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const toggleColor = useFilterStore((s) => s.toggleColor);
  const toggleSet = useFilterStore((s) => s.toggleSet);
  const toggleRarity = useFilterStore((s) => s.toggleRarity);
  const toggleType = useFilterStore((s) => s.toggleType);
  const toggleFinish = useFilterStore((s) => s.toggleFinish);
  const setPriceRange = useFilterStore((s) => s.setPriceRange);
  const clearFilters = useFilterStore((s) => s.clearFilters);

  const chips: Chip[] = [];

  const trimmedQuery = searchQuery.trim();
  if (trimmedQuery) {
    chips.push({
      key: "search",
      label: `“${trimmedQuery}”`,
      ariaLabel: `Remove filter: search ${trimmedQuery}`,
      onRemove: () => setSearchQuery(""),
    });
  }

  for (const color of COLOR_ORDER) {
    if (!selectedColors.has(color)) continue;
    chips.push({
      key: `color-${color}`,
      label: (
        <>
          <ManaSymbol symbol={color} size={13} />
          {COLOR_NAMES[color] ?? color}
        </>
      ),
      ariaLabel: `Remove filter: ${COLOR_NAMES[color] ?? color}`,
      onRemove: () => toggleColor(color),
    });
  }

  for (const rarity of selectedRarities) {
    const label = rarity[0].toUpperCase() + rarity.slice(1);
    chips.push({
      key: `rarity-${rarity}`,
      label,
      ariaLabel: `Remove filter: ${label}`,
      onRemove: () => toggleRarity(rarity),
    });
  }

  for (const typeName of selectedTypes) {
    chips.push({
      key: `type-${typeName}`,
      label: typeName,
      ariaLabel: `Remove filter: ${typeName}`,
      onRemove: () => toggleType(typeName),
    });
  }

  for (const finish of selectedFinishes) {
    const label = FINISH_NAMES[finish] ?? finish;
    chips.push({
      key: `finish-${finish}`,
      label,
      ariaLabel: `Remove filter: ${label} finish`,
      onRemove: () => toggleFinish(finish),
    });
  }

  for (const setName of selectedSets) {
    chips.push({
      key: `set-${setName}`,
      label: setName,
      ariaLabel: `Remove filter: ${setName}`,
      onRemove: () => toggleSet(setName),
    });
  }

  const [priceLo, priceHi] = priceRange;
  if (priceLo > 0 || priceHi < PRICE_MAX) {
    const label = `$${priceLo}–$${priceHi}${priceHi >= PRICE_MAX ? "+" : ""}`;
    chips.push({
      key: "price",
      label,
      ariaLabel: `Remove filter: price ${label}`,
      onRemove: () => setPriceRange([0, PRICE_MAX]),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div
      className="wiko-filter-chips"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "12px 32px 0",
      }}
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="wiko-filter-chip"
          aria-label={chip.ariaLabel}
          onClick={chip.onRemove}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            maxWidth: 260,
            border: "1px solid var(--border)",
            borderRadius: 999,
            background: "var(--surface)",
            color: "var(--ink-soft)",
            padding: "5px 11px",
            fontSize: 11,
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            letterSpacing: "0.04em",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chip.label}
          </span>
          <IconX />
        </button>
      ))}
      <button
        type="button"
        onClick={clearFilters}
        aria-label="Clear all active filters"
        style={{
          background: "none",
          border: "none",
          padding: "5px 4px",
          cursor: "pointer",
          fontSize: 11,
          color: "var(--accent)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          fontFamily: "inherit",
        }}
      >
        Clear all
      </button>
    </div>
  );
}
