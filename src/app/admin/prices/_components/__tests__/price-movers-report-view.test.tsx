// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceMoversReportView } from "../price-movers-report-view";
import type { PriceMoversReport } from "@/db/price-movers";

function makeReport(): PriceMoversReport {
  return {
    generatedAt: "2026-06-04T12:30:00.000Z",
    totalRows: 2,
    totalQuantity: 6,
    totalInventoryGain: 36.1,
    biggestDollarGain: 13.55,
    highestPercentGain: 900,
    lastSnapshotAt: "2026-06-04T12:00:00.000Z",
    rows: [
      {
        cardId: "rhystic-study-wot-25-foil-near_mint-a03",
        name: "Rhystic Study",
        setCode: "wot",
        setName: "Wilds of Eldraine Enchanting Tales",
        collectorNumber: "25",
        finish: "foil",
        condition: "near_mint",
        binder: "a03",
        quantity: 2,
        imageUrl: "https://example.com/rhystic.jpg",
        previousPrice: 38.2,
        currentPrice: 51.75,
        dollarGain: 13.55,
        percentGain: 35.47,
        inventoryGain: 27.1,
        lastMovedAt: "2026-06-04T12:00:00.000Z",
      },
      {
        cardId: "bulk-uncommon-e2e-7-normal-near_mint-trade-box",
        name: "Bulk Uncommon Spike",
        setCode: "e2e",
        setName: "E2E Masters",
        collectorNumber: "7",
        finish: "normal",
        condition: "near_mint",
        binder: "trade-box",
        quantity: 4,
        imageUrl: null,
        previousPrice: 0.25,
        currentPrice: 2.5,
        dollarGain: 2.25,
        percentGain: 900,
        inventoryGain: 9,
        lastMovedAt: "2026-06-04T11:00:00.000Z",
      },
    ],
  };
}

describe("PriceMoversReportView", () => {
  it("renders an operator report with card art, source boxes, and price deltas", () => {
    render(<PriceMoversReportView report={makeReport()} />);

    expect(screen.getByRole("heading", { name: "Price movers" })).toBeInTheDocument();
    expect(screen.getByText(/cards that jumped in value/i)).toBeInTheDocument();
    expect(screen.getByText("$36.10")).toBeInTheDocument();
    expect(screen.getAllByText("+900.0%").length).toBeGreaterThanOrEqual(1);

    const report = screen.getByLabelText(/Admin Price Movers report/i);
    const rhystic = within(report).getByRole("article", { name: /Rhystic Study price mover/i });
    expect(within(rhystic).getByRole("img", { name: /Rhystic Study card art/i })).toHaveAttribute(
      "src",
      "https://example.com/rhystic.jpg",
    );
    expect(within(rhystic).getByText("Box A03")).toBeInTheDocument();
    expect(within(rhystic).getByText(/2 copies/i)).toBeInTheDocument();
    expect(within(rhystic).getByText("$38.20 → $51.75")).toBeInTheDocument();
    expect(within(rhystic).getByText("+$13.55")).toBeInTheDocument();
    expect(within(rhystic).getByText("+35.5%")).toBeInTheDocument();

    const bulkSpike = within(report).getByRole("article", { name: /Bulk Uncommon Spike price mover/i });
    expect(within(bulkSpike).getByText("Box Trade Box")).toBeInTheDocument();
    expect(within(bulkSpike).getByText("+$9.00 inventory upside")).toBeInTheDocument();
  });

  it("renders a clear baseline empty state before the first tracked upward refresh", () => {
    render(
      <PriceMoversReportView
        report={{
          generatedAt: "2026-06-04T12:30:00.000Z",
          totalRows: 0,
          totalQuantity: 0,
          totalInventoryGain: 0,
          biggestDollarGain: 0,
          highestPercentGain: null,
          lastSnapshotAt: null,
          rows: [],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: /No upward price moves tracked yet/i })).toBeInTheDocument();
    expect(screen.getByText(/Run a price refresh after this feature is deployed/i)).toBeInTheDocument();
  });
});
