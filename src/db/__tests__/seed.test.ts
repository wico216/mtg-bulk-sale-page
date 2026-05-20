import { describe, it, expect } from "vitest";
import { cardToRow } from "../seed";
import type { InventoryRow } from "@/lib/types";

const makeCard = (overrides: Partial<InventoryRow> = {}): InventoryRow => ({
  id: "sld-123-normal-NearMint-unsorted",
  name: "Test Card",
  setCode: "sld",
  setName: "Secret Lair Drop",
  collectorNumber: "123",
  price: 12.99,
  condition: "NearMint",
  quantity: 3,
  colorIdentity: ["W", "U"],
  imageUrl: "https://example.com/card.jpg",
  backImageUrl: "https://example.com/card-back.jpg",
  oracleText: "Flying, vigilance",
  typeLine: "Creature — Angel",
  manaValue: 4,
  rarity: "rare",
  finish: "normal",
  binder: "unsorted",
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

  it("maps all Card fields to row fields 1:1 (Phase 17: finish + binder pass through directly)", () => {
    const card = makeCard();
    const row = cardToRow(card);

    expect(row.id).toBe("sld-123-normal-NearMint-unsorted");
    expect(row.name).toBe("Test Card");
    expect(row.setCode).toBe("sld");
    expect(row.setName).toBe("Secret Lair Drop");
    expect(row.collectorNumber).toBe("123");
    expect(row.condition).toBe("NearMint");
    expect(row.quantity).toBe(3);
    expect(row.imageUrl).toBe("https://example.com/card.jpg");
    expect(row.backImageUrl).toBe("https://example.com/card-back.jpg");
    expect(row.oracleText).toBe("Flying, vigilance");
    expect(row.typeLine).toBe("Creature — Angel");
    expect(row.manaValue).toBe(4);
    expect(row.rarity).toBe("rare");
    // Phase 17 D-07: finish + binder pass through 1:1; no derivation.
    expect(row.finish).toBe("normal");
    expect(row.binder).toBe("unsorted");
    expect(row.scryfallId).toBeNull();
  });

  it("passes through card.finish='foil' to row.finish (Phase 17 — no derivation)", () => {
    const row = cardToRow(makeCard({ finish: "foil" }));
    expect(row.finish).toBe("foil");
  });

  it("passes through card.finish='etched' to row.finish (Phase 17 etched first-class)", () => {
    const row = cardToRow(makeCard({ finish: "etched" }));
    expect(row.finish).toBe("etched");
  });

  it("passes through card.binder to row.binder (Phase 17 — no hard-coded 'unsorted')", () => {
    const row = cardToRow(makeCard({ binder: "a07" }));
    expect(row.binder).toBe("a07");
  });

  it("rounds prices correctly using Math.round (Pitfall 3)", () => {
    // 19.95 * 100 = 1994.9999999999998 in JS
    const row = cardToRow(makeCard({ price: 19.95 }));
    expect(row.price).toBe(1995);
  });

  it("forwards scryfallId from Manabox CSV through to the DB row", () => {
    const row = cardToRow(makeCard({ scryfallId: "1d52fb47-09b8-414c-9cdc-a91ce64ee0eb" }));
    expect(row.scryfallId).toBe("1d52fb47-09b8-414c-9cdc-a91ce64ee0eb");
  });

  it("falls back to null when scryfallId is undefined (legacy cards.json seed path)", () => {
    const row = cardToRow(makeCard({ scryfallId: undefined }));
    expect(row.scryfallId).toBeNull();
  });
});
