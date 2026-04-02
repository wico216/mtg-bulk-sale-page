"use client";

import { useEffect, useMemo, useState } from "react";
import { useFilterStore, type SortOption } from "@/lib/store/filter-store";
import ManaColorPills from "@/components/mana-color-pills";

const RARITY_ORDER = ["mythic", "rare", "uncommon", "common"];

function formatRarity(rarity: string): string {
  return rarity[0].toUpperCase() + rarity.slice(1);
}

interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FilterBottomSheet({
  isOpen,
  onClose,
}: FilterBottomSheetProps) {
  const allCards = useFilterStore((s) => s.allCards);
  const selectedSets = useFilterStore((s) => s.selectedSets);
  const toggleSet = useFilterStore((s) => s.toggleSet);
  const selectedRarities = useFilterStore((s) => s.selectedRarities);
  const toggleRarity = useFilterStore((s) => s.toggleRarity);
  const sortBy = useFilterStore((s) => s.sortBy);
  const setSortBy = useFilterStore((s) => s.setSortBy);
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters);
  const clearFilters = useFilterStore((s) => s.clearFilters);

  const [isSetSheetOpen, setIsSetSheetOpen] = useState(false);
  const [setSearch, setSetSearch] = useState("");

  const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: "price-desc", label: "Price: High-Low" },
    { value: "price-asc", label: "Price: Low-High" },
    { value: "name-asc", label: "Name: A-Z" },
  ];

  const uniqueSets = useMemo(
    () => [...new Set(allCards.map((c) => c.setName))].sort(),
    [allCards],
  );

  const uniqueRarities = useMemo(
    () => RARITY_ORDER.filter((r) => allCards.some((c) => c.rarity === r)),
    [allCards],
  );

  // Scroll lock when bottom sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <div
      className={`fixed inset-0 z-40 ${isOpen ? "" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Sheet panel */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-zinc-950 rounded-t-2xl transform transition-transform duration-300 ease-out max-h-[60vh] overflow-y-auto ${isOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        {/* Drag handle indicator */}
        <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-full mx-auto mt-3 mb-4" />

        {/* Sheet content */}
        <div className="px-5 pb-6 space-y-5">
          {/* Colors section */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Colors
            </p>
            <ManaColorPills />
          </div>

          {/* Set section — opens its own sheet */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Set
            </p>
            <button
              type="button"
              onClick={() => { setSetSearch(""); setIsSetSheetOpen(true); }}
              className="w-full flex items-center justify-between rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm cursor-pointer"
            >
              <span>
                {selectedSets.size > 0
                  ? `${selectedSets.size} set${selectedSets.size > 1 ? "s" : ""} selected`
                  : "All sets"}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-zinc-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Rarity section — inline pills */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Rarity
            </p>
            <div className="flex gap-2">
              {uniqueRarities.map((rarity) => (
                <button
                  key={rarity}
                  type="button"
                  onClick={() => toggleRarity(rarity)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
                    selectedRarities.has(rarity)
                      ? "border-accent bg-accent/10 text-accent font-medium"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {formatRarity(rarity)}
                </button>
              ))}
            </div>
          </div>

          {/* Sort section */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Sort
            </p>
            <div className="flex gap-2">
              {SORT_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSortBy(value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
                    sortBy === value
                      ? "border-accent bg-accent/10 text-accent font-medium"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear filters button */}
          {hasActiveFilters() && (
            <button
              onClick={() => {
                clearFilters();
                onClose();
              }}
              className="w-full py-2 text-sm text-accent font-medium cursor-pointer"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Set picker sheet */}
      <div
        className={`fixed inset-0 z-50 ${isSetSheetOpen ? "" : "pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${isSetSheetOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setIsSetSheetOpen(false)}
        />
        <div
          className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-zinc-950 rounded-t-2xl transform transition-transform duration-300 ease-out max-h-[70vh] flex flex-col ${isSetSheetOpen ? "translate-y-0" : "translate-y-full"}`}
        >
          <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-full mx-auto mt-3 mb-3" />
          <div className="px-5 pb-2 flex items-center gap-2">
            <input
              type="text"
              placeholder="Search sets..."
              value={setSearch}
              onChange={(e) => setSetSearch(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {selectedSets.size > 0 && (
              <button
                type="button"
                onClick={() => selectedSets.forEach((s) => toggleSet(s))}
                className="text-xs text-accent font-medium whitespace-nowrap cursor-pointer"
              >
                Clear ({selectedSets.size})
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            {uniqueSets
              .filter((s) => s.toLowerCase().includes(setSearch.toLowerCase()))
              .sort((a, b) => {
                const aSelected = selectedSets.has(a);
                const bSelected = selectedSets.has(b);
                if (aSelected && !bSelected) return -1;
                if (!aSelected && bSelected) return 1;
                return 0;
              })
              .map((setName) => (
                <label
                  key={setName}
                  className="flex items-center gap-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSets.has(setName)}
                    onChange={() => toggleSet(setName)}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-sm">{setName}</span>
                </label>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
