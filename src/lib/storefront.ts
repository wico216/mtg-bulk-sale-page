import type { AdminCard, Finish, PublicCard } from "@/lib/types";

export const STOREFRONT_PAGE_SIZE = 48;
export const PRICE_MAX = 100;

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "price-desc"
  | "price-asc"
  | "set"
  | "rarity";

export const DEFAULT_SORT: SortOption = "price-desc";

export type PriceRange = [number, number];

export const COLOR_KEYS = ["W", "U", "B", "R", "G"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export const RARITY_ORDER = ["mythic", "rare", "uncommon", "common"] as const;
export const TYPE_OPTIONS = [
  "Creature",
  "Land",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
] as const;

const RARITY_RANK: Record<string, number> = {
  mythic: 0,
  rare: 1,
  uncommon: 2,
  common: 3,
};

const SEARCH_TOKEN_RE = /^([a-z]+)(<=|>=|!=|=|<|>|:)(.+)$/i;

export interface StorefrontFacets {
  totalCards: number;
  setCounts: Record<string, number>;
  rarityCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  colorCounts: Record<ColorKey, number>;
  finishCounts: Record<Finish, number>;
  sets: string[];
  rarities: string[];
}

export interface StorefrontQuery {
  searchQuery?: string;
  selectedColors?: string[];
  selectedSets?: string[];
  selectedRarities?: string[];
  selectedTypes?: string[];
  selectedFinishes?: Finish[];
  priceRange?: PriceRange;
  sortBy?: SortOption;
}

export interface StorefrontPageData {
  cards: PublicCard[];
  total: number;
  nextOffset: number | null;
  facets: StorefrontFacets;
}

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

function normalizeFinish(value: string): Finish | null {
  if (value === "normal" || value === "foil" || value === "etched") return value;
  return null;
}

function normalizeSort(value: string | null | undefined): SortOption {
  switch (value) {
    case "name-asc":
    case "name-desc":
    case "price-desc":
    case "price-asc":
    case "set":
    case "rarity":
      return value;
    default:
      return DEFAULT_SORT;
  }
}

function uniqueStrings(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

export function stripAdminFields(cards: AdminCard[]): PublicCard[] {
  return cards.map((card) => {
    const publicCard: Partial<AdminCard> = { ...card };
    delete publicCard.binders;
    return publicCard as PublicCard;
  });
}

export function normalizeStorefrontQuery(query: StorefrontQuery = {}): Required<StorefrontQuery> {
  const min = Math.max(0, Number(query.priceRange?.[0] ?? 0));
  const max = Math.max(min, Number(query.priceRange?.[1] ?? PRICE_MAX));
  const finishes = uniqueStrings(query.selectedFinishes).flatMap((value) => {
    const finish = normalizeFinish(value);
    return finish ? [finish] : [];
  });

  return {
    searchQuery: query.searchQuery ?? "",
    selectedColors: uniqueStrings(query.selectedColors),
    selectedSets: uniqueStrings(query.selectedSets),
    selectedRarities: uniqueStrings(query.selectedRarities).map((value) => value.toLowerCase()),
    selectedTypes: uniqueStrings(query.selectedTypes),
    selectedFinishes: finishes,
    priceRange: [min, max],
    sortBy: normalizeSort(query.sortBy),
  };
}

export function queryFromSearchParams(params: URLSearchParams): Required<StorefrontQuery> {
  const list = (key: string) =>
    params
      .getAll(key)
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);

  return normalizeStorefrontQuery({
    searchQuery: params.get("q") ?? "",
    selectedColors: list("colors"),
    selectedSets: list("sets"),
    selectedRarities: list("rarities"),
    selectedTypes: list("types"),
    selectedFinishes: list("finishes") as Finish[],
    priceRange: [
      Number(params.get("minPrice") ?? 0),
      Number(params.get("maxPrice") ?? PRICE_MAX),
    ],
    sortBy: normalizeSort(params.get("sort")),
  });
}

export function filterCards(cards: PublicCard[], rawQuery: StorefrontQuery = {}): PublicCard[] {
  const query = normalizeStorefrontQuery(rawQuery);
  let result = cards;

  const search = query.searchQuery.trim();
  if (search) {
    result = result.filter((card) => matchesSearchQuery(card, search));
  }

  if (query.selectedColors.length > 0) {
    const wantsColorless = query.selectedColors.includes("C");
    const colorCodes = query.selectedColors.filter((color) => color !== "C");
    result = result.filter((card) => {
      if (card.colorIdentity.length === 0) return wantsColorless;
      return card.colorIdentity.every((ci) => colorCodes.includes(ci));
    });
  }

  if (query.selectedSets.length > 0) {
    const selected = new Set(query.selectedSets);
    result = result.filter((card) => selected.has(card.setName));
  }

  if (query.selectedRarities.length > 0) {
    const selected = new Set(query.selectedRarities);
    result = result.filter((card) => selected.has(card.rarity));
  }

  if (query.selectedTypes.length > 0) {
    result = result.filter((card) => {
      const typeLine = normalize(card.typeLine);
      return query.selectedTypes.some((typeName) =>
        typeLine.includes(typeName.toLowerCase()),
      );
    });
  }

  if (query.selectedFinishes.length > 0) {
    const selected = new Set(query.selectedFinishes);
    result = result.filter((card) => selected.has(card.finish));
  }

  const [minPrice, maxPrice] = query.priceRange;
  if (minPrice > 0 || maxPrice < PRICE_MAX) {
    result = result.filter((card) => {
      const price = card.price ?? 0;
      if (price < minPrice) return false;
      if (maxPrice < PRICE_MAX && price > maxPrice) return false;
      return true;
    });
  }

  return result;
}

export function sortCards(cards: PublicCard[], rawSortBy?: SortOption): PublicCard[] {
  const sortBy = normalizeSort(rawSortBy);
  return [...cards].sort((a, b) => {
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
}

export function filterAndSortCards(cards: PublicCard[], query: StorefrontQuery = {}): PublicCard[] {
  const normalized = normalizeStorefrontQuery(query);
  return sortCards(filterCards(cards, normalized), normalized.sortBy);
}

export function buildStorefrontFacets(cards: PublicCard[]): StorefrontFacets {
  const setCounts: Record<string, number> = {};
  const rarityCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  const colorCounts: Record<ColorKey, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const finishCounts: Record<Finish, number> = { normal: 0, foil: 0, etched: 0 };

  cards.forEach((card) => {
    setCounts[card.setName] = (setCounts[card.setName] ?? 0) + 1;
    rarityCounts[card.rarity] = (rarityCounts[card.rarity] ?? 0) + 1;
    finishCounts[card.finish] = (finishCounts[card.finish] ?? 0) + 1;
    card.colorIdentity.forEach((color) => {
      if (color in colorCounts) colorCounts[color as ColorKey]++;
    });
    const typeLine = card.typeLine?.toLowerCase() ?? "";
    TYPE_OPTIONS.forEach((typeName) => {
      if (typeLine.includes(typeName.toLowerCase())) {
        typeCounts[typeName] = (typeCounts[typeName] ?? 0) + 1;
      }
    });
  });

  return {
    totalCards: cards.length,
    setCounts,
    rarityCounts,
    typeCounts,
    colorCounts,
    finishCounts,
    sets: Object.keys(setCounts).sort(),
    rarities: RARITY_ORDER.filter((rarity) => rarityCounts[rarity]),
  };
}

export function paginateStorefrontCards(
  cards: PublicCard[],
  query: StorefrontQuery = {},
  offset = 0,
  limit = STOREFRONT_PAGE_SIZE,
): StorefrontPageData {
  const safeOffset = Math.max(0, Math.trunc(offset));
  const safeLimit = Math.min(96, Math.max(1, Math.trunc(limit)));
  const filtered = filterAndSortCards(cards, query);
  const page = filtered.slice(safeOffset, safeOffset + safeLimit);
  const nextOffset = safeOffset + page.length < filtered.length ? safeOffset + page.length : null;

  return {
    cards: page,
    total: filtered.length,
    nextOffset,
    facets: buildStorefrontFacets(cards),
  };
}
