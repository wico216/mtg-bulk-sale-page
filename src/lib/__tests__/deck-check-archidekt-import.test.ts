import { beforeEach, describe, expect, it, vi } from "vitest";

import { importDeckInput } from "../deck-check";

function nextDataHtml(deck: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        redux: {
          deck,
        },
      },
    },
  })}</script></body></html>`;
}

describe("Archidekt deck import", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("imports Archidekt snapshot links from embedded Next.js deck data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => nextDataHtml({
        name: "DECK FOR THE VIDEO",
        cardMap: {
          commander: {
            name: "Xantcha, Sleeper Agent",
            qty: 1,
            setCode: "cmm",
            collectorNumber: "362",
            uid: "91316746-ec2b-4c1a-b9c4-a870d6318c33",
            oracleCardUid: "0f0f3712-8d13-41a5-b332-2ab34e48d79d",
            modifier: "Foil",
            categories: ["Commander"],
          },
          main: {
            name: "Sol Ring",
            qty: 2,
            setCode: "cmm",
            collectorNumber: "400",
            uid: "29ef7d37-4543-4a58-a77e-7d4b9f5c8f7a",
            oracleCardUid: "a3fb7228-e76b-4e96-a40e-20b5fed75685",
            modifier: "Normal",
            categories: ["Ramp"],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const deck = await importDeckInput("https://archidekt.com/snapshots/115012");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://archidekt.com/snapshots/115012",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: expect.stringContaining("text/html") }) }),
    );
    expect(deck).toMatchObject({
      source: "archidekt",
      sourceLabel: "Archidekt",
      deckName: "DECK FOR THE VIDEO",
      cards: [
        {
          name: "Xantcha, Sleeper Agent",
          quantity: 1,
          section: "commander",
          setCode: "cmm",
          collectorNumber: "362",
          finish: "foil",
          scryfallId: "91316746-ec2b-4c1a-b9c4-a870d6318c33",
          oracleId: "0f0f3712-8d13-41a5-b332-2ab34e48d79d",
        },
        {
          name: "Sol Ring",
          quantity: 2,
          section: "main",
          setCode: "cmm",
          collectorNumber: "400",
          finish: "normal",
          scryfallId: "29ef7d37-4543-4a58-a77e-7d4b9f5c8f7a",
          oracleId: "a3fb7228-e76b-4e96-a40e-20b5fed75685",
        },
      ],
    });
  });

  it("continues to import normal Archidekt deck URLs through the JSON API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: "Normal deck",
        cards: [
          {
            quantity: 1,
            categories: ["Main"],
            card: {
              oracleCard: { name: "Counterspell" },
              setCode: "dmr",
              collectorNumber: "45",
              uid: "counterspell-scryfall-id",
              oracleCardUid: "counterspell-oracle-id",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const deck = await importDeckInput("https://archidekt.com/decks/123456/example");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://archidekt.com/api/decks/123456/",
      expect.any(Object),
    );
    expect(deck.cards).toMatchObject([
      {
        name: "Counterspell",
        quantity: 1,
        setCode: "dmr",
        collectorNumber: "45",
        scryfallId: "counterspell-scryfall-id",
        oracleId: "counterspell-oracle-id",
      },
    ]);
  });
});
