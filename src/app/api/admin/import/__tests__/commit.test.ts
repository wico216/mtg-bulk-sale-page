import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// `vi.hoisted` runs before vi.mock factories (which Vitest 4 hoists to the
// top of the file). See https://vitest.dev/api/vi.html#vi-hoisted.
const { requireAdminMock, replaceAllCardsMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  replaceAllCardsMock: vi.fn(),
}));

vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: requireAdminMock,
}));

// Mock @/db/queries WITHOUT importActual -- the actual module imports
// @/db/client which calls drizzle() at module load time and fails without
// a DATABASE_URL in the test env. The commit route only consumes
// replaceAllCards so a thin mock is sufficient.
vi.mock("@/db/queries", () => ({
  replaceAllCards: replaceAllCardsMock,
}));

import { POST } from "../commit/route";
import type { Card } from "@/lib/types";

function adminOk() {
  return { user: { email: "admin@example.com", name: "Admin" } };
}
function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/import/commit", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function sampleCard(id = "lea-232-normal-near_mint"): Card {
  return {
    id,
    name: "Lightning Bolt",
    setCode: "lea",
    setName: "Alpha",
    collectorNumber: "232",
    price: 2.5,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: ["R"],
    imageUrl: null,
    oracleText: null,
    rarity: "common",
    foil: false,
  };
}

describe("POST /api/admin/import/commit", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    replaceAllCardsMock.mockReset();
  });

  it("returns 401 when requireAdmin returns 401 Response", async () => {
    requireAdminMock.mockResolvedValueOnce(unauthorized());
    const res = await POST(makeJsonRequest({ cards: [sampleCard()] }));
    expect(res.status).toBe(401);
    expect(replaceAllCardsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not valid JSON", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const res = await POST(makeJsonRequest("not json {"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when body.cards is missing", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const res = await POST(makeJsonRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing cards array" });
  });

  it("returns 400 when body.cards is a string, not array", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const res = await POST(makeJsonRequest({ cards: "oops" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing cards array" });
  });

  it("returns 200 and calls replaceAllCards exactly once with body.cards", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [sampleCard("a"), sampleCard("b"), sampleCard("c")];
    replaceAllCardsMock.mockResolvedValueOnce({ inserted: 3 });
    const res = await POST(makeJsonRequest({ cards }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, inserted: 3 });
    expect(replaceAllCardsMock).toHaveBeenCalledTimes(1);
    expect(replaceAllCardsMock).toHaveBeenCalledWith(cards);
  });

  it("returns 500 when replaceAllCards rejects", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    replaceAllCardsMock.mockRejectedValueOnce(new Error("DB is down"));
    const res = await POST(makeJsonRequest({ cards: [sampleCard()] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Import failed — inventory unchanged",
    });
  });
});
