import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WBinderShareLink } from "@/lib/w-binder-share-types";

const {
  mockRequireAdmin,
  mockEnforceRateLimit,
  mockClientKeyFromRequest,
  mockListWBinderShareLinks,
  mockCreateWBinderShareLink,
  mockNormalizeShareLabel,
  mockNormalizeAllowedWBinders,
  mockParseShareExpiresAt,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockClientKeyFromRequest: vi.fn(),
  mockListWBinderShareLinks: vi.fn(),
  mockCreateWBinderShareLink: vi.fn(),
  mockNormalizeShareLabel: vi.fn(),
  mockNormalizeAllowedWBinders: vi.fn(),
  mockParseShareExpiresAt: vi.fn(),
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
  listWBinderShareLinks: mockListWBinderShareLinks,
  createWBinderShareLink: mockCreateWBinderShareLink,
  normalizeShareLabel: mockNormalizeShareLabel,
  normalizeAllowedWBinders: mockNormalizeAllowedWBinders,
  parseShareExpiresAt: mockParseShareExpiresAt,
}));

import { GET, POST } from "../route";

const adminSession = {
  user: { email: "admin@example.com", name: "Admin" },
};

const link: WBinderShareLink = {
  id: 12,
  label: "Commander pod",
  scope: "w_binders",
  allowedBinders: ["w01"],
  createdByEmail: "admin@example.com",
  expiresAt: "2026-07-12T00:00:00.000Z",
  revokedAt: null,
  lastUsedAt: null,
  useCount: 0,
  createdAt: "2026-06-12T00:00:00.000Z",
};

function request(body?: unknown): Request {
  return new Request("https://spellbook.example/api/admin/w-binder-share-links", {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/admin/w-binder-share-links", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockEnforceRateLimit.mockReset();
    mockClientKeyFromRequest.mockReset();
    mockListWBinderShareLinks.mockReset();
    mockCreateWBinderShareLink.mockReset();
    mockNormalizeShareLabel.mockReset();
    mockNormalizeAllowedWBinders.mockReset();
    mockParseShareExpiresAt.mockReset();

    mockRequireAdmin.mockResolvedValue(adminSession);
    mockClientKeyFromRequest.mockReturnValue("admin@example.com");
    mockEnforceRateLimit.mockResolvedValue(null);
    mockNormalizeShareLabel.mockImplementation((value: string) => value.trim());
    mockNormalizeAllowedWBinders.mockReturnValue(["w01"]);
    mockParseShareExpiresAt.mockReturnValue(new Date("2026-07-12T00:00:00.000Z"));
  });

  it("returns 401/403 responses from requireAdmin before listing links", async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockListWBinderShareLinks).not.toHaveBeenCalled();
  });

  it("lists existing share links for admins", async () => {
    mockListWBinderShareLinks.mockResolvedValueOnce([link]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.links).toEqual([link]);
  });

  it("creates a share link and returns the one-time share URL without tokenHash", async () => {
    mockCreateWBinderShareLink.mockResolvedValueOnce({ link, token: "raw-secret-token" });

    const response = await POST(
      request({
        label: " Commander pod ",
        allowedBinders: ["W01"],
        expiresAt: "2026-07-12T00:00:00.000Z",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateWBinderShareLink).toHaveBeenCalledWith({
      label: "Commander pod",
      allowedBinders: ["w01"],
      expiresAt: new Date("2026-07-12T00:00:00.000Z"),
      actorEmail: "admin@example.com",
    });
    expect(body.success).toBe(true);
    expect(body.link).toEqual(link);
    expect(body.shareUrl).toBe(
      "https://spellbook.example/share/w-binders/raw-secret-token",
    );
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });

  it("rejects invalid payloads before creating a link", async () => {
    mockNormalizeAllowedWBinders.mockImplementationOnce(() => {
      throw new Error("allowedBinders may only include private W binders");
    });

    const response = await POST(request({ label: "Buyer", allowedBinders: ["a01"] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/private W binders/i);
    expect(mockCreateWBinderShareLink).not.toHaveBeenCalled();
  });
});
