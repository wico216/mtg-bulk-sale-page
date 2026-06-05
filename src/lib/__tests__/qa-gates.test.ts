import { describe, expect, it } from "vitest";
import {
  emptyQaChecklist,
  getQaGateRun,
  isQaChecklistState,
  listQaGateRuns,
  normalizeQaChecklist,
} from "../qa-gates";

describe("QA gate registry", () => {
  it("lists the demo approval gate", () => {
    const runs = listQaGateRuns();
    expect(runs.map((run) => run.id)).toContain("demo-mobile-storefront-gate");
  });

  it("describes the full human acceptance packet", () => {
    const run = getQaGateRun("demo-mobile-storefront-gate");
    expect(run).toBeDefined();
    expect(run!.ticketId).toBe("QA-GATE-DEMO");
    expect(run!.changeSummary).toEqual(
      expect.arrayContaining([
        expect.stringContaining("human-in-the-loop"),
      ]),
    );
    expect(run!.reviewerInstructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("watch the recorded browser proof"),
      ]),
    );
    expect(run!.proofRun).toMatchObject({
      tool: "Playwright",
      targetUrl: expect.stringContaining("wikospellbinder"),
    });
    expect(run!.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "video-visible",
          checklistItemId: "video-visible",
          status: "passed",
          artifactKind: "video",
        }),
      ]),
    );
  });

  it("normalizes checklist payloads to the registered run items only", () => {
    const run = getQaGateRun("demo-mobile-storefront-gate");
    expect(run).toBeDefined();
    const checklist = normalizeQaChecklist(
      {
        "video-visible": "pass",
        "expected-readable": "fail",
        "notes-decision": "na",
        "remote-useful": "unchecked",
        "spellbook-feel": "pass",
        ignored: "pass",
      },
      run!,
    );

    expect(checklist).toEqual({
      "video-visible": "pass",
      "expected-readable": "fail",
      "notes-decision": "na",
      "remote-useful": "unchecked",
      "spellbook-feel": "pass",
    });
  });

  it("rejects invalid checklist states", () => {
    const run = getQaGateRun("demo-mobile-storefront-gate");
    expect(run).toBeDefined();
    expect(normalizeQaChecklist({ "video-visible": "maybe" }, run!)).toBeNull();
    expect(isQaChecklistState("maybe")).toBe(false);
  });

  it("creates an unchecked checklist skeleton", () => {
    const run = getQaGateRun("demo-mobile-storefront-gate");
    expect(run).toBeDefined();
    expect(Object.values(emptyQaChecklist(run!))).toEqual(
      Array(run!.checklist.length).fill("unchecked"),
    );
  });
});
