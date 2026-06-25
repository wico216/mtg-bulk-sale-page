import { describe, expect, it } from "vitest";
import {
  defineQaGateRun,
  emptyQaChecklist,
  getQaGateRun,
  isQaChecklistState,
  listQaGateRuns,
  normalizeQaChecklist,
  validateQaGateRun,
} from "../qa-gates";

describe("QA gate registry", () => {
  it("lists the demo approval gate and the Visual QA loop exemplar", () => {
    const runs = listQaGateRuns();
    expect(runs.map((run) => run.id)).toEqual(
      expect.arrayContaining([
        "demo-mobile-storefront-gate",
        "mobile-storefront-visual-qa-loop",
      ]),
    );
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

  it("describes the mobile storefront Visual QA loop exemplar honestly", () => {
    const run = getQaGateRun("mobile-storefront-visual-qa-loop");
    expect(run).toBeDefined();
    expect(run!.featureArea).toContain("Visual QA");
    expect(run!.checklist.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "mobile-proof-attached",
        "phone-layout-safe",
        "storefront-controls-usable",
        "remote-reviewable",
      ]),
    );
    expect(run!.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "mobile-proof-placeholder",
          status: "not-run",
        }),
      ]),
    );
  });

  it("validates generated gate packets before registry use", () => {
    const valid = defineQaGateRun({
      id: "unit-test-gate",
      ticketId: "UNIT-1",
      title: "Unit test gate",
      featureArea: "Unit tests",
      summary: "A compact manifest that exercises the gate helper.",
      proofRun: {
        tool: "Vitest",
        recordedAt: "2026-06-25T12:56:02.000Z",
        targetUrl: "/qa/gates/unit-test-gate",
        browser: "none",
        command: "npm test -- --run src/lib/__tests__/qa-gates.test.ts",
        resultSummary: "Helper accepted a compact gate manifest.",
      },
      createdAt: "2026-06-25T12:56:02.000Z",
      expectedBehavior: ["The helper fills optional arrays and validates required fields."],
      checklist: [
        {
          id: "helper-works",
          label: "Helper works",
          expected: "The manifest becomes a complete QaGateRun.",
          required: true,
        },
      ],
    });

    expect(valid.evidence).toEqual([]);
    expect(valid.artifacts).toEqual([]);
    expect(validateQaGateRun(valid)).toEqual([]);
  });

  it("rejects malformed gate packets", () => {
    const demo = getQaGateRun("demo-mobile-storefront-gate");
    expect(demo).toBeDefined();

    expect(
      validateQaGateRun({
        ...demo!,
        id: "bad-gate",
        expectedBehavior: [],
        checklist: [
          ...demo!.checklist,
          { ...demo!.checklist[0] },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "expectedBehavior must include at least one item",
        "checklist id 'video-visible' is duplicated",
      ]),
    );
  });
});
