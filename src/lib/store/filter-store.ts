import { create } from "zustand";
import type { Card } from "@/lib/types";

export type SortOption = "price-desc" | "price-asc" | "name-asc";

interface FilterState {
  /** Source data set once on mount */
  allCards: Card[];
  /** Text search input */
  searchQuery: string;
  /** Mana color filter (W, U, B, R, G, C) */
  selectedColors: Set<string>;
  /** Set/expansion filter */
  selectedSets: Set<string>;
  /** Rarity filter */
  selectedRarities: Set<string>;
  /** Current sort order */
  sortBy: SortOption;

  // Actions
  setAllCards: (cards: Card[]) => void;
  setSearchQuery: (query: string) => void;
  toggleColor: (color: string) => void;
  toggleSet: (set: string) => void;
  toggleRarity: (rarity: string) => void;
  setSortBy: (sort: SortOption) => void;
  clearFilters: () => void;

  // Derived
  getFilteredCards: () => Card[];
  hasActiveFilters: () => boolean;
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  allCards: [],
  searchQuery: "",
  selectedColors: new Set<string>(),
  selectedSets: new Set<string>(),
  selectedRarities: new Set<string>(),
  sortBy: "price-desc" as SortOption,

  setAllCards: (cards) => set({ allCards: cards }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleColor: (color) =>
    set((state) => {
      const next = new Set(state.selectedColors);
      next.has(color) ? next.delete(color) : next.add(color);
      return { selectedColors: next };
    }),

  toggleSet: (setName) =>
    set((state) => {
      const next = new Set(state.selectedSets);
      next.has(setName) ? next.delete(setName) : next.add(setName);
      return { selectedSets: next };
    }),

  toggleRarity: (rarity) =>
    set((state) => {
      const next = new Set(state.selectedRarities);
      next.has(rarity) ? next.delete(rarity) : next.add(rarity);
      return { selectedRarities: next };
    }),

  setSortBy: (sort) => set({ sortBy: sort }),

  clearFilters: () =>
    set({
      searchQuery: "",
      selectedColors: new Set<string>(),
      selectedSets: new Set<string>(),
      selectedRarities: new Set<string>(),
      sortBy: "price-desc",
    }),

  getFilteredCards: () => {
    const { allCards, searchQuery, selectedColors, selectedSets, selectedRarities, sortBy } =
      get();

    let result = allCards;

    // Name search
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((card) => card.name.toLowerCase().includes(query));
    }

    // Color filter (OR logic)
    if (selectedColors.size > 0) {
      const wantsColorless = selectedColors.has("C");
      const colorCodes = [...selectedColors].filter((c) => c !== "C");

      result = result.filter((card) => {
        if (wantsColorless && card.colorIdentity.length === 0) return true;
        if (colorCodes.length > 0 && card.colorIdentity.some((ci) => colorCodes.includes(ci)))
          return true;
        return false;
      });
    }

    // Set filter
    if (selectedSets.size > 0) {
      result = result.filter((card) => selectedSets.has(card.setName));
    }

    // Rarity filter
    if (selectedRarities.size > 0) {
      result = result.filter((card) => selectedRarities.has(card.rarity));
    }

    // Sort (spread into new array to avoid mutating filtered result)
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "price-desc": {
          if (a.price === null && b.price === null) return 0;
          if (a.price === null) return 1;
          if (b.price === null) return -1;
          return b.price - a.price;
        }
        case "price-asc": {
          if (a.price === null && b.price === null) return 0;
          if (a.price === null) return 1;
          if (b.price === null) return -1;
          return a.price - b.price;
        }
        case "name-asc":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    return result;
  },

  hasActiveFilters: () => {
    const { searchQuery, selectedColors, selectedSets, selectedRarities, sortBy } = get();
    return (
      searchQuery.trim().length > 0 ||
      selectedColors.size > 0 ||
      selectedSets.size > 0 ||
      selectedRarities.size > 0 ||
      sortBy !== "price-desc"
    );
  },
}));
