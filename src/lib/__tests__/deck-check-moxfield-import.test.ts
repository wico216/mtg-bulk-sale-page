import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  httpsRequest: vi.fn(),
}));

vi.mock("node:https", () => ({
  request: mocks.httpsRequest,
}));

import { importDeckInput } from "../deck-check";

type EventHandler = (...args: unknown[]) => void;

class MockEmitter {
  private handlers = new Map<string, EventHandler[]>();

  on(event: string, handler: EventHandler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
    return true;
  }
}

type MockResponse = MockEmitter & { statusCode?: number };
type MockRequest = MockEmitter & {
  end: ReturnType<typeof vi.fn>;
  destroy: (error?: Error) => void;
};

function mockHttpsJsonResponse(payload: unknown, statusCode = 200) {
  mocks.httpsRequest.mockImplementation(
    (_url: string, _options: object, callback: (response: MockResponse) => void): MockRequest => {
      const response = new MockEmitter() as MockResponse;
      response.statusCode = statusCode;

      const request = new MockEmitter() as MockRequest;
      request.destroy = (error?: Error) => {
        if (error) request.emit("error", error);
      };
      request.end = vi.fn(() => {
        callback(response);
        response.emit("data", JSON.stringify(payload));
        response.emit("end");
      });
      return request;
    },
  );
}

describe("Moxfield deck import", () => {
  beforeEach(() => {
    mocks.httpsRequest.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }),
    );
  });

  it("falls back to Node HTTPS when global fetch is blocked by Moxfield Cloudflare", async () => {
    mockHttpsJsonResponse({
      name: "Revival Trance",
      commanders: {
        terra: {
          quantity: 1,
          finish: "normal",
          card: {
            name: "Terra, Herald of Hope",
            set: "fic",
            cn: "204",
            id: "901bd4dc-ebd3-40af-9fb0-57a8719329a4",
          },
        },
      },
      mainboard: {
        sacredFoundry: {
          quantity: 1,
          finish: "normal",
          card: {
            name: "Sacred Foundry",
            set: "gtc",
            cn: "245",
            id: "0a26d900-c652-4f9c-8681-a35c5f8b1937",
          },
        },
      },
    });

    const deck = await importDeckInput("https://moxfield.com/decks/t7yNhAOYHEmgA7AXICUsxQ", {
      moxfieldSection: "main",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api2.moxfield.com/v3/decks/all/t7yNhAOYHEmgA7AXICUsxQ",
      expect.any(Object),
    );
    expect(mocks.httpsRequest).toHaveBeenCalledWith(
      "https://api2.moxfield.com/v3/decks/all/t7yNhAOYHEmgA7AXICUsxQ",
      expect.objectContaining({ method: "GET" }),
      expect.any(Function),
    );
    expect(deck).toMatchObject({
      source: "moxfield",
      sourceLabel: "Moxfield",
      deckName: "Revival Trance",
      cards: [
        {
          name: "Terra, Herald of Hope",
          quantity: 1,
          section: "commander",
          setCode: "fic",
          collectorNumber: "204",
          scryfallId: "901bd4dc-ebd3-40af-9fb0-57a8719329a4",
        },
        {
          name: "Sacred Foundry",
          quantity: 1,
          section: "main",
          setCode: "gtc",
          collectorNumber: "245",
          scryfallId: "0a26d900-c652-4f9c-8681-a35c5f8b1937",
        },
      ],
    });
  });

  it("imports only the selected Moxfield board", async () => {
    mockHttpsJsonResponse({
      name: "Sectioned Deck",
      commanders: {
        commander: { quantity: 1, card: { name: "Main Commander", set: "fic", cn: "1", id: "commander-id" } },
      },
      mainboard: {
        main: { quantity: 1, card: { name: "Main Deck Card", set: "fic", cn: "2", id: "main-id" } },
      },
      sideboard: {
        side: { quantity: 2, card: { name: "Sideboard Card", set: "fic", cn: "3", id: "side-id" } },
      },
      maybeboard: {
        considering: { quantity: 3, card: { name: "Considering Card", set: "fic", cn: "4", id: "considering-id" } },
      },
    });

    const mainDeck = await importDeckInput("https://moxfield.com/decks/sectioned", {
      moxfieldSection: "main",
    });
    expect(mainDeck.cards.map((card) => [card.name, card.section, card.quantity])).toEqual([
      ["Main Commander", "commander", 1],
      ["Main Deck Card", "main", 1],
    ]);

    const defaultDeck = await importDeckInput("https://moxfield.com/decks/sectioned");
    expect(defaultDeck.cards.map((card) => [card.name, card.section, card.quantity])).toEqual([
      ["Main Commander", "commander", 1],
      ["Main Deck Card", "main", 1],
    ]);

    const sideboardDeck = await importDeckInput("https://moxfield.com/decks/sectioned", {
      moxfieldSection: "sideboard",
    });
    expect(sideboardDeck.cards.map((card) => [card.name, card.section, card.quantity])).toEqual([
      ["Sideboard Card", "sideboard", 2],
    ]);

    const consideringDeck = await importDeckInput("https://moxfield.com/decks/sectioned", {
      moxfieldSection: "considering",
    });
    expect(consideringDeck.cards.map((card) => [card.name, card.section, card.quantity])).toEqual([
      ["Considering Card", "maybeboard", 3],
    ]);
  });
});
