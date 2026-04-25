import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/lib/scryfall", () => ({
  fetchCard: vi.fn(),
}));

import { fetchCard } from "@/lib/scryfall";
import { enrichCards } from "../enrichment";
import type { Card, ScryfallCard } from "@/lib/types";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "lea-232-normal-near_mint",
    name: "Lightning Bolt",
    setCode: "lea",
    setName: "",
    collectorNumber: "232",
    foil: false,
    condition: "near_mint",
    quantity: 1,
    price: null,
    colorIdentity: [],
    imageUrl: null,
    oracleText: null,
    rarity: "rare",
    ...overrides,
  };
}

function makeScryfallCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    object: "card",
    name: "Lightning Bolt",
    color_identity: ["R"],
    oracle_text: "Lightning Bolt deals 3 damage to any target.",
    image_uris: {
      normal: "https://example.com/normal.jpg",
      small: "https://example.com/small.jpg",
      large: "https://example.com/large.jpg",
    },
    prices: {
      usd: "1.50",
      usd_foil: null,
      usd_etched: null,
    },
    layout: "normal",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchCard).mockReset();
});

describe("enrichCards onProgress + scryfallMisses", () => {
  it("invokes onProgress exactly cards.length times in strict ascending order (Test A)", async () => {
    vi.mocked(fetchCard)
      .mockResolvedValueOnce(makeScryfallCard())
      .mockResolvedValueOnce(makeScryfallCard())
      .mockResolvedValueOnce(makeScryfallCard());

    const c1 = makeCard({ id: "lea-1-normal-near_mint", collectorNumber: "1" });
    const c2 = makeCard({ id: "lea-2-normal-near_mint", collectorNumber: "2" });
    const c3 = makeCard({ id: "lea-3-normal-near_mint", collectorNumber: "3" });

    const onProgress = vi.fn();
    await enrichCards([c1, c2, c3], { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });

  it("resolves without throwing when no opts object is passed (Test B - backward compat)", async () => {
    vi.mocked(fetchCard).mockResolvedValueOnce(makeScryfallCard());

    const result = await enrichCards([makeCard()]);

    expect(result).toBeDefined();
    expect(result.cards).toHaveLength(1);
    expect(result.scryfallMisses).toEqual([]);
  });

  it("populates scryfallMisses for cards fetchCard returns null for; those cards are excluded from cards[] (Test C)", async () => {
    vi.mocked(fetchCard)
      .mockResolvedValueOnce(makeScryfallCard())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeScryfallCard());

    const c1 = makeCard({ id: "lea-1-normal-near_mint", collectorNumber: "1" });
    const c2 = makeCard({
      id: "lea-2-normal-near_mint",
      collectorNumber: "2",
      name: "Missing Card",
      setCode: "lea",
    });
    const c3 = makeCard({ id: "lea-3-normal-near_mint", collectorNumber: "3" });

    const result = await enrichCards([c1, c2, c3]);

    expect(result.scryfallMisses).toHaveLength(1);
    expect(result.scryfallMisses[0]).toEqual({
      setCode: "lea",
      collectorNumber: "2",
      name: "Missing Card",
      reason: "not found on Scryfall",
    });

    expect(result.cards).toHaveLength(2);
    expect(
      result.cards.find((c) => c.collectorNumber === "2"),
    ).toBeUndefined();
  });

  it("stats.processed equals cards.length and stats.skipped equals scryfallMisses.length (Test D)", async () => {
    vi.mocked(fetchCard)
      .mockResolvedValueOnce(makeScryfallCard())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeScryfallCard())
      .mockResolvedValueOnce(null);

    const cards = [
      makeCard({ id: "lea-1-normal-near_mint", collectorNumber: "1" }),
      makeCard({ id: "lea-2-normal-near_mint", collectorNumber: "2" }),
      makeCard({ id: "lea-3-normal-near_mint", collectorNumber: "3" }),
      makeCard({ id: "lea-4-normal-near_mint", collectorNumber: "4" }),
    ];

    const result = await enrichCards(cards);

    expect(result.stats.processed).toBe(result.cards.length);
    expect(result.stats.skipped).toBe(result.scryfallMisses.length);
    expect(result.stats.processed).toBe(2);
    expect(result.stats.skipped).toBe(2);
  });

  it("foil cards prefer usd_foil over usd (Test E.foil)", async () => {
    vi.mocked(fetchCard).mockResolvedValueOnce(
      makeScryfallCard({
        prices: { usd: "1.00", usd_foil: "5.00", usd_etched: "8.00" },
      }),
    );

    const foilCard = makeCard({
      id: "lea-232-foil-near_mint",
      foil: true,
    });

    const result = await enrichCards([foilCard]);
    expect(result.cards[0].price).toBe(5.0);
  });

  it("foil cards fall back to usd_etched then usd when usd_foil missing (Test E.foil-fallback)", async () => {
    vi.mocked(fetchCard)
      .mockResolvedValueOnce(
        makeScryfallCard({
          prices: { usd: "1.00", usd_foil: null, usd_etched: "8.00" },
        }),
      )
      .mockResolvedValueOnce(
        makeScryfallCard({
          prices: { usd: "1.00", usd_foil: null, usd_etched: null },
        }),
      );

    const c1 = makeCard({ id: "lea-1-foil-near_mint", foil: true });
    const c2 = makeCard({ id: "lea-2-foil-near_mint", foil: true });

    const result = await enrichCards([c1, c2]);
    expect(result.cards[0].price).toBe(8.0);
    expect(result.cards[1].price).toBe(1.0);
  });

  it("non-foil cards still prefer usd over usd_foil (Test E.normal)", async () => {
    vi.mocked(fetchCard).mockResolvedValueOnce(
      makeScryfallCard({
        prices: { usd: "1.00", usd_foil: "5.00", usd_etched: "8.00" },
      }),
    );

    const normalCard = makeCard({ foil: false });
    const result = await enrichCards([normalCard]);
    expect(result.cards[0].price).toBe(1.0);
  });

  it("applies USD price fallback chain and increments missingPrices when all null (Test E)", async () => {
    vi.mocked(fetchCard)
      // First card: usd null, usd_foil "2.00" -> price 2.00
      .mockResolvedValueOnce(
        makeScryfallCard({
          prices: { usd: null, usd_foil: "2.00", usd_etched: null },
        }),
      )
      // Second card: all null -> price null, missingPrices++
      .mockResolvedValueOnce(
        makeScryfallCard({
          prices: { usd: null, usd_foil: null, usd_etched: null },
        }),
      );

    const c1 = makeCard({ id: "lea-1-normal-near_mint", collectorNumber: "1" });
    const c2 = makeCard({ id: "lea-2-normal-near_mint", collectorNumber: "2" });

    const result = await enrichCards([c1, c2]);

    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].price).toBe(2.0);
    expect(result.cards[1].price).toBeNull();
    expect(result.stats.missingPrices).toBe(1);
  });

  it("invokes onProgress for both processed AND skipped cards (skip path)", async () => {
    vi.mocked(fetchCard)
      .mockResolvedValueOnce(makeScryfallCard())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeScryfallCard());

    const cards = [
      makeCard({ id: "lea-1-normal-near_mint", collectorNumber: "1" }),
      makeCard({ id: "lea-2-normal-near_mint", collectorNumber: "2" }),
      makeCard({ id: "lea-3-normal-near_mint", collectorNumber: "3" }),
    ];

    const onProgress = vi.fn();
    await enrichCards(cards, { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });
});
