import { describe, it, expect, beforeEach } from "vitest";
import type { PublicCard } from "@/lib/types";
import { PRICE_MAX, useFilterStore } from "../filter-store";

function publicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "low-1-normal-near_mint",
    name: "Budget Card",
    setCode: "low",
    setName: "Low Set",
    collectorNumber: "1",
    price: 1,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: ["R"],
    imageUrl: null,
    oracleText: null,
    typeLine: null,
    manaValue: null,
    rarity: "common",
    finish: "normal",
    ...overrides,
  };
}

function resetFilterStore(cards: PublicCard[]) {
  useFilterStore.setState({
    allCards: cards,
    searchQuery: "",
    selectedColors: new Set<string>(),
    selectedSets: new Set<string>(),
    selectedRarities: new Set<string>(),
    selectedTypes: new Set<string>(),
    selectedFinishes: new Set(),
    priceRange: [0, PRICE_MAX],
    sortBy: "price-desc",
  });
}

describe("filter-store defaults", () => {
  beforeEach(() => {
    resetFilterStore([
      publicCard(),
      publicCard({
        id: "high-1-normal-near_mint",
        name: "Expensive Card",
        setCode: "high",
        setName: "High Set",
        collectorNumber: "1",
        price: 10,
      }),
    ]);
  });

  it("defaults storefront sorting to price high to low", () => {
    expect(useFilterStore.getInitialState().sortBy).toBe("price-desc");
    expect(useFilterStore.getState().sortBy).toBe("price-desc");
    expect(useFilterStore.getState().getFilteredCards().map((card) => card.name)).toEqual([
      "Expensive Card",
      "Budget Card",
    ]);
  });
});

describe("filter-store Scryfall-style search", () => {
  beforeEach(() => {
    resetFilterStore([
      publicCard({
        id: "lea-1-normal-near_mint",
        name: "Goblin Guide",
        setCode: "lea",
        setName: "Alpha",
        collectorNumber: "1",
        price: 5,
        colorIdentity: ["R"],
        oracleText: "Haste",
        typeLine: "Creature — Goblin Scout",
        manaValue: 1,
        rarity: "rare",
      }),
      publicCard({
        id: "lea-161-normal-near_mint",
        name: "Lightning Bolt",
        setCode: "lea",
        setName: "Alpha",
        collectorNumber: "161",
        price: 2,
        colorIdentity: ["R"],
        oracleText: "Lightning Bolt deals 3 damage to any target.",
        typeLine: "Instant",
        manaValue: 1,
        rarity: "common",
      }),
      publicCard({
        id: "brc-1-normal-near_mint",
        name: "Sol Ring",
        setCode: "brc",
        setName: "The Brothers' War Commander",
        collectorNumber: "1",
        price: 1,
        colorIdentity: [],
        oracleText: "{T}: Add {C}{C}.",
        typeLine: "Artifact",
        manaValue: 1,
        rarity: "uncommon",
      }),
    ]);
  });

  it("matches type, mana value comparison, and color identity tokens", () => {
    useFilterStore.getState().setSearchQuery("t:goblin cmc<=1 id:r");

    expect(useFilterStore.getState().getFilteredCards().map((card) => card.name)).toEqual([
      "Goblin Guide",
    ]);
  });

  it("matches oracle text, rarity, set, and name tokens", () => {
    useFilterStore.getState().setSearchQuery("o:damage r:common set:lea n:bolt");

    expect(useFilterStore.getState().getFilteredCards().map((card) => card.name)).toEqual([
      "Lightning Bolt",
    ]);
  });

  it("filters by menu card type and clears search plus filters", () => {
    useFilterStore.getState().setSearchQuery("Sol");
    useFilterStore.getState().toggleType("Artifact");

    expect(useFilterStore.getState().hasActiveFilters()).toBe(true);
    expect(useFilterStore.getState().getFilteredCards().map((card) => card.name)).toEqual([
      "Sol Ring",
    ]);

    useFilterStore.getState().clearFilters();

    expect(useFilterStore.getState().searchQuery).toBe("");
    expect(useFilterStore.getState().selectedTypes.size).toBe(0);
    expect(useFilterStore.getState().hasActiveFilters()).toBe(false);
  });
});
