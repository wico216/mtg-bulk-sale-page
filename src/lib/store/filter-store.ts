import { create } from "zustand";
import type { Card } from "@/lib/types";

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "price-desc"
  | "price-asc"
  | "set"
  | "rarity";

export const PRICE_MAX = 100;
export type PriceRange = [number, number];

const DEFAULT_SORT: SortOption = "name-asc";

const RARITY_RANK: Record<string, number> = {
  mythic: 0,
  rare: 1,
  uncommon: 2,
  common: 3,
};

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
  /** Finish filter — "foil" | "nonfoil" */
  selectedFinishes: Set<string>;
  /** Price range in USD, [min, max]. PRICE_MAX means "no upper bound". */
  priceRange: PriceRange;
  /** Current sort order */
  sortBy: SortOption;

  setAllCards: (cards: Card[]) => void;
  setSearchQuery: (query: string) => void;
  toggleColor: (color: string) => void;
  toggleSet: (set: string) => void;
  toggleRarity: (rarity: string) => void;
  toggleFinish: (finish: string) => void;
  setPriceRange: (range: PriceRange) => void;
  setSortBy: (sort: SortOption) => void;
  clearFilters: () => void;

  getFilteredCards: () => Card[];
  hasActiveFilters: () => boolean;
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  allCards: [],
  searchQuery: "",
  selectedColors: new Set<string>(),
  selectedSets: new Set<string>(),
  selectedRarities: new Set<string>(),
  selectedFinishes: new Set<string>(),
  priceRange: [0, PRICE_MAX],
  sortBy: DEFAULT_SORT,

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

  toggleFinish: (finish) =>
    set((state) => {
      const next = new Set(state.selectedFinishes);
      next.has(finish) ? next.delete(finish) : next.add(finish);
      return { selectedFinishes: next };
    }),

  setPriceRange: (range) => set({ priceRange: range }),

  setSortBy: (sort) => set({ sortBy: sort }),

  clearFilters: () =>
    set((state) => ({
      searchQuery: state.searchQuery,
      selectedColors: new Set<string>(),
      selectedSets: new Set<string>(),
      selectedRarities: new Set<string>(),
      selectedFinishes: new Set<string>(),
      priceRange: [0, PRICE_MAX],
      sortBy: state.sortBy,
    })),

  getFilteredCards: () => {
    const {
      allCards,
      searchQuery,
      selectedColors,
      selectedSets,
      selectedRarities,
      selectedFinishes,
      priceRange,
      sortBy,
    } = get();

    let result = allCards;

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (card) =>
          card.name.toLowerCase().includes(query) ||
          card.setName.toLowerCase().includes(query),
      );
    }

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

    if (selectedSets.size > 0) {
      result = result.filter((card) => selectedSets.has(card.setName));
    }

    if (selectedRarities.size > 0) {
      result = result.filter((card) => selectedRarities.has(card.rarity));
    }

    if (selectedFinishes.size > 0) {
      result = result.filter((card) => {
        const key = card.foil ? "foil" : "nonfoil";
        return selectedFinishes.has(key);
      });
    }

    const [minPrice, maxPrice] = priceRange;
    if (minPrice > 0 || maxPrice < PRICE_MAX) {
      result = result.filter((card) => {
        const p = card.price ?? 0;
        if (p < minPrice) return false;
        if (maxPrice < PRICE_MAX && p > maxPrice) return false;
        return true;
      });
    }

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
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "set":
          return a.setName.localeCompare(b.setName) || a.name.localeCompare(b.name);
        case "rarity":
          return (RARITY_RANK[a.rarity] ?? 9) - (RARITY_RANK[b.rarity] ?? 9);
        case "name-asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return result;
  },

  hasActiveFilters: () => {
    const {
      searchQuery,
      selectedColors,
      selectedSets,
      selectedRarities,
      selectedFinishes,
      priceRange,
      sortBy,
    } = get();
    return (
      searchQuery.trim().length > 0 ||
      selectedColors.size > 0 ||
      selectedSets.size > 0 ||
      selectedRarities.size > 0 ||
      selectedFinishes.size > 0 ||
      priceRange[0] > 0 ||
      priceRange[1] < PRICE_MAX ||
      sortBy !== DEFAULT_SORT
    );
  },
}));
