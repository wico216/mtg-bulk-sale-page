import { describe, it, expect } from "vitest";
import { cardToRow } from "../seed";
import type { Card } from "@/lib/types";

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: "sld-123-normal-NearMint",
  name: "Test Card",
  setCode: "sld",
  setName: "Secret Lair Drop",
  collectorNumber: "123",
  price: 12.99,
  condition: "NearMint",
  quantity: 3,
  colorIdentity: ["W", "U"],
  imageUrl: "https://example.com/card.jpg",
  oracleText: "Flying, vigilance",
  rarity: "rare",
  foil: false,
  ...overrides,
});

describe("cardToRow", () => {
  it("converts dollar price to integer cents (D-02)", () => {
    const row = cardToRow(makeCard({ price: 12.99 }));
    expect(row.price).toBe(1299);
  });

  it("handles floating-point edge case ($0.10 -> 10 cents)", () => {
    const row = cardToRow(makeCard({ price: 0.1 }));
    expect(row.price).toBe(10);
  });

  it("handles null price as null (D-02)", () => {
    const row = cardToRow(makeCard({ price: null }));
    expect(row.price).toBeNull();
  });

  it("preserves colorIdentity as string array (D-03)", () => {
    const row = cardToRow(makeCard({ colorIdentity: ["R", "G"] }));
    expect(row.colorIdentity).toEqual(["R", "G"]);
  });

  it("preserves empty colorIdentity array", () => {
    const row = cardToRow(makeCard({ colorIdentity: [] }));
    expect(row.colorIdentity).toEqual([]);
  });

  it("maps all Card fields to row fields", () => {
    const card = makeCard();
    const row = cardToRow(card);

    expect(row.id).toBe("sld-123-normal-NearMint");
    expect(row.name).toBe("Test Card");
    expect(row.setCode).toBe("sld");
    expect(row.setName).toBe("Secret Lair Drop");
    expect(row.collectorNumber).toBe("123");
    expect(row.condition).toBe("NearMint");
    expect(row.quantity).toBe(3);
    expect(row.imageUrl).toBe("https://example.com/card.jpg");
    expect(row.oracleText).toBe("Flying, vigilance");
    expect(row.rarity).toBe("rare");
    expect(row.foil).toBe(false);
    expect(row.scryfallId).toBeNull();
  });

  it("rounds prices correctly using Math.round (Pitfall 3)", () => {
    // 19.95 * 100 = 1994.9999999999998 in JS
    const row = cardToRow(makeCard({ price: 19.95 }));
    expect(row.price).toBe(1995);
  });
});
