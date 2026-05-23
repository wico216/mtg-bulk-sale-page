// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import type { PublicCard } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";
import CheckoutClient from "../checkout-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: ComponentProps<"a"> & { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function publicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "lea-161-normal-near_mint",
    name: "Lightning Bolt",
    setCode: "lea",
    setName: "Alpha",
    collectorNumber: "161",
    price: 1,
    condition: "near_mint",
    quantity: 4,
    colorIdentity: ["R"],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    typeLine: "Instant",
    manaValue: 1,
    rarity: "common",
    finish: "normal",
    ...overrides,
  };
}

beforeEach(async () => {
  useCartStore.persist.clearStorage();
  useCartStore.setState({ items: new Map(), version: "1.3" });
  await useCartStore.persist.rehydrate();
});

describe("CheckoutClient empty state branding", () => {
  it("uses the Spellbook/Satchel voice instead of generic ecommerce copy", async () => {
    render(<CheckoutClient cards={[publicCard()]} />);

    await waitFor(() => {
      expect(screen.getByText("The satchel is empty.")).toBeInTheDocument();
    });
    expect(screen.getByText(/Choose a card before opening the handoff scroll/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse the shelves/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
