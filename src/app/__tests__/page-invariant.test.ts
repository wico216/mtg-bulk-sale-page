// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const { mockGetCardsAggregated, mockGetCardsMeta } = vi.hoisted(() => ({
  mockGetCardsAggregated: vi.fn(),
  mockGetCardsMeta: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries", () => ({
  getCardsAggregated: mockGetCardsAggregated,
  getCardsMeta: mockGetCardsMeta,
}));

vi.mock("@/components/storefront-shell", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/components/header", () => ({
  default: vi.fn(() => null),
}));

import Home from "../page";

/**
 * Walk a React Element tree returned by an async server component and
 * collect the props of every node whose `type` is `targetType`. Server
 * components are not actually invoked when we `await ServerComponent()`
 * — the result is a React Element tree we must traverse to inspect the
 * props that *would* be passed to children on the next render pass.
 */
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
    // Some components nest children via non-`children` props (rare on this
    // path but defensive).
    for (const [key, val] of Object.entries(el.props)) {
      if (key === "children") continue;
      findPropsInJsxTree(val, targetType, out);
    }
  }
  return out;
}

describe("GET / (Home server component) — AGG-02 binder leak invariant", () => {
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
        // AdminCard.binders — MUST NOT appear in StorefrontShell props.
        binders: ["a02", "a05"],
        scryfallId: "abc",
        createdAt: "2026-04-11T12:00:00.000Z",
        updatedAt: "2026-04-11T14:00:00.000Z",
      },
    ]);
    mockGetCardsMeta.mockResolvedValue({
      lastUpdated: "2026-04-11T14:00:00.000Z",
      totalCards: 1,
      totalSkipped: 0,
      totalMissingPrices: 0,
    });
  });

  async function getStorefrontShellProps(): Promise<{
    cards: unknown;
    meta: unknown;
  }> {
    const tree = await Home();
    const StorefrontShellModule = await import("@/components/storefront-shell");
    const props = findPropsInJsxTree(tree, StorefrontShellModule.default);
    expect(props).toHaveLength(1);
    return props[0] as { cards: unknown; meta: unknown };
  }

  it("AGG-02 invariant: cards prop passed to StorefrontShell contains no binder/binders trace", async () => {
    const props = await getStorefrontShellProps();
    const serialized = JSON.stringify(props.cards).toLowerCase();
    expect(serialized.includes("binder")).toBe(false);
    expect(serialized.includes("binders")).toBe(false);
    // Belt-and-suspenders: verify literal binder names didn't leak via a
    // tangential field. Both came in via binders[]; both must be gone.
    expect(serialized.includes("a02")).toBe(false);
    expect(serialized.includes("a05")).toBe(false);
  });

  it("strips binders[] from aggregated rows before passing to StorefrontShell", async () => {
    const props = await getStorefrontShellProps();
    const cards = props.cards as Array<Record<string, unknown>>;
    expect(cards).toHaveLength(1);
    expect(cards[0]).not.toHaveProperty("binders");
    expect(cards[0].id).toBe("sld-123-normal-near_mint");
    expect(cards[0].quantity).toBe(5);
    expect(cards[0].name).toBe("Lightning Bolt");
  });
});
