// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
              imageUrl: null,
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
              imageUrl: null,
              backImageUrl: null,
              oracleText: "Counter target spell.",
              typeLine: "Instant",
              manaValue: 2,
              rarity: "uncommon",
              finish: "normal",
              scryfallId: "e2e-counterspell",
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
    expect(screen.getByRole("button", { name: /cards not found in spellbook/i })).toBeInTheDocument();
    expect(screen.queryByText("Rhystic Study")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cards not found in spellbook/i }));

    expect(screen.getByText("Rhystic Study", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Not in Spellbook")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add all selected to satchel/i }));

    expect(useCartStore.getState().getQuantity("e2e-150-normal-near_mint")).toBe(1);
    expect(useCartStore.getState().getQuantity("e2e-045-normal-lightly_played")).toBe(1);
    expect(screen.getByRole("status")).toHaveTextContent("Added 2 cards to your satchel");
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
