import { describe, expect, it } from "vitest";
import type { PublicCard } from "@/lib/types";
import { matchDeckToInventory, parseDeckText } from "../deck-check";

function card(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "e2e-045-normal-lightly_played",
    name: "Counterspell",
    setCode: "e2e",
    setName: "E2E Masters",
    collectorNumber: "045",
    price: 2,
    condition: "lightly_played",
    quantity: 4,
    colorIdentity: ["U"],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "Counter target spell.",
    typeLine: "Instant",
    manaCost: "{U}{U}",
    manaValue: 2,
    rarity: "uncommon",
    finish: "normal",
    scryfallId: "counterspell-e2e",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("deck-check parser", () => {
  it("parses common exported decklist quantities, set codes, collector numbers, and sections", () => {
    const cards = parseDeckText(`Commander\n1 Atraxa, Praetors' Voice (2X2) 190\n\nDeck\n2x Sol Ring [CMM#400] *F*\n1 Counterspell (DMR) 45\n\nMaybeboard\n1 Rhystic Study`);

    expect(cards).toMatchObject([
      { name: "Atraxa, Praetors' Voice", quantity: 1, section: "commander", setCode: "2x2", collectorNumber: "190" },
      { name: "Sol Ring", quantity: 2, section: "main", setCode: "cmm", collectorNumber: "400", finish: "foil" },
      { name: "Counterspell", quantity: 1, section: "main", setCode: "dmr", collectorNumber: "45" },
      { name: "Rhystic Study", quantity: 1, section: "maybeboard" },
    ]);
  });

  it("dedupes repeated card requests without merging different requested printings", () => {
    const cards = parseDeckText(`1 Sol Ring\n2 Sol Ring\n1 Sol Ring (CMM) 400`);

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ name: "Sol Ring", quantity: 3 });
    expect(cards[1]).toMatchObject({ name: "Sol Ring", quantity: 1, setCode: "cmm", collectorNumber: "400" });
  });
});

describe("deck-check matching", () => {
  it("labels exact printings, alternate printings, raw-name availability, and missing cards", () => {
    const inventory = [
      card(),
      card({
        id: "e2e-001-normal-near_mint",
        name: "Sol Ring",
        setCode: "e2e",
        collectorNumber: "001",
        condition: "near_mint",
        price: 3.25,
        quantity: 1,
        colorIdentity: [],
        scryfallId: "sol-ring-e2e",
      }),
      card({
        id: "e2e-001-foil-near_mint",
        name: "Sol Ring",
        setCode: "e2e",
        collectorNumber: "001",
        condition: "near_mint",
        finish: "foil",
        price: 4.25,
        quantity: 2,
        colorIdentity: [],
        scryfallId: "sol-ring-e2e-foil",
      }),
    ];
    const requests = parseDeckText(`1 Counterspell (E2E) 045\n1 Counterspell (DMR) 45\n2 Sol Ring\n1 Rhystic Study`);

    const result = matchDeckToInventory(requests, inventory);

    expect(result.summary).toMatchObject({
      requestedCards: 4,
      exactCards: 1,
      alternateCards: 1,
      availableNameCards: 1,
      missingCards: 1,
      addableQuantity: 3,
    });
    expect(result.items.map((item) => item.status)).toEqual([
      "exact",
      "alternate",
      "available",
      "missing",
    ]);
    expect(result.items[2].recommendedCardId).toBe("e2e-001-normal-near_mint");
    expect(result.items[2].options[0]).toMatchObject({ addQuantity: 1 });
  });

  it("uses oracle identities to find alternate printings when names are not enough", () => {
    const request = {
      id: "deck-0",
      name: "Universes Within Reskin",
      quantity: 1,
      section: "main" as const,
      oracleId: "oracle-shared",
    };
    const inventory = [card({ name: "Secret Lair Original", scryfallId: "inventory-printing" })];
    const identities = new Map([[inventory[0].id, { scryfallId: "inventory-printing", oracleId: "oracle-shared" }]]);

    const result = matchDeckToInventory([request], inventory, identities);

    expect(result.items[0]).toMatchObject({ status: "alternate", recommendedCardId: inventory[0].id });
    expect(result.items[0].options[0].reason).toContain("Alternate Spellbook printing");
  });

  it("keeps name-only decklist rows as general availability after oracle lookup", () => {
    const request = {
      id: "deck-0",
      name: "Universes Within Reskin",
      quantity: 1,
      section: "main" as const,
      oracleId: "oracle-shared",
    };
    const inventory = [card({ name: "Secret Lair Original", scryfallId: "inventory-printing" })];
    const identities = new Map([[inventory[0].id, { scryfallId: "inventory-printing", oracleId: "oracle-shared" }]]);

    const result = matchDeckToInventory([request], inventory, identities, {
      printingRequestedIds: new Set(),
    });

    expect(result.items[0]).toMatchObject({ status: "available", statusLabel: "Spellbook match" });
  });
});
