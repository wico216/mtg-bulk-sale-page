// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import type { PublicCard } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";
import CartPageClient from "../cart-page-client";

/**
 * Helper: fabricate a PublicCard with sensible defaults for cart reconciliation
 * tests. Override any field via the partial.
 */
function publicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "lb-100-normal-near_mint",
    name: "Lightning Bolt",
    setCode: "lb",
    setName: "Limited Edition Beta",
    collectorNumber: "100",
    price: 1.25,
    condition: "near_mint",
    quantity: 5,
    colorIdentity: ["R"],
    imageUrl: null,
    oracleText: null,
    rarity: "common",
    finish: "normal",
    ...overrides,
  };
}

/**
 * Seed the persistent store DIRECTLY (simulating localStorage hydration).
 * Sets `version` so we can simulate v1.2 / v1.3 / undefined sentinel cases.
 */
function seedCart(items: Array<[string, number]>, version: string | undefined) {
  useCartStore.setState({
    items: new Map(items),
    version: version as any,
  });
}

beforeEach(async () => {
  useCartStore.persist.clearStorage();
  // The persist middleware exposes a rehydrate method that sets the
  // internal hasHydrated flag. cart-page-client's useEffect-driven
  // hydration guard reads this flag.
  await useCartStore.persist.rehydrate();
});

afterEach(() => {
  // Always restore the store to a clean v1.3 baseline so the next test
  // starts from a known shape.
  useCartStore.setState({ items: new Map(), version: "1.3" });
});

describe("Phase 20 D-08 cart reconciliation — v1.2 → v1.3 forward migration (AGG-03)", () => {
  it("STEP 1+2: 5-segment legacy key reconciles to 4-segment aggregated id with quantity preserved", async () => {
    seedCart([["lb-100-normal-near_mint-a02", 2]], "1.2");
    const cards = [publicCard({ quantity: 5 })];
    render(<CartPageClient cards={cards} />);
    await waitFor(() => {
      expect(useCartStore.getState().items.has("lb-100-normal-near_mint")).toBe(
        true,
      );
    });
    expect(useCartStore.getState().items.get("lb-100-normal-near_mint")).toBe(2);
    expect(
      useCartStore.getState().items.has("lb-100-normal-near_mint-a02"),
    ).toBe(false);
  });

  it("STEP 2 SUM: two legacy 5-segment keys for the same logical card sum into one aggregated entry", async () => {
    seedCart(
      [
        ["lb-100-normal-near_mint-a02", 2],
        ["lb-100-normal-near_mint-a05", 1],
      ],
      "1.2",
    );
    const cards = [publicCard({ quantity: 5 })];
    render(<CartPageClient cards={cards} />);
    await waitFor(() => {
      expect(useCartStore.getState().items.get("lb-100-normal-near_mint")).toBe(
        3,
      );
    });
  });

  it("STEP 2 SUM-CLAMP: legacy keys summing past maxStock clamp to maxStock", async () => {
    seedCart(
      [
        ["lb-100-normal-near_mint-a02", 2],
        ["lb-100-normal-near_mint-a05", 1],
      ],
      "1.2",
    );
    const cards = [publicCard({ quantity: 2 })]; // available is only 2
    render(<CartPageClient cards={cards} />);
    await waitFor(() => {
      expect(useCartStore.getState().items.get("lb-100-normal-near_mint")).toBe(
        2,
      );
    });
  });

  it("STEP 4: stale legacy key with no aggregated candidate in cardMap is silently removed", async () => {
    seedCart([["unknown-999-normal-near_mint-a02", 3]], "1.2");
    const cards = [publicCard()]; // doesn't match unknown-999
    render(<CartPageClient cards={cards} />);
    await waitFor(() => {
      expect(
        useCartStore.getState().items.has("unknown-999-normal-near_mint-a02"),
      ).toBe(false);
      expect(
        useCartStore.getState().items.has("unknown-999-normal-near_mint"),
      ).toBe(false);
    });
  });

  it("STEP 3 CLAMP: already-aggregated key with stale qty > current stock clamps down (Pitfall 11)", async () => {
    seedCart([["lb-100-normal-near_mint", 5]], "1.3");
    const cards = [publicCard({ quantity: 3 })]; // stock dropped to 3
    render(<CartPageClient cards={cards} />);
    await waitFor(() => {
      expect(useCartStore.getState().items.get("lb-100-normal-near_mint")).toBe(
        3,
      );
    });
  });

  it("D-15 empty-cart edge: empty cart with undefined version fires the toast", async () => {
    seedCart([], undefined);
    const cards = [publicCard()];
    render(<CartPageClient cards={cards} />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /We updated your cart for our improved inventory system/,
        ),
      ).toBeInTheDocument();
    });
    expect(useCartStore.getState().version).toBe("1.3");
    expect(useCartStore.getState().items.size).toBe(0);
  });

  it("toast fires exactly once: version: '1.3' already present → toast does NOT fire", async () => {
    seedCart([["lb-100-normal-near_mint", 2]], "1.3");
    const cards = [publicCard({ quantity: 5 })];
    render(<CartPageClient cards={cards} />);
    // Give the effect a tick to run.
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.queryByText(
        /We updated your cart for our improved inventory system/,
      ),
    ).not.toBeInTheDocument();
  });

  it("D-08 reconciliation fires toast AND advances sentinel: legacy cart with v1.2 keys", async () => {
    seedCart([["lb-100-normal-near_mint-a02", 2]], "1.2");
    const cards = [publicCard({ quantity: 5 })];
    render(<CartPageClient cards={cards} />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /We updated your cart for our improved inventory system/,
        ),
      ).toBeInTheDocument();
    });
    expect(useCartStore.getState().version).toBe("1.3");
  });
});
