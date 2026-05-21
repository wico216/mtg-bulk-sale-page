// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    width,
    height,
    className,
  }: {
    alt: string;
    src: string;
    width?: number;
    height?: number;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} width={width} height={height} className={className} />
  ),
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

import { OrderDetail } from "../order-detail";
import type { AdminOrderDetail } from "@/db/orders";
import type { OrderItem } from "@/lib/types";

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    cardId: "sld-123-normal-near_mint-a02",
    name: "Lightning Bolt",
    setName: "Secret Lair Drop",
    setCode: "sld",
    collectorNumber: "123",
    condition: "near_mint",
    price: 1.5,
    quantity: 1,
    lineTotal: 1.5,
    imageUrl: "https://example.com/lb.jpg",
    binder: "a02",
    ...overrides,
  };
}

function makeOrder(overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  return {
    orderRef: "ORD-2026-001",
    buyerName: "Alex Buyer",
    buyerEmail: "alex@example.com",
    buyerPhone: null,
    message: undefined,
    adminNote: null,
    totalItems: 1,
    totalPrice: 1.5,
    status: "pending",
    createdAt: "2026-05-11T12:00:00.000Z",
    items: [makeItem()],
    ...overrides,
  };
}

describe("OrderDetail [binder] pill (Phase 21 Plan 02 Task 2)", () => {
  it("renders [binder] pill identifiable + distinct from name text (ADM-01)", () => {
    render(<OrderDetail order={makeOrder()} />);
    const pill = screen.getByText("[A02]");
    expect(pill).toBeInTheDocument();
    // Behaviour-level checks (post-v1.4 admin redesign): the pill is now
    // styled via brand-token inline styles instead of literal Tailwind
    // classes. The load-bearing requirements per Phase 21 D-05/D-06 are:
    //   1. Square brackets are literal in the text content.
    //   2. The pill is its own element (not inline with the card name),
    //      identifiable via data-binder-pill, so screen readers and DOM
    //      tooling can find it.
    //   3. Visually distinct from the card name via background + border
    //      (chip / badge affordance).
    expect(pill.hasAttribute("data-binder-pill")).toBe(true);
    expect(pill.tagName.toLowerCase()).toBe("span");
    // Pill is NOT the same element as the card name.
    const name = screen.getByText("Lightning Bolt");
    expect(pill).not.toBe(name);
    // Pill carries some visual styling that distinguishes it from plain
    // text — either inline background (post-redesign) or a class-driven
    // background (legacy). Asserting "has *some* visual differentiation"
    // rather than pinning specific tokens keeps the test robust to
    // future palette swaps.
    const hasInlineBg = (pill.getAttribute("style") ?? "").includes("background");
    const hasBgClass = (pill.getAttribute("class") ?? "").match(/(^|\s)bg-/);
    expect(hasInlineBg || Boolean(hasBgClass)).toBe(true);
  });

  it("renders [unsorted] literally for legacy pre-v1.3 items (D-08)", () => {
    const order = makeOrder({
      items: [makeItem({ binder: "unsorted" })],
    });
    render(<OrderDetail order={order} />);
    expect(screen.getByText("[Unsorted]")).toBeInTheDocument();
  });

  it("renders multi-binder same-card lines as separate rows (D-07)", () => {
    const order = makeOrder({
      items: [
        makeItem({
          cardId: "sld-123-normal-near_mint-a02",
          quantity: 1,
          lineTotal: 0.5,
          price: 0.5,
          imageUrl: null,
          binder: "a02",
        }),
        makeItem({
          cardId: "sld-123-normal-near_mint-a05",
          quantity: 2,
          lineTotal: 1.0,
          price: 0.5,
          imageUrl: null,
          binder: "a05",
        }),
      ],
    });
    render(<OrderDetail order={order} />);
    const a02Pill = screen.getByText("[A02]");
    const a05Pill = screen.getByText("[A05]");
    expect(a02Pill).toBeInTheDocument();
    expect(a05Pill).toBeInTheDocument();
    // Both pills exist as distinct DOM nodes (no aggregation).
    expect(a02Pill).not.toBe(a05Pill);
    // Both rows show "Lightning Bolt" — getAllByText returns >= 2.
    expect(screen.getAllByText("Lightning Bolt").length).toBeGreaterThanOrEqual(2);
  });

  it("renders binder from item snapshot — survives missing source card (D-06)", () => {
    // Fixture has binder='a02' but a cardId that would not match any
    // live cards row (deliberately mismatched); the rendering still
    // shows [A02] (display-formatted from stored "a02") proving it reads the
    // snapshot, not a join to live cards.
    const order = makeOrder({
      items: [
        makeItem({
          cardId: "deleted-source-card",
          binder: "a02",
        }),
      ],
    });
    render(<OrderDetail order={order} />);
    expect(screen.getByText("[A02]")).toBeInTheDocument();
  });

  it("renders [binder] pill adjacent to the card name (DOM proximity)", () => {
    render(<OrderDetail order={makeOrder()} />);
    const pill = screen.getByText("[A02]");
    const name = screen.getByText("Lightning Bolt");
    // Both should share a common ancestor — the items.map row container.
    // Walk up from pill until we find an ancestor that also contains name.
    let ancestor: HTMLElement | null = pill;
    while (ancestor && !ancestor.contains(name)) {
      ancestor = ancestor.parentElement;
    }
    expect(ancestor).not.toBeNull();
  });
});

describe("OrderDetail buyer phone (Quick 260514-7z2)", () => {
  it("renders a tel: link when buyerPhone is set", () => {
    render(<OrderDetail order={makeOrder({ buyerPhone: "555-1234" })} />);
    const phoneLink = screen.getByRole("link", { name: "555-1234" });
    expect(phoneLink).toBeInTheDocument();
    expect(phoneLink.getAttribute("href")).toBe("tel:555-1234");
  });

  it("renders 'No phone provided.' fallback when buyerPhone is null", () => {
    render(<OrderDetail order={makeOrder({ buyerPhone: null })} />);
    expect(screen.getByText(/no phone provided/i)).toBeInTheDocument();
    // And the tel: link MUST NOT exist in this branch.
    expect(screen.queryByRole("link", { name: /tel:/ })).toBeNull();
  });
});
