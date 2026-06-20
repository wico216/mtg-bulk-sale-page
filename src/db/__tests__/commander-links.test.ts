import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {},
}));

import {
  normalizeCommanderImageUrl,
  normalizeCommanderName,
  normalizeEdhrecUrl,
  resolveCommanderImageUrlByName,
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
});
