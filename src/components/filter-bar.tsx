"use client";

import { useFilterStore } from "@/lib/store/filter-store";

export default function FilterBar() {
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const getFilteredCards = useFilterStore((s) => s.getFilteredCards);
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters);
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const allCards = useFilterStore((s) => s.allCards);

  const filteredCount = getFilteredCards().length;
  const totalCount = allCards.length;

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

        {/* Mana pills, dropdowns, sort -- added in Plan 03-02 */}

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
