import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WBinderShareLink } from "@/lib/w-binder-share-types";

const {
  mockRequireAdmin,
  mockEnforceRateLimit,
  mockClientKeyFromRequest,
  mockRevokeWBinderShareLink,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockClientKeyFromRequest: vi.fn(),
  mockRevokeWBinderShareLink: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock("@/lib/rate-limit", () => ({
  clientKeyFromRequest: mockClientKeyFromRequest,
  enforceRateLimit: mockEnforceRateLimit,
  RATE_LIMIT_BUCKETS: { ADMIN_MUTATION: { capacity: 10, refillRate: 10 } },
}));
vi.mock("@/lib/logger", () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/db/w-binder-share-links", () => ({
  revokeWBinderShareLink: mockRevokeWBinderShareLink,
}));

import { DELETE } from "../route";

const adminSession = {
  user: { email: "admin@example.com", name: "Admin" },
};

const revokedLink: WBinderShareLink = {
  id: 12,
  label: "Commander pod",
  scope: "w_binders",
  allowedBinders: null,
  createdByEmail: "admin@example.com",
  expiresAt: null,
  revokedAt: "2026-06-12T12:00:00.000Z",
  lastUsedAt: null,
  useCount: 0,
  createdAt: "2026-06-12T00:00:00.000Z",
};

function request(): Request {
  return new Request("https://spellbook.example/api/admin/w-binder-share-links/12", {
    method: "DELETE",
  });
}

describe("DELETE /api/admin/w-binder-share-links/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockEnforceRateLimit.mockReset();
    mockClientKeyFromRequest.mockReset();
    mockRevokeWBinderShareLink.mockReset();

    mockRequireAdmin.mockResolvedValue(adminSession);
    mockClientKeyFromRequest.mockReturnValue("admin@example.com");
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("returns requireAdmin responses before revoking", async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await DELETE(request(), { params: Promise.resolve({ id: "12" }) });

    expect(response.status).toBe(403);
    expect(mockRevokeWBinderShareLink).not.toHaveBeenCalled();
  });

  it("revokes an active share link", async () => {
    mockRevokeWBinderShareLink.mockResolvedValueOnce(revokedLink);

    const response = await DELETE(request(), { params: Promise.resolve({ id: "12" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRevokeWBinderShareLink).toHaveBeenCalledWith({
      id: 12,
      actorEmail: "admin@example.com",
    });
    expect(body).toEqual({ success: true, link: revokedLink });
  });

  it("rejects invalid ids and reports missing links", async () => {
    const badIdResponse = await DELETE(request(), {
      params: Promise.resolve({ id: "not-a-number" }),
    });
    expect(badIdResponse.status).toBe(400);
    expect(mockRevokeWBinderShareLink).not.toHaveBeenCalled();

    mockRevokeWBinderShareLink.mockResolvedValueOnce(null);
    const missingResponse = await DELETE(request(), { params: Promise.resolve({ id: "99" }) });
    const missingBody = await missingResponse.json();
    expect(missingResponse.status).toBe(404);
    expect(missingBody.error).toMatch(/not found/i);
  });
});
