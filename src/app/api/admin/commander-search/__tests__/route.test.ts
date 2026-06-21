import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommanderSearchResult } from "@/lib/commander-links-types";

const {
  mockRequireAdmin,
  mockEnforceRateLimit,
  mockClientKeyFromRequest,
  mockNormalizeCommanderSearchQuery,
  mockSearchCommanderCards,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockClientKeyFromRequest: vi.fn(),
  mockNormalizeCommanderSearchQuery: vi.fn(),
  mockSearchCommanderCards: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock("@/lib/rate-limit", () => ({
  clientKeyFromRequest: mockClientKeyFromRequest,
  enforceRateLimit: mockEnforceRateLimit,
  RATE_LIMIT_BUCKETS: { ADMIN_BULK: { capacity: 20, refillRate: 20 } },
}));
vi.mock("@/lib/logger", () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/db/commander-links", () => ({
  normalizeCommanderSearchQuery: mockNormalizeCommanderSearchQuery,
  searchCommanderCards: mockSearchCommanderCards,
}));

import { GET } from "../route";

const adminSession = {
  user: { email: "admin@example.com", name: "Admin" },
};

const atraxaResult: CommanderSearchResult = {
  name: "Atraxa, Praetors' Voice",
  scryfallId: "atraxa-id",
  edhrecUrl: "https://edhrec.com/commanders/atraxa-praetors-voice",
  imageUrl: "https://cards.scryfall.io/normal/front/atraxa.jpg",
  typeLine: "Legendary Creature — Phyrexian Angel Horror",
  colorIdentity: ["G", "W", "U", "B"],
};

function request(query: string): Request {
  return new Request(`https://spellbook.example/api/admin/commander-search?q=${encodeURIComponent(query)}`);
}

describe("/api/admin/commander-search", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockEnforceRateLimit.mockReset();
    mockClientKeyFromRequest.mockReset();
    mockNormalizeCommanderSearchQuery.mockReset();
    mockSearchCommanderCards.mockReset();

    mockRequireAdmin.mockResolvedValue(adminSession);
    mockClientKeyFromRequest.mockReturnValue("admin@example.com");
    mockEnforceRateLimit.mockResolvedValue(null);
    mockNormalizeCommanderSearchQuery.mockImplementation((value: string) => value.trim());
  });

  it("returns requireAdmin responses before searching", async () => {
    mockRequireAdmin.mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET(request("atraxa"));

    expect(response.status).toBe(401);
    expect(mockSearchCommanderCards).not.toHaveBeenCalled();
  });

  it("returns no results for too-short queries without touching rate-limit or Scryfall", async () => {
    const response = await GET(request("a"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
    expect(mockSearchCommanderCards).not.toHaveBeenCalled();
  });

  it("searches commander cards for admins", async () => {
    mockSearchCommanderCards.mockResolvedValueOnce([atraxaResult]);

    const response = await GET(request(" atraxa "));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockNormalizeCommanderSearchQuery).toHaveBeenCalledWith(" atraxa ");
    expect(mockSearchCommanderCards).toHaveBeenCalledWith("atraxa");
    expect(body.results).toEqual([atraxaResult]);
  });

  it("rejects invalid normalized queries", async () => {
    mockNormalizeCommanderSearchQuery.mockImplementationOnce(() => {
      throw new Error("query must be 80 characters or less");
    });

    const response = await GET(request("x".repeat(81)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/80 characters/i);
    expect(mockSearchCommanderCards).not.toHaveBeenCalled();
  });
});
