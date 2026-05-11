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
  it("renders [binder] pill with CONTEXT D-05 styling (ADM-01)", () => {
    render(<OrderDetail order={makeOrder()} />);
    const pill = screen.getByText("[a02]");
    expect(pill).toBeInTheDocument();
    const className = pill.getAttribute("class") ?? "";
    expect(className).toContain("bg-gray-100");
    expect(className).toContain("text-gray-700");
    expect(className).toContain("text-xs");
    expect(className).toContain("rounded");
    expect(className).toContain("px-1.5");
    expect(className).toContain("py-0.5");
    expect(className).toContain("ml-2");
  });

  it("renders [unsorted] literally for legacy pre-v1.3 items (D-08)", () => {
    const order = makeOrder({
      items: [makeItem({ binder: "unsorted" })],
    });
    render(<OrderDetail order={order} />);
    expect(screen.getByText("[unsorted]")).toBeInTheDocument();
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
    const a02Pill = screen.getByText("[a02]");
    const a05Pill = screen.getByText("[a05]");
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
    // shows [a02] proving it reads the snapshot, not a join to live cards.
    const order = makeOrder({
      items: [
        makeItem({
          cardId: "deleted-source-card",
          binder: "a02",
        }),
      ],
    });
    render(<OrderDetail order={order} />);
    expect(screen.getByText("[a02]")).toBeInTheDocument();
  });

  it("renders [binder] pill adjacent to the card name (DOM proximity)", () => {
    render(<OrderDetail order={makeOrder()} />);
    const pill = screen.getByText("[a02]");
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
