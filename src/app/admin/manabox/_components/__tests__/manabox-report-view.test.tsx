// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
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

function makeBoxGroupedReport(): ManaBoxRemovalReport {
  return {
    generatedAt: "2026-05-24T17:00:00.000Z",
    totalRows: 3,
    totalQuantity: 5,
    totalValue: 15.75,
    orderCount: 3,
    lastMarkedAt: null,
    lastMarkedBy: null,
    rows: [
      {
        key: "e2e|005|foil|near_mint",
        name: "Diabolic Edict",
        setCode: "e2e",
        setName: "E2E Masters",
        collectorNumber: "005",
        finish: "foil",
        condition: "near_mint",
        quantity: 3,
        totalValue: 8.25,
        orderRefs: ["ORD-E2E-0001", "ORD-E2E-0002"],
        orderItemIds: [201, 202],
        binders: ["a01", "b01"],
        boxBreakdown: [
          {
            box: "a01",
            quantity: 1,
            orderRefs: ["ORD-E2E-0001"],
            orderItemIds: [201],
          },
          {
            box: "b01",
            quantity: 2,
            orderRefs: ["ORD-E2E-0002"],
            orderItemIds: [202],
          },
        ],
        statuses: ["confirmed"],
        firstSoldAt: "2026-05-24T15:00:00.000Z",
        lastSoldAt: "2026-05-24T16:00:00.000Z",
        imageUrl: "https://example.com/edict.jpg",
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
        orderRefs: ["ORD-E2E-0001"],
        orderItemIds: [203],
        binders: ["a01"],
        boxBreakdown: [
          {
            box: "a01",
            quantity: 1,
            orderRefs: ["ORD-E2E-0001"],
            orderItemIds: [203],
          },
        ],
        statuses: ["pending"],
        firstSoldAt: "2026-05-24T16:00:00.000Z",
        lastSoldAt: "2026-05-24T16:00:00.000Z",
        imageUrl: "https://example.com/counterspell.jpg",
      },
      {
        key: "e2e|001|foil|near_mint",
        name: "Sol Ring",
        setCode: "e2e",
        setName: "E2E Masters",
        collectorNumber: "001",
        finish: "foil",
        condition: "near_mint",
        quantity: 1,
        totalValue: 4,
        orderRefs: ["ORD-E2E-0003"],
        orderItemIds: [204],
        binders: ["b01"],
        boxBreakdown: [
          {
            box: "b01",
            quantity: 1,
            orderRefs: ["ORD-E2E-0003"],
            orderItemIds: [204],
          },
        ],
        statuses: ["pending"],
        firstSoldAt: "2026-05-24T14:00:00.000Z",
        lastSoldAt: "2026-05-24T14:00:00.000Z",
        imageUrl: "https://example.com/sol-ring.jpg",
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

  it("groups removal cards by Spellbook source box so one box can be pulled at a time", () => {
    render(<ManaBoxReportView report={makeBoxGroupedReport()} />);

    const visualReport = screen.getByLabelText(/Visual ManaBox removal report/i);
    const boxA01 = within(visualReport).getByRole("region", { name: /Box A01 ManaBox removals/i });
    const boxB01 = within(visualReport).getByRole("region", { name: /Box B01 ManaBox removals/i });

    expect(within(boxA01).getByRole("heading", { name: "Box A01" })).toBeInTheDocument();
    expect(within(boxA01).getByText(/2 card rows/i)).toBeInTheDocument();
    expect(within(boxA01).getByRole("article", { name: /Diabolic Edict ManaBox removal card/i })).toBeInTheDocument();
    expect(within(boxA01).getByRole("article", { name: /Counterspell ManaBox removal card/i })).toBeInTheDocument();
    expect(within(boxA01).queryByRole("article", { name: /Sol Ring ManaBox removal card/i })).not.toBeInTheDocument();

    const a01Edict = within(boxA01).getByRole("article", { name: /Diabolic Edict ManaBox removal card/i });
    expect(within(a01Edict).getByLabelText("1 copy to remove")).toBeInTheDocument();
    expect(within(a01Edict).getByText("Items #201")).toBeInTheDocument();

    const b01Edict = within(boxB01).getByRole("article", { name: /Diabolic Edict ManaBox removal card/i });
    expect(within(b01Edict).getByLabelText("2 copies to remove")).toBeInTheDocument();
    expect(within(b01Edict).getByText("Items #202")).toBeInTheDocument();
    expect(within(boxB01).getByRole("article", { name: /Sol Ring ManaBox removal card/i })).toBeInTheDocument();

    const groupHeadings = [...visualReport.querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(groupHeadings).toEqual(["Box A01", "Box B01"]);
  });
});
