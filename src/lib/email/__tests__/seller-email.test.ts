import { describe, it, expect } from "vitest";
import { buildSellerEmailHtml } from "../seller-email";
import type { OrderData, OrderItem } from "@/lib/types";

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    cardId: "m11-146-normal-near_mint-a10",
    name: "Lightning Bolt",
    setName: "Magic 2011",
    setCode: "m11",
    collectorNumber: "146",
    condition: "NM",
    price: 200,
    quantity: 1,
    lineTotal: 2.0,
    binder: "a10",
    ...overrides,
  };
}

function makeOrder(items: OrderItem[]): OrderData {
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + (i.lineTotal ?? 0), 0);
  return {
    orderRef: "ORD-T-001",
    buyerName: "Test Buyer",
    buyerEmail: "buyer@example.com",
    items,
    totalItems,
    totalPrice,
    createdAt: "2026-05-20T00:00:00Z",
  };
}

describe("buildSellerEmailHtml — brand + binder rendering", () => {
  it("renders the Wiko's Spellbook brand in the header and not the legacy Viki name", () => {
    const html = buildSellerEmailHtml(makeOrder([makeItem()]));
    expect(html).toContain("Wiko's Spellbook");
    expect(html).not.toContain("Viki MTG Store");
  });

  it("groups items into one section per binder", () => {
    const html = buildSellerEmailHtml(
      makeOrder([
        makeItem({ binder: "a10" }),
        makeItem({ binder: "a02", name: "Sol Ring" }),
        makeItem({ binder: "a10", name: "Counterspell" }),
      ]),
    );
    // Two section headers (one per distinct binder), not three. The h2 text
    // wraps the card-count in a nested <span>, so the regex needs to span
    // markup with [\s\S]*?, not [^<]* (which would stop at the span's <).
    const headerMatches = html.match(/<h2[\s\S]*?\(\d+ cards?\)/g) ?? [];
    expect(headerMatches).toHaveLength(2);
  });

  it("renders binder codes with the letter prefix upper-cased (a10 → A10)", () => {
    const html = buildSellerEmailHtml(makeOrder([makeItem({ binder: "a10" })]));
    expect(html).toContain("A10");
    expect(html).not.toMatch(/<h2[^>]*>\s*a10/);
  });

  it("title-cases pure-word binder names so 'unsorted' renders as 'Unsorted' (not UNSORTED)", () => {
    const html = buildSellerEmailHtml(
      makeOrder([makeItem({ binder: "unsorted" })]),
    );
    expect(html).toContain("Unsorted");
    expect(html).not.toContain("UNSORTED");
  });

  it("sorts binder sections by stored (lowercase) name so order is deterministic regardless of cart insertion order", () => {
    const html = buildSellerEmailHtml(
      makeOrder([
        makeItem({ binder: "a10", name: "Card from A10" }),
        makeItem({ binder: "a02", name: "Card from A02" }),
        makeItem({ binder: "unsorted", name: "Card from Unsorted" }),
      ]),
    );
    // Collect header labels in render order. Whitespace between <h2> and the
    // label is normal HTML formatting; use a regex rather than indexOf so the
    // test doesn't lock to exact byte layout.
    const headers = [...html.matchAll(/<h2[^>]*>\s*([A-Za-z0-9]+)\s+<span/g)].map(
      (m) => m[1],
    );
    expect(headers).toEqual(["A02", "A10", "Unsorted"]);
  });

  it("shows the per-binder card count in the section header (sums quantity, not row count)", () => {
    const html = buildSellerEmailHtml(
      makeOrder([
        makeItem({ binder: "a10", quantity: 1, name: "Card 1" }),
        makeItem({ binder: "a10", quantity: 2, name: "Card 2" }),
      ]),
    );
    expect(html).toMatch(/A10[\s\S]*?\(3 cards\)/);
  });

  it("singular vs plural in the count label", () => {
    const html = buildSellerEmailHtml(
      makeOrder([makeItem({ binder: "a01", quantity: 1 })]),
    );
    expect(html).toContain("(1 card)");
    expect(html).not.toContain("(1 cards)");
  });
});
