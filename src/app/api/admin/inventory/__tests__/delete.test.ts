import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted runs before vi.mock factories (Vitest 4 hoists factories
// above top-level const declarations). See https://vitest.dev/api/vi.html#vi-hoisted
const { requireAdminMock, replaceAllCardsMock, getCardsMetaMock } =
  vi.hoisted(() => ({
    requireAdminMock: vi.fn(),
    replaceAllCardsMock: vi.fn(),
    getCardsMetaMock: vi.fn(),
  }));

vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: requireAdminMock,
}));

// No vi.importActual — @/db/queries imports @/db/client which calls
// drizzle(DATABASE_URL) at module load and throws without env.
// The DELETE route only consumes replaceAllCards + getCardsMeta.
vi.mock("@/db/queries", () => ({
  replaceAllCards: replaceAllCardsMock,
  getCardsMeta: getCardsMetaMock,
}));

import { DELETE } from "../route";

function adminOk() {
  return { user: { email: "admin@example.com", name: "Admin" } };
}
function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

describe("DELETE /api/admin/inventory (Phase 10.1 D-13/D-14)", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    replaceAllCardsMock.mockReset();
    getCardsMetaMock.mockReset();
  });

  it("Test A: 401 when requireAdmin returns Unauthorized; replaceAllCards is NOT called", async () => {
    requireAdminMock.mockResolvedValueOnce(unauthorized());
    const res = await DELETE();
    expect(res.status).toBe(401);
    expect(replaceAllCardsMock).not.toHaveBeenCalled();
    expect(getCardsMetaMock).not.toHaveBeenCalled();
  });

  it("Test B: 200 success returns { success: true, deleted: <previousTotal> } and calls replaceAllCards([]) exactly once", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    getCardsMetaMock.mockResolvedValueOnce({
      lastUpdated: "2026-04-25T00:00:00.000Z",
      totalCards: 42,
      totalSkipped: 0,
      totalMissingPrices: 0,
    });
    replaceAllCardsMock.mockResolvedValueOnce({ inserted: 0 });

    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, deleted: 42 });
    expect(replaceAllCardsMock).toHaveBeenCalledTimes(1);
    expect(replaceAllCardsMock).toHaveBeenCalledWith([]);
  });

  it("Test C: empty inventory still returns 200 with deleted: 0 and replaceAllCards is still called exactly once (defensive)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    getCardsMetaMock.mockResolvedValueOnce({
      lastUpdated: "2026-04-25T00:00:00.000Z",
      totalCards: 0,
      totalSkipped: 0,
      totalMissingPrices: 0,
    });
    replaceAllCardsMock.mockResolvedValueOnce({ inserted: 0 });

    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, deleted: 0 });
    expect(replaceAllCardsMock).toHaveBeenCalledTimes(1);
    expect(replaceAllCardsMock).toHaveBeenCalledWith([]);
  });

  it("Test D: 500 with the literal error string when replaceAllCards rejects", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    getCardsMetaMock.mockResolvedValueOnce({
      lastUpdated: "2026-04-25T00:00:00.000Z",
      totalCards: 5,
      totalSkipped: 0,
      totalMissingPrices: 0,
    });
    replaceAllCardsMock.mockRejectedValueOnce(new Error("DB exploded"));

    const res = await DELETE();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Delete failed — inventory unchanged",
    });
  });

  it("Test E: getCardsMeta is called BEFORE replaceAllCards so the response carries the pre-delete count", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    getCardsMetaMock.mockResolvedValueOnce({
      lastUpdated: "2026-04-25T00:00:00.000Z",
      totalCards: 7,
      totalSkipped: 0,
      totalMissingPrices: 0,
    });
    replaceAllCardsMock.mockResolvedValueOnce({ inserted: 0 });

    await DELETE();

    const metaCall = getCardsMetaMock.mock.invocationCallOrder[0];
    const replaceCall = replaceAllCardsMock.mock.invocationCallOrder[0];
    expect(metaCall).toBeLessThan(replaceCall);
  });
});
