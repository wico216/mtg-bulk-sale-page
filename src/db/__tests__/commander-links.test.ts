import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {},
}));

import {
  buildEdhrecCommanderUrl,
  normalizeCommanderImageUrl,
  normalizeCommanderName,
  normalizeCommanderSearchQuery,
  normalizeEdhrecUrl,
  resolveCommanderImageUrlByName,
  searchCommanderCards,
} from "../commander-links";

describe("commander link helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes commander names and rejects empty names", () => {
    expect(normalizeCommanderName("  Muldrotha,   the Gravetide  ")).toBe(
      "Muldrotha, the Gravetide",
    );
    expect(() => normalizeCommanderName("   ")).toThrow(/name is required/i);
  });

  it("normalizes commander search queries and builds EDHREC commander URLs", () => {
    expect(normalizeCommanderSearchQuery("  Atraxa   Praetors  ")).toBe("Atraxa Praetors");
    expect(() => normalizeCommanderSearchQuery("a")).toThrow(/at least 2/i);
    expect(buildEdhrecCommanderUrl("Atraxa, Praetors' Voice")).toBe(
      "https://edhrec.com/commanders/atraxa-praetors-voice",
    );
    expect(buildEdhrecCommanderUrl("O-Kagachi, Vengeful Kami")).toBe(
      "https://edhrec.com/commanders/o-kagachi-vengeful-kami",
    );
  });

  it("normalizes EDHREC links and rejects non-EDHREC hosts", () => {
    expect(normalizeEdhrecUrl("edhrec.com/commanders/prosper-tome-bound")).toBe(
      "https://edhrec.com/commanders/prosper-tome-bound",
    );
    expect(normalizeEdhrecUrl("https://www.edhrec.com/commanders/atraxa-praetors-voice")).toBe(
      "https://www.edhrec.com/commanders/atraxa-praetors-voice",
    );
    expect(() => normalizeEdhrecUrl("https://example.com/commanders/prosper")).toThrow(
      /EDHREC/i,
    );
    expect(() => normalizeEdhrecUrl("javascript:alert(1)")).toThrow(/http or https/i);
  });

  it("normalizes optional image URLs", () => {
    expect(normalizeCommanderImageUrl(undefined)).toBeNull();
    expect(normalizeCommanderImageUrl("   ")).toBeNull();
    expect(normalizeCommanderImageUrl("https://cards.scryfall.io/normal/front/a/b/test.jpg")).toBe(
      "https://cards.scryfall.io/normal/front/a/b/test.jpg",
    );
    expect(() => normalizeCommanderImageUrl("ftp://cards.example/test.jpg")).toThrow(
      /http or https/i,
    );
  });

  it("resolves commander art from Scryfall when available", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ image_uris: { normal: "https://cards.scryfall.io/normal/front/test.jpg" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(resolveCommanderImageUrlByName("Muldrotha, the Gravetide")).resolves.toBe(
      "https://cards.scryfall.io/normal/front/test.jpg",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.scryfall.com/cards/named?fuzzy=Muldrotha%2C%20the%20Gravetide",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) }),
    );
  });

  it("searches Scryfall for commander options and maps EDHREC URLs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "atraxa-id",
              name: "Atraxa, Praetors' Voice",
              type_line: "Legendary Creature — Phyrexian Angel Horror",
              color_identity: ["G", "W", "U", "B"],
              image_uris: { normal: "https://cards.scryfall.io/normal/front/atraxa.jpg" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(searchCommanderCards("atraxa")).resolves.toEqual([
      {
        name: "Atraxa, Praetors' Voice",
        scryfallId: "atraxa-id",
        edhrecUrl: "https://edhrec.com/commanders/atraxa-praetors-voice",
        imageUrl: "https://cards.scryfall.io/normal/front/atraxa.jpg",
        typeLine: "Legendary Creature — Phyrexian Angel Horror",
        colorIdentity: ["G", "W", "U", "B"],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(url));
    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe("https://api.scryfall.com/cards/search");
    expect(parsedUrl.searchParams.get("q")).toBe("is:commander atraxa");
    expect(init).toMatchObject({
      headers: expect.objectContaining({
        Accept: "application/json",
        "User-Agent": expect.stringContaining("WikoSpellbinder"),
      }),
    });
  });
});
