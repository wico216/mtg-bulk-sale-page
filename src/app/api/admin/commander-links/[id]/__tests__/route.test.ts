import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommanderLink } from "@/lib/commander-links-types";

const {
  mockRequireAdmin,
  mockEnforceRateLimit,
  mockClientKeyFromRequest,
  mockDeleteCommanderLink,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockClientKeyFromRequest: vi.fn(),
  mockDeleteCommanderLink: vi.fn(),
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
vi.mock("@/db/commander-links", () => ({
  deleteCommanderLink: mockDeleteCommanderLink,
}));

import { DELETE } from "../route";

const adminSession = {
  user: { email: "admin@example.com", name: "Admin" },
};

const commander: CommanderLink = {
  id: 7,
  name: "Muldrotha, the Gravetide",
  edhrecUrl: "https://edhrec.com/commanders/muldrotha-the-gravetide",
  imageUrl: "https://cards.scryfall.io/normal/front/test.jpg",
  createdByEmail: "admin@example.com",
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
};

function request(): Request {
  return new Request("https://spellbook.example/api/admin/commander-links/7", {
    method: "DELETE",
  });
}

describe("/api/admin/commander-links/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockEnforceRateLimit.mockReset();
    mockClientKeyFromRequest.mockReset();
    mockDeleteCommanderLink.mockReset();

    mockRequireAdmin.mockResolvedValue(adminSession);
    mockClientKeyFromRequest.mockReturnValue("admin@example.com");
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("rejects unauthenticated deletes before mutating", async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await DELETE(request(), { params: Promise.resolve({ id: "7" }) });

    expect(response.status).toBe(401);
    expect(mockDeleteCommanderLink).not.toHaveBeenCalled();
  });

  it("deletes a commander link by id", async () => {
    mockDeleteCommanderLink.mockResolvedValueOnce(commander);

    const response = await DELETE(request(), { params: Promise.resolve({ id: "7" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDeleteCommanderLink).toHaveBeenCalledWith({
      id: 7,
      actorEmail: "admin@example.com",
    });
    expect(body.success).toBe(true);
    expect(body.commander).toEqual(commander);
  });

  it("returns 404 when the commander link does not exist", async () => {
    mockDeleteCommanderLink.mockResolvedValueOnce(null);

    const response = await DELETE(request(), { params: Promise.resolve({ id: "404" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});
