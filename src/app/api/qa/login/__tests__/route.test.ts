import { beforeEach, describe, expect, it, vi } from "vitest";

const { enforceRateLimitMock } = vi.hoisted(() => ({
  enforceRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/qa-gate-auth", () => ({
  isQaGateConfigured: vi.fn(() => true),
  verifyQaGatePassword: vi.fn((password: string) => password === "qa-ci-password"),
  createQaGateToken: vi.fn(() => "signed-qa-token"),
  safeQaNextPath: vi.fn((value: string | null) =>
    value?.startsWith("/qa/") ? value : "/qa/gates",
  ),
  QA_GATE_COOKIE_MAX_AGE_SECONDS: 604_800,
  QA_GATE_COOKIE_NAME: "wiko_qa_gate",
}));

vi.mock("@/lib/e2e-fixtures", () => ({
  e2eFixturesEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientKeyFromRequest: vi.fn(() => "qa-login:test"),
  enforceRateLimit: enforceRateLimitMock,
  RATE_LIMIT_BUCKETS: { ADMIN_MUTATION: { max: 100, windowMs: 60_000 } },
}));

vi.mock("@/lib/logger", () => ({
  logEvent: vi.fn(),
}));

import { POST } from "../route";

function loginRequest(password: string, next = "/qa/gates/demo-mobile-storefront-gate") {
  const form = new URLSearchParams({ password, next });
  return new Request("http://internal-next-host/api/qa/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-forwarded-host": "evil.example.com",
      "x-forwarded-proto": "https",
    },
    body: form.toString(),
  });
}

describe("POST /api/qa/login", () => {
  beforeEach(() => {
    enforceRateLimitMock.mockReset();
    enforceRateLimitMock.mockResolvedValue(null);
  });

  it("redirects with a relative location and never trusts forwarded hosts", async () => {
    const response = await POST(loginRequest("qa-ci-password"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/qa/gates/demo-mobile-storefront-gate",
    );
    expect(response.headers.get("location")).not.toContain("evil.example.com");
    expect(response.headers.get("set-cookie")).toContain("wiko_qa_gate=");
  });

  it("keeps bad-password redirects relative too", async () => {
    const response = await POST(loginRequest("wrong-password"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/qa/login?error=bad-password&next=%2Fqa%2Fgates%2Fdemo-mobile-storefront-gate",
    );
    expect(response.headers.get("location")).not.toContain("evil.example.com");
  });
});
