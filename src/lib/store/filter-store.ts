import { create } from "zustand";
import type { PublicCard, Finish } from "@/lib/types";
import {
  DEFAULT_SORT,
  PRICE_MAX,
  filterAndSortCards,
  type PriceRange,
  type SortOption,
} from "@/lib/storefront";

export { PRICE_MAX };
export type { PriceRange, SortOption };

interface FilterState {
  /** Optional client-side source data for legacy/local tests and cart-adjacent flows. */
  allCards: PublicCard[];
  /** Text search input */
  searchQuery: string;
  /** Mana color filter (W, U, B, R, G, C) */
  selectedColors: Set<string>;
  /** Set/expansion filter */
  selectedSets: Set<string>;
  /** Rarity filter */
  selectedRarities: Set<string>;
  /** Card type filter (Creature, Land, Instant, etc.) */
  selectedTypes: Set<string>;
  /** Finish filter — 'normal' | 'foil' | 'etched'. */
  selectedFinishes: Set<Finish>;
  /** Price range in USD, [min, max]. PRICE_MAX means "no upper bound". */
  priceRange: PriceRange;
  /** Current sort order */
  sortBy: SortOption;

  setAllCards: (cards: PublicCard[]) => void;
  setSearchQuery: (query: string) => void;
  toggleColor: (color: string) => void;
  toggleSet: (set: string) => void;
  toggleRarity: (rarity: string) => void;
  toggleType: (typeName: string) => void;
  toggleFinish: (finish: Finish) => void;
  setPriceRange: (range: PriceRange) => void;
  setSortBy: (sort: SortOption) => void;
  clearFilters: () => void;

  getFilteredCards: () => PublicCard[];
  hasActiveFilters: () => boolean;
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  allCards: [],
  searchQuery: "",
  selectedColors: new Set<string>(),
  selectedSets: new Set<string>(),
  selectedRarities: new Set<string>(),
  selectedTypes: new Set<string>(),
  selectedFinishes: new Set<Finish>(),
  priceRange: [0, PRICE_MAX],
  sortBy: DEFAULT_SORT,

  setAllCards: (cards) => set({ allCards: cards }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleColor: (color) =>
    set((state) => {
      const next = new Set(state.selectedColors);
      if (next.has(color)) {
        next.delete(color);
      } else {
        next.add(color);
      }
      return { selectedColors: next };
    }),

  toggleSet: (setName) =>
    set((state) => {
      const next = new Set(state.selectedSets);
      if (next.has(setName)) {
        next.delete(setName);
      } else {
        next.add(setName);
      }
      return { selectedSets: next };
    }),

  toggleRarity: (rarity) =>
    set((state) => {
      const next = new Set(state.selectedRarities);
      if (next.has(rarity)) {
        next.delete(rarity);
      } else {
        next.add(rarity);
      }
      return { selectedRarities: next };
    }),

  toggleType: (typeName) =>
    set((state) => {
      const next = new Set(state.selectedTypes);
      if (next.has(typeName)) {
        next.delete(typeName);
      } else {
        next.add(typeName);
      }
      return { selectedTypes: next };
    }),

  toggleFinish: (finish: Finish) =>
    set((state) => {
      const next = new Set(state.selectedFinishes);
      if (next.has(finish)) {
        next.delete(finish);
      } else {
        next.add(finish);
      }
      return { selectedFinishes: next };
    }),

  setPriceRange: (range) => set({ priceRange: range }),

  setSortBy: (sort) => set({ sortBy: sort }),

  clearFilters: () =>
    set(() => ({
      searchQuery: "",
      selectedColors: new Set<string>(),
      selectedSets: new Set<string>(),
      selectedRarities: new Set<string>(),
      selectedTypes: new Set<string>(),
      selectedFinishes: new Set<Finish>(),
      priceRange: [0, PRICE_MAX],
      sortBy: DEFAULT_SORT,
    })),

  getFilteredCards: () => {
    const {
      allCards,
      searchQuery,
      selectedColors,
      selectedSets,
      selectedRarities,
      selectedTypes,
      selectedFinishes,
      priceRange,
      sortBy,
    } = get();

    return filterAndSortCards(allCards, {
      searchQuery,
      selectedColors: [...selectedColors],
      selectedSets: [...selectedSets],
      selectedRarities: [...selectedRarities],
      selectedTypes: [...selectedTypes],
      selectedFinishes: [...selectedFinishes],
      priceRange,
      sortBy,
    });
  },

  hasActiveFilters: () => {
    const {
      searchQuery,
      selectedColors,
      selectedSets,
      selectedRarities,
      selectedTypes,
      selectedFinishes,
      priceRange,
      sortBy,
    } = get();
    return (
      searchQuery.trim().length > 0 ||
      selectedColors.size > 0 ||
      selectedSets.size > 0 ||
      selectedRarities.size > 0 ||
      selectedTypes.size > 0 ||
      selectedFinishes.size > 0 ||
      priceRange[0] > 0 ||
      priceRange[1] < PRICE_MAX ||
      sortBy !== DEFAULT_SORT
    );
  },
}));
