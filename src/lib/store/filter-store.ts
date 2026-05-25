import { create } from "zustand";
import type { PublicCard, Finish } from "@/lib/types";

export type SortOption =
  | "recent-desc"
  | "name-asc"
  | "name-desc"
  | "price-desc"
  | "price-asc"
  | "set"
  | "rarity";

export const PRICE_MAX = 100;
export type PriceRange = [number, number];

const DEFAULT_SORT: SortOption = "price-desc";

const RARITY_RANK: Record<string, number> = {
  mythic: 0,
  rare: 1,
  uncommon: 2,
  common: 3,
};

const SEARCH_TOKEN_RE = /^([a-z]+)(<=|>=|!=|=|<|>|:)(.+)$/i;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function searchTokens(query: string): string[] {
  return (
    query.match(/"[^"]+"|'[^']+'|\S+/g)?.map((token) =>
      token.replace(/^["']|["']$/g, ""),
    ) ?? []
  );
}

function compareNumber(actual: number | null | undefined, operator: string, raw: string): boolean {
  if (actual == null) return false;
  const expected = Number(raw);
  if (!Number.isFinite(expected)) return false;

  switch (operator) {
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "!=":
      return actual !== expected;
    case ":":
    case "=":
    default:
      return actual === expected;
  }
}

function parseColorQuery(raw: string): string[] | null {
  const text = normalize(raw).replace(/[^a-z]/g, "");
  if (!text) return null;
  if (text === "c" || text === "colorless") return [];

  const aliases: Record<string, string> = {
    white: "w",
    blue: "u",
    black: "b",
    red: "r",
    green: "g",
  };
  const compact = aliases[text] ?? text;
  const colors = Array.from(new Set(compact.toUpperCase().match(/[WUBRG]/g) ?? []));
  return colors.length > 0 ? colors : null;
}

function setsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function matchesColorQuery(
  colorIdentity: string[],
  operator: string,
  raw: string,
): boolean {
  const expected = parseColorQuery(raw);
  if (expected == null) return false;
  const actual = Array.from(new Set(colorIdentity));
  const actualSubsetOfExpected = actual.every((color) => expected.includes(color));
  const actualSupersetOfExpected = expected.every((color) => actual.includes(color));
  const exact = setsEqual(actual, expected);

  switch (operator) {
    case "<":
      return actual.length < expected.length && actualSubsetOfExpected;
    case "<=":
      return actualSubsetOfExpected;
    case ">":
      return actual.length > expected.length && actualSupersetOfExpected;
    case ">=":
      return actualSupersetOfExpected;
    case "!=":
      return !exact;
    case ":":
    case "=":
    default:
      return exact;
  }
}

function fieldIncludes(value: string | null | undefined, needle: string): boolean {
  return normalize(value).includes(normalize(needle));
}

function matchesSearchToken(card: PublicCard, token: string): boolean {
  const tokenMatch = token.match(SEARCH_TOKEN_RE);
  if (!tokenMatch) {
    const needle = normalize(token);
    return [
      card.name,
      card.setCode,
      card.setName,
      card.collectorNumber,
      card.oracleText,
      card.typeLine,
      card.rarity,
    ].some((value) => normalize(value).includes(needle));
  }

  const [, rawKey, operator, rawValue] = tokenMatch;
  const key = rawKey.toLowerCase();
  const value = rawValue.trim();

  switch (key) {
    case "t":
    case "type":
      return fieldIncludes(card.typeLine, value);
    case "o":
    case "oracle":
      return fieldIncludes(card.oracleText, value);
    case "n":
    case "name":
      return fieldIncludes(card.name, value);
    case "set":
    case "s":
      return normalize(card.setCode) === normalize(value) || fieldIncludes(card.setName, value);
    case "r":
    case "rarity":
      return normalize(card.rarity).startsWith(normalize(value));
    case "f":
    case "finish":
      return normalize(card.finish) === normalize(value);
    case "id":
    case "identity":
    case "c":
    case "color":
      return matchesColorQuery(card.colorIdentity, operator, value);
    case "cmc":
    case "mv":
    case "mana":
      return compareNumber(card.manaValue, operator, value);
    default:
      return false;
  }
}

function matchesSearchQuery(card: PublicCard, query: string): boolean {
  return searchTokens(query).every((token) => matchesSearchToken(card, token));
}

interface FilterState {
  /** Source data set once on mount */
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
  /** Finish filter — 'normal' | 'foil' | 'etched' (Phase 17 — etched is first-class). */
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
    set((state) => ({
      searchQuery: state.searchQuery,
      selectedColors: new Set<string>(),
      selectedSets: new Set<string>(),
      selectedRarities: new Set<string>(),
      selectedTypes: new Set<string>(),
      selectedFinishes: new Set<Finish>(),
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
      selectedTypes,
      selectedFinishes,
      priceRange,
      sortBy,
    } = get();

    let result = allCards;

    const query = searchQuery.trim();
    if (query) {
      result = result.filter((card) => matchesSearchQuery(card, query));
    }

    if (selectedColors.size > 0) {
      const wantsColorless = selectedColors.has("C");
      const colorCodes = [...selectedColors].filter((c) => c !== "C");

      // Subset semantics (matches Scryfall's c<= operator): a card matches when
      // its color identity is fully contained in the selected colors. Selecting
      // W+U yields mono-W, mono-U, and W+U cards; not W+G or 3-color cards.
      result = result.filter((card) => {
        if (card.colorIdentity.length === 0) return wantsColorless;
        return card.colorIdentity.every((ci) => colorCodes.includes(ci));
      });
    }

    if (selectedSets.size > 0) {
      result = result.filter((card) => selectedSets.has(card.setName));
    }

    if (selectedRarities.size > 0) {
      result = result.filter((card) => selectedRarities.has(card.rarity));
    }

    if (selectedTypes.size > 0) {
      result = result.filter((card) => {
        const typeLine = normalize(card.typeLine);
        return [...selectedTypes].some((typeName) =>
          typeLine.includes(typeName.toLowerCase()),
        );
      });
    }

    if (selectedFinishes.size > 0) {
      result = result.filter((card) => selectedFinishes.has(card.finish));
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
        case "recent-desc": {
          const aTime = Date.parse(a.createdAt ?? "");
          const bTime = Date.parse(b.createdAt ?? "");
          const safeATime = Number.isFinite(aTime) ? aTime : Number.NEGATIVE_INFINITY;
          const safeBTime = Number.isFinite(bTime) ? bTime : Number.NEGATIVE_INFINITY;
          return safeBTime - safeATime || a.name.localeCompare(b.name);
        }
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
