// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManaBoxReportView } from "../manabox-report-view";
import type { ManaBoxRemovalReport } from "@/db/manabox-removals";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeReport(): ManaBoxRemovalReport {
  return {
    generatedAt: "2026-05-24T17:00:00.000Z",
    totalRows: 2,
    totalQuantity: 3,
    totalValue: 10.5,
    orderCount: 2,
    lastMarkedAt: null,
    lastMarkedBy: null,
    rows: [
      {
        key: "e2e|150|normal|near_mint",
        name: "Lightning Bolt",
        setCode: "e2e",
        setName: "E2E Masters",
        collectorNumber: "150",
        finish: "normal",
        condition: "near_mint",
        quantity: 2,
        totalValue: 7,
        orderRefs: ["ORD-E2E-0001"],
        orderItemIds: [101],
        binders: ["a02"],
        boxBreakdown: [
          {
            box: "a02",
            quantity: 2,
            orderRefs: ["ORD-E2E-0001"],
            orderItemIds: [101],
          },
        ],
        statuses: ["pending"],
        firstSoldAt: "2026-05-24T16:00:00.000Z",
        lastSoldAt: "2026-05-24T16:00:00.000Z",
        imageUrl: "https://example.com/bolt.jpg",
      },
      {
        key: "e2e|045|normal|lightly_played",
        name: "Counterspell",
        setCode: "e2e",
        setName: "E2E Masters",
        collectorNumber: "045",
        finish: "normal",
        condition: "lightly_played",
        quantity: 1,
        totalValue: 3.5,
        orderRefs: ["ORD-E2E-0002"],
        orderItemIds: [102],
        binders: ["trade_box"],
        boxBreakdown: [
          {
            box: "trade_box",
            quantity: 1,
            orderRefs: ["ORD-E2E-0002"],
            orderItemIds: [102],
          },
        ],
        statuses: ["confirmed"],
        firstSoldAt: "2026-05-24T15:00:00.000Z",
        lastSoldAt: "2026-05-24T15:00:00.000Z",
        imageUrl: "https://example.com/counterspell.jpg",
      },
    ],
  };
}

describe("ManaBoxReportView", () => {
  it("renders a visual report with card pictures and source boxes instead of CSV download", () => {
    render(<ManaBoxReportView report={makeReport()} />);

    expect(screen.queryByRole("link", { name: /download csv/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print visual report/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Lightning Bolt card art/i })).toHaveAttribute(
      "src",
      "https://example.com/bolt.jpg",
    );
    expect(screen.getByRole("img", { name: /Counterspell card art/i })).toHaveAttribute(
      "src",
      "https://example.com/counterspell.jpg",
    );
    expect(screen.getByText("Box A02")).toBeInTheDocument();
    expect(screen.getByText("Box Trade Box")).toBeInTheDocument();
    expect(screen.getByLabelText(/Visual ManaBox removal report/i)).toBeInTheDocument();
  });
});
