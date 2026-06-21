// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeckCheckResult } from "@/lib/deck-check";
import { useCartStore } from "@/lib/store/cart-store";
import { DeckCheckShell } from "../deck-check-shell";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const boltImage = "https://cards.scryfall.io/normal/front/0/0/test-bolt.jpg";
const counterspellImage = "https://cards.scryfall.io/normal/front/0/1/test-counterspell.jpg";
const counterspellFoilImage = "https://cards.scryfall.io/normal/front/0/2/test-counterspell-foil.jpg";

function resultFixture(): DeckCheckResult {
  return {
    source: "text",
    sourceLabel: "Pasted decklist",
    warnings: [],
    summary: {
      requestedCards: 3,
      requestedQuantity: 3,
      matchedCards: 2,
      exactCards: 1,
      alternateCards: 1,
      availableNameCards: 0,
      missingCards: 1,
      addableQuantity: 2,
      estimatedTotal: 5.5,
    },
    items: [
      {
        request: { id: "deck-0", name: "Lightning Bolt", quantity: 1, section: "main" },
        status: "exact",
        statusLabel: "Exact match",
        requestedPrintingLabel: "E2E · #150",
        recommendedCardId: "e2e-150-normal-near_mint",
        options: [
          {
            matchType: "exact",
            reason: "Exact requested printing",
            recommended: true,
            addQuantity: 1,
            card: {
              id: "e2e-150-normal-near_mint",
              name: "Lightning Bolt",
              setCode: "e2e",
              setName: "E2E Masters",
              collectorNumber: "150",
              price: 3.5,
              condition: "near_mint",
              quantity: 3,
              colorIdentity: ["R"],
              imageUrl: boltImage,
              backImageUrl: null,
              oracleText: "Lightning Bolt deals 3 damage to any target.",
              typeLine: "Instant",
              manaValue: 1,
              rarity: "common",
              finish: "normal",
              scryfallId: "e2e-lightning-bolt",
            },
          },
        ],
      },
      {
        request: { id: "deck-1", name: "Counterspell", quantity: 1, section: "main", setCode: "dmr", collectorNumber: "45" },
        status: "alternate",
        statusLabel: "Alternate printing",
        requestedPrintingLabel: "DMR · #45",
        recommendedCardId: "e2e-045-normal-lightly_played",
        options: [
          {
            matchType: "alternate",
            reason: "Different printing: E2E #045",
            recommended: true,
            addQuantity: 1,
            card: {
              id: "e2e-045-normal-lightly_played",
              name: "Counterspell",
              setCode: "e2e",
              setName: "E2E Masters",
              collectorNumber: "045",
              price: 2,
              condition: "lightly_played",
              quantity: 4,
              colorIdentity: ["U"],
              imageUrl: counterspellImage,
              backImageUrl: null,
              oracleText: "Counter target spell.",
              typeLine: "Instant",
              manaValue: 2,
              rarity: "uncommon",
              finish: "normal",
              scryfallId: "e2e-counterspell",
            },
          },
          {
            matchType: "alternate",
            reason: "Different printing: E2E #046",
            recommended: false,
            addQuantity: 1,
            card: {
              id: "e2e-046-foil-near_mint",
              name: "Counterspell",
              setCode: "e2e",
              setName: "E2E Masters",
              collectorNumber: "046",
              price: 3,
              condition: "near_mint",
              quantity: 2,
              colorIdentity: ["U"],
              imageUrl: counterspellFoilImage,
              backImageUrl: null,
              oracleText: "Counter target spell.",
              typeLine: "Instant",
              manaValue: 2,
              rarity: "uncommon",
              finish: "foil",
              scryfallId: "e2e-counterspell-foil",
            },
          },
        ],
      },
      {
        request: { id: "deck-2", name: "Rhystic Study", quantity: 1, section: "main" },
        status: "missing",
        statusLabel: "Not in Spellbook",
        requestedPrintingLabel: null,
        recommendedCardId: null,
        options: [],
      },
    ],
  };
}

