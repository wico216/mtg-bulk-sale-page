import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveQaGateReviewMock, enforceRateLimitMock } = vi.hoisted(() => ({
  saveQaGateReviewMock: vi.fn(),
  enforceRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/qa-gate-auth", () => ({
  getQaGateAccess: vi.fn(async () => ({
    ok: true,
    actorEmail: null,
    via: "qa-cookie",
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientKeyFromRequest: vi.fn(() => "qa-reviewer:test"),
  enforceRateLimit: enforceRateLimitMock,
  RATE_LIMIT_BUCKETS: { ADMIN_MUTATION: { max: 100, windowMs: 60_000 } },
}));

vi.mock("@/lib/logger", () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/db/qa-gate-reviews", () => ({
  saveQaGateReview: saveQaGateReviewMock,
  getLatestQaGateReview: vi.fn(),
}));

import { POST } from "../route";

function reviewRequest(body: unknown) {
  return new Request("http://localhost/api/qa/gates/demo-mobile-storefront-gate/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ runId: "demo-mobile-storefront-gate" }) };

describe("POST /api/qa/gates/[runId]/review", () => {
  beforeEach(() => {
    saveQaGateReviewMock.mockReset();
    enforceRateLimitMock.mockResolvedValue(null);
    saveQaGateReviewMock.mockImplementation(async (input) => ({
      decision: input.decision,
      notes: input.notes,
      reviewerName: input.reviewerName,
      checklist: input.checklist,
      reviewedAt: "2026-06-04T00:00:00.000Z",
      actorEmail: input.actorEmail,
    }));
  });

  it("rejects a failed gate without actionable notes for Atlas to fix", async () => {
    const response = await POST(
      reviewRequest({
        decision: "failed",
        notes: "   ",
        reviewerName: "Wiko",
        checklist: {
          "video-visible": "pass",
          "expected-readable": "fail",
          "notes-decision": "pass",
          "remote-useful": "pass",
          "spellbook-feel": "na",
        },
      }),
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Failed QA gates need notes describing what Atlas should fix",
    });
    expect(saveQaGateReviewMock).not.toHaveBeenCalled();
  });

  it("rejects an approved gate when required checklist rows are not passing", async () => {
    const response = await POST(
      reviewRequest({
        decision: "approved",
        notes: "Looks good",
        reviewerName: "Wiko",
        checklist: {
          "video-visible": "pass",
          "expected-readable": "fail",
          "notes-decision": "pass",
          "remote-useful": "unchecked",
          "spellbook-feel": "na",
        },
      }),
      params,
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/Cannot approve until required checklist rows pass/);
    expect(body.error).toMatch(/Expected behavior is readable/);
    expect(saveQaGateReviewMock).not.toHaveBeenCalled();
  });

  it("saves a failed gate when reviewer notes explain the fix request", async () => {
    const response = await POST(
      reviewRequest({
        decision: "failed",
        notes: "The approve button copy is confusing. Make the rejection path clearer.",
        reviewerName: "Wiko",
        checklist: {
          "video-visible": "pass",
          "expected-readable": "fail",
          "notes-decision": "pass",
          "remote-useful": "pass",
          "spellbook-feel": "na",
        },
      }),
      params,
    );

    expect(response.status).toBe(200);
    expect(saveQaGateReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "failed",
        notes: "The approve button copy is confusing. Make the rejection path clearer.",
        reviewerName: "Wiko",
      }),
    );
  });
});
