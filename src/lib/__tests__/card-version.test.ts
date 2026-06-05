import { describe, expect, it } from "vitest";
import type { InventoryRow, ScryfallCard } from "@/lib/types";
import {
  buildCardVersionUpdate,
  buildInventoryCardId,
  normalizeCardVersionInput,
} from "@/lib/card-version";

function inventoryRow(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    id: "lea-161-normal-near_mint-a02",
    name: "Lightning Bolt",
    setCode: "lea",
    setName: "Limited Edition Alpha",
    collectorNumber: "161",
    price: 12.34,
    condition: "near_mint",
    quantity: 2,
    colorIdentity: ["R"],
    imageUrl: "https://old.example/front.jpg",
    backImageUrl: null,
    oracleText: "Old text",
    typeLine: "Instant",
    manaCost: "{R}",
    manaValue: 1,
    rarity: "common",
    finish: "normal",
    binder: "a02",
    scryfallId: "old-scryfall-id",
    createdAt: "2026-04-11T12:00:00.000Z",
    updatedAt: "2026-04-11T14:00:00.000Z",
    ...overrides,
  };
}

function scryfallCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    object: "card",
    id: "new-scryfall-id",
    name: "Lightning Bolt",
    set: "clu",
    set_name: "Ravnica: Clue Edition",
    collector_number: "141",
    color_identity: ["R"],
    oracle_text: "Lightning Bolt deals 3 damage to any target.",
    type_line: "Instant",
    mana_cost: "{R}",
    cmc: 1,
    image_uris: {
      small: "https://cards.scryfall.io/small/front/x/y/card.jpg",
      normal: "https://cards.scryfall.io/normal/front/x/y/card.jpg",
      large: "https://cards.scryfall.io/large/front/x/y/card.jpg",
    },
    prices: {
      usd: "2.50",
      usd_foil: null,
      usd_etched: null,
    },
    rarity: "uncommon",
    layout: "normal",
    ...overrides,
  };
}

describe("card version helpers", () => {
  it("normalizes set code and collector number input for Scryfall lookup", () => {
    expect(
      normalizeCardVersionInput({ setCode: " CLU ", collectorNumber: " 141★ " }),
    ).toEqual({ setCode: "clu", collectorNumber: "141★" });
  });

  it("rejects blank set code or collector number", () => {
    expect(() =>
      normalizeCardVersionInput({ setCode: "", collectorNumber: "141" }),
    ).toThrow("Set code is required");
    expect(() =>
      normalizeCardVersionInput({ setCode: "clu", collectorNumber: "" }),
    ).toThrow("Collector number is required");
  });

  it("builds inventory IDs from printing plus preserved finish, condition, and binder", () => {
    expect(
      buildInventoryCardId({
        setCode: "CLU",
        collectorNumber: "141",
        finish: "foil",
        condition: "lightly_played",
        binder: "a02",
      }),
    ).toBe("clu-141-foil-lightly_played-a02");
  });

  it("builds a full DB patch for changing only the card printing/version", () => {
    const current = inventoryRow({
      finish: "normal",
      condition: "near_mint",
      binder: "a02",
      quantity: 2,
    });
    const printing = scryfallCard();

    const update = buildCardVersionUpdate(current, printing, {
      setCode: "clu",
      collectorNumber: "141",
    });

    expect(update.targetId).toBe("clu-141-normal-near_mint-a02");
    expect(update.values).toMatchObject({
      id: "clu-141-normal-near_mint-a02",
      name: "Lightning Bolt",
      setCode: "clu",
      setName: "Ravnica: Clue Edition",
      collectorNumber: "141",
      price: 250,
      condition: "near_mint",
      quantity: 2,
      colorIdentity: ["R"],
      imageUrl: "https://cards.scryfall.io/normal/front/x/y/card.jpg",
      backImageUrl: null,
      oracleText: "Lightning Bolt deals 3 damage to any target.",
      typeLine: "Instant",
      manaCost: "{R}",
      manaValue: 1,
      rarity: "uncommon",
      finish: "normal",
      binder: "a02",
      scryfallId: "new-scryfall-id",
    });
  });

  it("uses foil-aware Scryfall pricing when the current inventory row is foil", () => {
    const update = buildCardVersionUpdate(
      inventoryRow({ finish: "foil" }),
      scryfallCard({ prices: { usd: "1.00", usd_foil: "6.75", usd_etched: null } }),
      { setCode: "clu", collectorNumber: "141" },
    );

    expect(update.values.price).toBe(675);
  });
});