describe("DeckCheckShell", () => {
  beforeEach(() => {
    useCartStore.setState({ items: new Map(), version: "1.3" });
    vi.restoreAllMocks();
  });

  it("checks a decklist and adds all selected matches to the satchel", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => resultFixture(),
    }));

    render(<DeckCheckShell />);

    await user.type(screen.getByLabelText(/deck link or exported list/i), "1 Lightning Bolt\n1 Counterspell (DMR) 45");
    await user.click(screen.getByRole("button", { name: /check my deck/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /spellbook match report/i })).toBeInTheDocument();
    });

    expect(screen.getByText("Exact match")).toBeInTheDocument();
    expect(screen.getByText("Alternate printing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit deck input/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /check your deck against wiko's spellbook/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Lightning Bolt card art/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: /Counterspell card art/i }).length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: /Select Counterspell E2E #046 · Foil/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cards not found in spellbook/i })).toBeInTheDocument();
    expect(screen.queryByText("Rhystic Study")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Select Counterspell E2E #046 · Foil/i }));
    await user.click(screen.getByRole("button", { name: /cards not found in spellbook/i }));

    expect(screen.getByText("Rhystic Study", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Not in Spellbook")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add all selected to satchel/i }));

    expect(useCartStore.getState().getQuantity("e2e-150-normal-near_mint")).toBe(1);
    expect(useCartStore.getState().getQuantity("e2e-045-normal-lightly_played")).toBe(0);
    expect(useCartStore.getState().getQuantity("e2e-046-foil-near_mint")).toBe(1);
    expect(screen.getByRole("status")).toHaveTextContent("Added 2 cards to your satchel");
  });

  it("opens card images in a larger viewer", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => resultFixture(),
    }));

    render(<DeckCheckShell />);

    await user.type(screen.getByLabelText(/deck link or exported list/i), "1 Lightning Bolt\n1 Counterspell (DMR) 45");
    await user.click(screen.getByRole("button", { name: /check my deck/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /spellbook match report/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /view lightning bolt card art larger/i }));

    const boltDialog = screen.getByRole("dialog", { name: /larger image for lightning bolt/i });
    expect(within(boltDialog).getByRole("img", { name: /Lightning Bolt enlarged card art/i })).toHaveAttribute("src", boltImage);
    expect(within(boltDialog).getByText(/E2E #150 · Nonfoil/i)).toBeInTheDocument();

    await user.click(within(boltDialog).getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /larger image/i })).not.toBeInTheDocument();
    });

    const foilOption = screen.getByRole("button", { name: /Select Counterspell E2E #046 · Foil/i });
    await user.click(within(foilOption).getByRole("img", { name: /Counterspell card art/i }));

    const foilDialog = screen.getByRole("dialog", { name: /larger image for counterspell/i });
    expect(within(foilDialog).getByRole("img", { name: /Counterspell enlarged card art/i })).toHaveAttribute("src", counterspellFoilImage);
    expect(within(foilDialog).getByText(/E2E #046 · Foil/i)).toBeInTheDocument();
    expect(screen.getByText(/Selected: E2E #046 · Foil/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /larger image/i })).not.toBeInTheDocument();
    });
  });

  it("sends the selected Moxfield board to the deck-check API", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => resultFixture(),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DeckCheckShell />);

    const input = "https://www.moxfield.com/decks/example";
    await user.type(screen.getByLabelText(/deck link or exported list/i), input);

    expect(screen.getByRole("radiogroup", { name: /moxfield board/i })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /sideboard/i }));
    await user.click(screen.getByRole("button", { name: /check my deck/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /spellbook match report/i })).toBeInTheDocument();
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toEqual({ input, moxfieldSection: "sideboard" });
  });

  it("shows an animated loading state while the deck link is checked", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ ok: boolean; json: () => Promise<DeckCheckResult> }>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));

    render(<DeckCheckShell />);

    await user.type(screen.getByLabelText(/deck link or exported list/i), "https://www.moxfield.com/decks/example");
    await user.click(screen.getByRole("button", { name: /check my deck/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Checking your deck link against Spellbook");
    expect(screen.getByRole("button", { name: /checking/i })).toBeDisabled();

    pending.resolve({ ok: true, json: async () => resultFixture() });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /spellbook match report/i })).toBeInTheDocument();
    });
  });
});
