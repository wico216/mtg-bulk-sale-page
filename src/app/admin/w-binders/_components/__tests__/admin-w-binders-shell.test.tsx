// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getE2ePrivateWBinderCards,
  getE2ePrivateWBinderMeta,
} from "@/lib/e2e-fixtures";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";
import { useWBinderPickStore } from "@/lib/store/w-binder-pick-store";
import { AdminWBindersShell } from "../admin-w-binders-shell";

function resetStores() {
  useFilterStore.setState({
    allCards: [],
    searchQuery: "",
    selectedColors: new Set<string>(),
    selectedSets: new Set<string>(),
    selectedRarities: new Set<string>(),
    selectedTypes: new Set<string>(),
    selectedFinishes: new Set(),
    priceRange: [0, PRICE_MAX],
    sortBy: "name-asc",
  });
  useWBinderPickStore.setState({ items: new Map<string, number>() });
  localStorage.clear();
}

describe("AdminWBindersShell", () => {
  beforeEach(() => {
    resetStores();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("renders W binder cards from props before the shared filter store is hydrated", async () => {
    const cards = getE2ePrivateWBinderCards();

    render(<AdminWBindersShell cards={cards} meta={getE2ePrivateWBinderMeta(cards)} />);

    expect(screen.getByRole("heading", { name: /my w binders/i })).toBeInTheDocument();
    expect(screen.getByText(/admin-only lookup for personal folders/i)).toBeInTheDocument();
    expect(screen.getByText(/3 cards in stock/i)).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 cards/i)).toBeInTheDocument();
    expect(screen.getByText("W01")).toBeInTheDocument();

    await waitFor(() => {
      expect(useFilterStore.getState().allCards).toHaveLength(cards.length);
    });
  });

  it("uses Pick actions to stage a private pull list instead of the public cart copy", async () => {
    const user = userEvent.setup();
    const cards = getE2ePrivateWBinderCards();

    render(<AdminWBindersShell cards={cards} meta={getE2ePrivateWBinderMeta(cards)} />);

    await user.click(screen.getAllByRole("button", { name: /quick pick/i })[0]);

    expect(screen.getByText(/1 card staged/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear picks/i })).toBeInTheDocument();
    expect(useWBinderPickStore.getState().totalItems()).toBe(1);
  });
});
