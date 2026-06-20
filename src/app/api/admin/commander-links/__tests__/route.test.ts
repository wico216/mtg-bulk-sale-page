import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommanderLink } from "@/lib/commander-links-types";

const {
  mockRequireAdmin,
  mockEnforceRateLimit,
  mockClientKeyFromRequest,
  mockListCommanderLinks,
  mockCreateCommanderLink,
  mockNormalizeCommanderName,
  mockNormalizeEdhrecUrl,
  mockNormalizeCommanderImageUrl,
  mockBuildEdhrecCommanderUrl,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockClientKeyFromRequest: vi.fn(),
  mockListCommanderLinks: vi.fn(),
  mockCreateCommanderLink: vi.fn(),
  mockNormalizeCommanderName: vi.fn(),
  mockNormalizeEdhrecUrl: vi.fn(),
  mockNormalizeCommanderImageUrl: vi.fn(),
  mockBuildEdhrecCommanderUrl: vi.fn(),
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
  listCommanderLinks: mockListCommanderLinks,
  createCommanderLink: mockCreateCommanderLink,
  normalizeCommanderName: mockNormalizeCommanderName,
  normalizeEdhrecUrl: mockNormalizeEdhrecUrl,
  normalizeCommanderImageUrl: mockNormalizeCommanderImageUrl,
  buildEdhrecCommanderUrl: mockBuildEdhrecCommanderUrl,
}));

import { GET, POST } from "../route";

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

function request(body?: unknown): Request {
  return new Request("https://spellbook.example/api/admin/commander-links", {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/admin/commander-links", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockEnforceRateLimit.mockReset();
    mockClientKeyFromRequest.mockReset();
    mockListCommanderLinks.mockReset();
    mockCreateCommanderLink.mockReset();
    mockNormalizeCommanderName.mockReset();
    mockNormalizeEdhrecUrl.mockReset();
    mockNormalizeCommanderImageUrl.mockReset();
    mockBuildEdhrecCommanderUrl.mockReset();

    mockRequireAdmin.mockResolvedValue(adminSession);
    mockClientKeyFromRequest.mockReturnValue("admin@example.com");
    mockEnforceRateLimit.mockResolvedValue(null);
    mockNormalizeCommanderName.mockImplementation((value: string) => value.trim());
    mockNormalizeEdhrecUrl.mockImplementation((value: string) => value.trim());
    mockNormalizeCommanderImageUrl.mockImplementation((value?: string) => value?.trim() || null);
    mockBuildEdhrecCommanderUrl.mockImplementation(
      (value: string) => `https://edhrec.com/commanders/${value.toLowerCase().replaceAll(" ", "-")}`,
    );
  });

  it("returns 401/403 responses from requireAdmin before listing commanders", async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockListCommanderLinks).not.toHaveBeenCalled();
  });

  it("lists existing commander links for admins", async () => {
    mockListCommanderLinks.mockResolvedValueOnce([commander]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.commanders).toEqual([commander]);
  });

  it("creates a commander link from normalized payload", async () => {
    mockCreateCommanderLink.mockResolvedValueOnce(commander);

    const response = await POST(
      request({
        name: " Muldrotha, the Gravetide ",
        edhrecUrl: " edhrec.com/commanders/muldrotha-the-gravetide ",
        imageUrl: " https://cards.scryfall.io/normal/front/test.jpg ",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateCommanderLink).toHaveBeenCalledWith({
      name: "Muldrotha, the Gravetide",
      edhrecUrl: "edhrec.com/commanders/muldrotha-the-gravetide",
      imageUrl: "https://cards.scryfall.io/normal/front/test.jpg",
      actorEmail: "admin@example.com",
    });
    expect(body.success).toBe(true);
    expect(body.commander).toEqual(commander);
  });

  it("auto-generates the EDHREC URL when the client sends only a selected commander", async () => {
    mockCreateCommanderLink.mockResolvedValueOnce({
      ...commander,
      name: "Atraxa, Praetors' Voice",
      edhrecUrl: "https://edhrec.com/commanders/atraxa-praetors-voice",
    });
    mockBuildEdhrecCommanderUrl.mockReturnValueOnce("https://edhrec.com/commanders/atraxa-praetors-voice");

    const response = await POST(
      request({
        name: " Atraxa, Praetors' Voice ",
        imageUrl: "https://cards.scryfall.io/normal/front/atraxa.jpg",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockNormalizeEdhrecUrl).not.toHaveBeenCalled();
    expect(mockBuildEdhrecCommanderUrl).toHaveBeenCalledWith("Atraxa, Praetors' Voice");
    expect(mockCreateCommanderLink).toHaveBeenCalledWith({
      name: "Atraxa, Praetors' Voice",
      edhrecUrl: "https://edhrec.com/commanders/atraxa-praetors-voice",
      imageUrl: "https://cards.scryfall.io/normal/front/atraxa.jpg",
      actorEmail: "admin@example.com",
    });
  });

  it("rejects invalid commander payloads before creating a link", async () => {
    mockNormalizeEdhrecUrl.mockImplementationOnce(() => {
      throw new Error("edhrecUrl must be an EDHREC link");
    });

    const response = await POST(request({ name: "Prosper", edhrecUrl: "https://example.com" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/EDHREC/i);
    expect(mockCreateCommanderLink).not.toHaveBeenCalled();
  });
});
