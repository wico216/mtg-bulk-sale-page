"use client";

import { useState, useMemo } from "react";
import { useFilterStore } from "@/lib/store/filter-store";
import ManaColorPills from "@/components/mana-color-pills";
import MultiSelect from "@/components/multi-select";
import SortDropdown from "@/components/sort-dropdown";
import FilterBottomSheet from "@/components/filter-bottom-sheet";

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

  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

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

        {/* Mobile result count */}
        <span className="md:hidden text-xs text-zinc-400 ml-auto mr-2">
          {filteredCount}/{totalCount}
        </span>

        {/* Mobile filter icon button */}
        <div className="relative md:hidden">
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            onClick={() => setIsBottomSheetOpen(true)}
            aria-label="Open filters"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
              />
            </svg>
          </button>
          {hasActiveFilters() && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
          )}
        </div>

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

      <FilterBottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
      />
    </div>
  );
}
