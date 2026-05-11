// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const { mockGetCardsAggregated } = vi.hoisted(() => ({
  mockGetCardsAggregated: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries", () => ({
  getCardsAggregated: mockGetCardsAggregated,
}));
vi.mock("../cart-page-client", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/components/header", () => ({
  default: vi.fn(() => null),
}));

import CartPage from "../page";

function findPropsInJsxTree(
  node: unknown,
  targetType: unknown,
  out: unknown[] = [],
): unknown[] {
  if (!node || typeof node !== "object") return out;
  const el = node as ReactElement & { props?: Record<string, unknown> };
  if (el.type === targetType) out.push(el.props);
  if (el.props) {
    const children = (el.props as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const c of children) findPropsInJsxTree(c, targetType, out);
    } else if (children) {
      findPropsInJsxTree(children, targetType, out);
    }
    for (const [key, val] of Object.entries(el.props)) {
      if (key === "children") continue;
      findPropsInJsxTree(val, targetType, out);
    }
  }
  return out;
}

describe("GET /cart (CartPage server component) — AGG-02 binder leak invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCardsAggregated.mockResolvedValue([
      {
        id: "sld-123-normal-near_mint",
        name: "Lightning Bolt",
        setCode: "sld",
        setName: "Secret Lair Drop",
        collectorNumber: "123",
        price: 1.5,
        condition: "near_mint",
        quantity: 5,
        colorIdentity: ["R"],
        imageUrl: "https://example.com/lb.jpg",
        oracleText: "Deal 3 damage",
        rarity: "common",
        finish: "normal",
        binders: ["a02", "a05"],
        scryfallId: "abc",
        createdAt: "2026-04-11T12:00:00.000Z",
        updatedAt: "2026-04-11T14:00:00.000Z",
      },
    ]);
  });

  async function getCartPageClientProps(): Promise<{ cards: unknown }> {
    const tree = await CartPage();
    const CartPageClientModule = await import("../cart-page-client");
    const props = findPropsInJsxTree(tree, CartPageClientModule.default);
    expect(props).toHaveLength(1);
    return props[0] as { cards: unknown };
  }

  it("AGG-02 invariant: cards prop passed to CartPageClient contains no binder/binders trace", async () => {
    const props = await getCartPageClientProps();
    const serialized = JSON.stringify(props.cards).toLowerCase();
    expect(serialized.includes("binder")).toBe(false);
    expect(serialized.includes("binders")).toBe(false);
    expect(serialized.includes("a02")).toBe(false);
    expect(serialized.includes("a05")).toBe(false);
  });

  it("strips binders[] from aggregated rows before passing to CartPageClient", async () => {
    const props = await getCartPageClientProps();
    const cards = props.cards as Array<Record<string, unknown>>;
    expect(cards).toHaveLength(1);
    expect(cards[0]).not.toHaveProperty("binders");
    expect(cards[0].id).toBe("sld-123-normal-near_mint");
    expect(cards[0].quantity).toBe(5);
  });
});
