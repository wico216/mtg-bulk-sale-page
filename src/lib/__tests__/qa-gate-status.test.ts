import { describe, expect, it } from "vitest";
import { summarizeQaGateStatus, unreadableQaGateStatus } from "../qa-gate-status";

const gate = {
  id: "mobile-storefront-visual-qa-loop",
  title: "Mobile Storefront Visual QA Loop",
};

describe("QA gate status summaries", () => {
  it("reports pending when no review exists", () => {
    expect(summarizeQaGateStatus(gate, null)).toEqual({
      runId: gate.id,
      status: "pending",
      approved: false,
      message: "QA gate 'Mobile Storefront Visual QA Loop' is pending review.",
    });
  });

  it("reports approved reviews as release-ready", () => {
    expect(
      summarizeQaGateStatus(gate, {
        decision: "approved",
        notes: "Ship it.",
        reviewerName: "Wiko",
        checklist: {},
        reviewedAt: "2026-06-25T13:00:00.000Z",
      }),
    ).toMatchObject({
      runId: gate.id,
      status: "approved",
      approved: true,
      reviewerName: "Wiko",
      notes: "Ship it.",
    });
  });

  it("reports failed reviews as blocking", () => {
    expect(
      summarizeQaGateStatus(gate, {
        decision: "failed",
        notes: "Mobile proof is missing.",
        reviewerName: "Wiko",
        checklist: {},
        reviewedAt: "2026-06-25T13:00:00.000Z",
      }),
    ).toMatchObject({
      runId: gate.id,
      status: "failed",
      approved: false,
      notes: "Mobile proof is missing.",
    });
  });

  it("reports unreadable status as fail-closed", () => {
    expect(unreadableQaGateStatus(gate.id, "Unauthorized")).toEqual({
      runId: gate.id,
      status: "unreadable",
      approved: false,
      message: "Unauthorized",
    });
  });
});
