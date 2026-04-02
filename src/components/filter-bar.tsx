"use client";

import { useMemo } from "react";
import { useFilterStore } from "@/lib/store/filter-store";
import ManaColorPills from "@/components/mana-color-pills";
import MultiSelect from "@/components/multi-select";
import SortDropdown from "@/components/sort-dropdown";

const RARITY_ORDER = ["mythic", "rare", "uncommon", "common"];

function formatRarity(rarity: string): string {
  return rarity[0].toUpperCase() + rarity.slice(1);
}

export default function FilterBar() {
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const getFilteredCards = useFilterStore((s) => s.getFilteredCards);
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters);
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const allCards = useFilterStore((s) => s.allCards);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const toggleSet = useFilterStore((s) => s.toggleSet);
  const selectedRarities = useFilterStore((s) => s.selectedRarities);
  const toggleRarity = useFilterStore((s) => s.toggleRarity);

  const filteredCount = getFilteredCards().length;
  const totalCount = allCards.length;

  const uniqueSets = useMemo(
    () => [...new Set(allCards.map((c) => c.setName))].sort(),
    [allCards],
  );

  const uniqueRarities = useMemo(
    () =>
      RARITY_ORDER.filter((r) => allCards.some((c) => c.rarity === r)),
    [allCards],
  );

  return (
    <div className="sticky top-0 z-30 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <input
          type="text"
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-48 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />

        {/* Mana color pills (desktop only) */}
        <div className="hidden md:flex">
          <ManaColorPills />
        </div>

        {/* Set dropdown (desktop only) */}
        <div className="hidden md:block">
          <MultiSelect
            label="Set"
            options={uniqueSets}
            selected={selectedSets}
            onToggle={toggleSet}
          />
        </div>

        {/* Rarity dropdown (desktop only) */}
        <div className="hidden md:block">
          <MultiSelect
            label="Rarity"
            options={uniqueRarities}
            selected={selectedRarities}
            onToggle={toggleRarity}
            formatOption={formatRarity}
          />
        </div>

        {/* Sort dropdown (desktop only) */}
        <div className="hidden md:block">
          <SortDropdown />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden md:inline text-xs text-zinc-400">
            Showing {filteredCount} of {totalCount} cards
          </span>
          {hasActiveFilters() && (
            <button
              onClick={clearFilters}
              className="text-xs text-accent hover:text-accent-hover cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
