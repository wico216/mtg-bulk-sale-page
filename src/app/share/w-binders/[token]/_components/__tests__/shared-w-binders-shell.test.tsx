// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getE2ePrivateWBinderCards,
  getE2ePrivateWBinderMeta,
} from "@/lib/e2e-fixtures";
import { useCartStore } from "@/lib/store/cart-store";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";
import { useWBinderShareInterestStore } from "@/lib/store/w-binder-share-interest-store";
import { SharedWBindersShell } from "../shared-w-binders-shell";

function resetStores() {
  useCartStore.setState({ items: new Map(), version: "1.3" });
  useWBinderShareInterestStore.setState({ items: new Map<string, number>() });
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
  localStorage.clear();
}

describe("SharedWBindersShell", () => {
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

  it("renders as a read-only shared preview with no checkout/admin actions", async () => {
    const cards = getE2ePrivateWBinderCards();

    render(
      <SharedWBindersShell
        cards={cards}
        meta={getE2ePrivateWBinderMeta(cards)}
        linkLabel="Commander pod"
        expiresAt="2026-07-12T00:00:00.000Z"
      />,
    );

    expect(screen.getByRole("heading", { name: /w binder preview/i })).toBeInTheDocument();
    expect(screen.getByText(/browse-only: no checkout, no admin access/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /checkout/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/admin-only lookup/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(useFilterStore.getState().allCards).toHaveLength(cards.length);
    });
  });

  it("marks interest locally without adding cards to the public cart", async () => {
    const user = userEvent.setup();
    const cards = getE2ePrivateWBinderCards();
    const firstCardId = cards[0].id;

    render(
      <SharedWBindersShell
        cards={cards}
        meta={getE2ePrivateWBinderMeta(cards)}
        linkLabel="Commander pod"
        expiresAt={null}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /quick interest/i })[0]);

    expect(useWBinderShareInterestStore.getState().totalItems()).toBe(1);
    expect(useCartStore.getState().hasItem(firstCardId)).toBe(false);
    expect(screen.getByRole("button", { name: /copy list/i })).toBeInTheDocument();
  });
});
