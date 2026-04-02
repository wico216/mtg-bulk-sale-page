"use client";

import { useEffect, useMemo } from "react";
import { useFilterStore } from "@/lib/store/filter-store";
import ManaColorPills from "@/components/mana-color-pills";
import MultiSelect from "@/components/multi-select";
import SortDropdown from "@/components/sort-dropdown";

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
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters);
  const clearFilters = useFilterStore((s) => s.clearFilters);

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

          {/* Set section */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Set
            </p>
            <MultiSelect
              label="Set"
              options={uniqueSets}
              selected={selectedSets}
              onToggle={toggleSet}
            />
          </div>

          {/* Rarity section */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Rarity
            </p>
            <MultiSelect
              label="Rarity"
              options={uniqueRarities}
              selected={selectedRarities}
              onToggle={toggleRarity}
              formatOption={formatRarity}
            />
          </div>

          {/* Sort section */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Sort
            </p>
            <SortDropdown />
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
    </div>
  );
}
