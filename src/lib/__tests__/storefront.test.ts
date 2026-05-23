import { describe, expect, it } from "vitest";
import type { AdminCard, PublicCard } from "@/lib/types";
import {
  STOREFRONT_PAGE_SIZE,
  buildStorefrontFacets,
  filterAndSortCards,
  paginateStorefrontCards,
  stripAdminFields,
} from "../storefront";

function publicCard(index: number, overrides: Partial<PublicCard> = {}): PublicCard {
  const padded = String(index).padStart(2, "0");
  return {
    id: `set-${padded}-normal-near_mint`,
    name: `Card ${padded}`,
    setCode: "set",
    setName: "Test Set",
    collectorNumber: padded,
    price: index,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: ["R"],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "Deal damage",
    typeLine: "Creature — Dragon",
    manaValue: 1,
    rarity: "common",
    finish: "normal",
    ...overrides,
  };
}

describe("storefront pagination", () => {
  it("returns the first server page, total count, and a next offset for infinite scroll", () => {
    const cards = Array.from({ length: 55 }, (_, index) =>
      publicCard(index, { price: index + 1 }),
    );

    const page = paginateStorefrontCards(cards, { sortBy: "price-desc" }, 0, STOREFRONT_PAGE_SIZE);

    expect(page.cards).toHaveLength(48);
    expect(page.total).toBe(55);
    expect(page.nextOffset).toBe(48);
    expect(page.cards[0].name).toBe("Card 54");
  });

  it("returns null nextOffset on the last page", () => {
    const cards = Array.from({ length: 55 }, (_, index) => publicCard(index));

    const page = paginateStorefrontCards(cards, { sortBy: "name-asc" }, 48, STOREFRONT_PAGE_SIZE);

    expect(page.cards).toHaveLength(7);
    expect(page.nextOffset).toBeNull();
  });

  it("applies the same filter/search semantics as the legacy client store", () => {
    const cards = [
      publicCard(0, {
        name: "Goblin Guide",
        setCode: "lea",
        setName: "Alpha",
        price: 10,
        colorIdentity: ["R"],
        oracleText: "Haste",
        typeLine: "Creature — Goblin Scout",
        rarity: "rare",
      }),
      publicCard(1, {
        name: "Sol Ring",
        setCode: "brc",
        setName: "The Brothers' War Commander",
        price: 1,
        colorIdentity: [],
        oracleText: "{T}: Add {C}{C}.",
        typeLine: "Artifact",
        rarity: "uncommon",
      }),
    ];

    expect(
      filterAndSortCards(cards, { searchQuery: "t:goblin cmc<=1 id:r" }).map((card) => card.name),
    ).toEqual(["Goblin Guide"]);
  });

  it("strips admin-only binder data before returning public cards", () => {
    const adminCards: AdminCard[] = [
      {
        ...publicCard(0),
        binders: ["a02", "a05"],
      },
    ];

    const publicCards = stripAdminFields(adminCards);
    const serialized = JSON.stringify(publicCards).toLowerCase();

    expect(publicCards[0]).not.toHaveProperty("binders");
    expect(serialized).not.toContain("binder");
    expect(serialized).not.toContain("a02");
  });

  it("builds public facets from the whole inventory for server-backed filters", () => {
    const facets = buildStorefrontFacets([
      publicCard(0, { setName: "Alpha", rarity: "rare", finish: "foil" }),
      publicCard(1, { setName: "Beta", rarity: "common", colorIdentity: ["G"], finish: "normal" }),
    ]);

    expect(facets.totalCards).toBe(2);
    expect(facets.setCounts).toMatchObject({ Alpha: 1, Beta: 1 });
    expect(facets.rarityCounts).toMatchObject({ rare: 1, common: 1 });
    expect(facets.colorCounts.R).toBe(1);
    expect(facets.colorCounts.G).toBe(1);
    expect(facets.finishCounts.foil).toBe(1);
  });
});
