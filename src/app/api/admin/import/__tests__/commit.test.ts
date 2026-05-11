import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// `vi.hoisted` runs before vi.mock factories (which Vitest 4 hoists to the
// top of the file). See https://vitest.dev/api/vi.html#vi-hoisted.
const {
  requireAdminMock,
  replaceCardsForBindersMock,
  enforceRateLimitMock,
  logEventMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  replaceCardsForBindersMock: vi.fn(),
  enforceRateLimitMock: vi.fn(),
  logEventMock: vi.fn(),
}));

vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: requireAdminMock,
}));

// Mock @/db/queries WITHOUT importActual -- the actual module imports
// @/db/client which calls drizzle() at module load time and fails without
// a DATABASE_URL in the test env. The commit route only consumes
// replaceCardsForBinders so a thin mock is sufficient.
vi.mock("@/db/queries", () => ({
  replaceCardsForBinders: replaceCardsForBindersMock,
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: enforceRateLimitMock,
  };
});

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  return {
    ...actual,
    logEvent: logEventMock,
  };
});

import { POST } from "../commit/route";
import type { InventoryRow } from "@/lib/types";

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

function sampleCard(
  id = "lea-232-normal-near_mint-unsorted",
  binder = "unsorted",
): InventoryRow {
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
    finish: "normal",
    binder,
  };
}

describe("POST /api/admin/import/commit", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    replaceCardsForBindersMock.mockReset();
    enforceRateLimitMock.mockReset();
    enforceRateLimitMock.mockResolvedValue(null);
    logEventMock.mockReset();
  });

  it("returns 401 when requireAdmin returns 401 Response", async () => {
    requireAdminMock.mockResolvedValueOnce(unauthorized());
    const res = await POST(makeJsonRequest({ cards: [sampleCard()] }));
    expect(res.status).toBe(401);
    expect(replaceCardsForBindersMock).not.toHaveBeenCalled();
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

  it("returns 200 and calls replaceCardsForBinders with audit-safe import metadata", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [sampleCard("a"), sampleCard("b"), sampleCard("c")];
    replaceCardsForBindersMock.mockResolvedValueOnce({ inserted: 3, deleted: 0 });
    const res = await POST(makeJsonRequest({
      cards,
      summary: {
        sourceFiles: [
          { name: "binder-a.csv", parsedCards: 2, skippedRows: 1 },
          { name: "binder-b.csv", parsedCards: 1, skippedRows: 0 },
        ],
        parseSkipped: 1,
        scryfallSkipped: 2,
        missingPrices: 1,
      },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, inserted: 3 });
    expect(replaceCardsForBindersMock).toHaveBeenCalledTimes(1);
    const [cardsArg, selectedBindersArg, auditArg] =
      replaceCardsForBindersMock.mock.calls[0];
    expect(cardsArg).toStrictEqual(cards);
    expect(selectedBindersArg).toEqual(["unsorted"]); // default-resolution
    expect(auditArg).toMatchObject({
      actorEmail: "admin@example.com",
      knownBinders: [],
      metadata: {
        fileNames: ["binder-a.csv", "binder-b.csv"],
        fileCount: 2,
        parsedRows: 3,
        skippedRows: 3,
        parseSkipped: 1,
        scryfallSkipped: 2,
        missingPrices: 1,
        insertedCards: 3,
      },
      importHistory: {
        actorEmail: "admin@example.com",
        fileNames: ["binder-a.csv", "binder-b.csv"],
        fileCount: 2,
        parsedRows: 3,
        skippedRows: 3,
        insertedCards: 3,
        metadata: {
          parseSkipped: 1,
          scryfallSkipped: 2,
          missingPrices: 1,
        },
      },
    });
  });

  it("returns 500 when replaceCardsForBinders rejects", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    replaceCardsForBindersMock.mockRejectedValueOnce(new Error("DB is down"));
    const res = await POST(makeJsonRequest({ cards: [sampleCard()] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Import failed — inventory unchanged",
    });
  });

  // ---- Phase 19: scoped commit tests ----------------------------------------

  it("default-resolves selectedBinders to distinct binders in body.cards (Phase 19)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [
      sampleCard("a02-1", "a02"),
      sampleCard("a02-2", "a02"),
      sampleCard("a05-1", "a05"),
    ];
    replaceCardsForBindersMock.mockResolvedValueOnce({ inserted: 3, deleted: 0 });
    const res = await POST(makeJsonRequest({ cards }));
    expect(res.status).toBe(200);
    const [, selectedBindersArg] = replaceCardsForBindersMock.mock.calls[0];
    // Set semantics: order undefined, but exactly {"a02", "a05"}
    expect(new Set(selectedBindersArg)).toEqual(new Set(["a02", "a05"]));
  });

  it("forwards explicit selectedBinders to replaceCardsForBinders (Phase 19)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [sampleCard("a02-1", "a02")];
    replaceCardsForBindersMock.mockResolvedValueOnce({ inserted: 1, deleted: 0 });
    const res = await POST(
      makeJsonRequest({ cards, selectedBinders: ["a02"] }),
    );
    expect(res.status).toBe(200);
    const [, selectedBindersArg] = replaceCardsForBindersMock.mock.calls[0];
    expect(selectedBindersArg).toEqual(["a02"]);
  });

  it("returns 400 when selectedBinders contains a non-normalized entry (Phase 19 D-16)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [sampleCard("a02-1", "a02")];
    const res = await POST(
      makeJsonRequest({ cards, selectedBinders: ["A02"] }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not normalized/);
    expect(replaceCardsForBindersMock).not.toHaveBeenCalled();
  });

  it("returns 400 when card.binder is not in selectedBinders (Phase 19 D-18)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [sampleCard("a99-1", "a99")];
    const res = await POST(
      makeJsonRequest({ cards, selectedBinders: ["a02"] }),
    );
    expect(res.status).toBe(400);
    expect(replaceCardsForBindersMock).not.toHaveBeenCalled();
  });

  it("returns 400 when selectedBinders length exceeds 200 (Phase 19 D-16)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [sampleCard("a02-1", "a02")];
    const oversize = Array.from({ length: 201 }, (_, i) => `b_${i}`);
    const res = await POST(
      makeJsonRequest({ cards, selectedBinders: oversize }),
    );
    expect(res.status).toBe(400);
    expect(replaceCardsForBindersMock).not.toHaveBeenCalled();
  });

  it("forwards knownBinders (normalized) to replaceCardsForBinders audit ctx (Phase 19)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [sampleCard("a02-1", "a02")];
    replaceCardsForBindersMock.mockResolvedValueOnce({ inserted: 1, deleted: 0 });
    const res = await POST(
      makeJsonRequest({
        cards,
        selectedBinders: ["a02"],
        knownBinders: ["a02", "A07", "  a05  "],
      }),
    );
    expect(res.status).toBe(200);
    const [, , auditArg] = replaceCardsForBindersMock.mock.calls[0];
    // Drift normalized: A07 -> a07, "  a05  " -> a05
    expect(auditArg).toMatchObject({
      knownBinders: ["a02", "a07", "a05"],
    });
  });

  it("rate limit fires BEFORE replaceCardsForBinders is called (Phase 19 D-19)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    enforceRateLimitMock.mockResolvedValueOnce(
      Response.json({ error: "Too many requests" }, { status: 429 }),
    );
    const res = await POST(makeJsonRequest({ cards: [sampleCard()] }));
    expect(res.status).toBe(429);
    expect(replaceCardsForBindersMock).not.toHaveBeenCalled();
  });

  it("logEvent metadata carries selectedBindersCount on success (Phase 19)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const cards = [
      sampleCard("a02-1", "a02"),
      sampleCard("a05-1", "a05"),
    ];
    replaceCardsForBindersMock.mockResolvedValueOnce({ inserted: 2, deleted: 0 });
    await POST(
      makeJsonRequest({ cards, selectedBinders: ["a02", "a05"] }),
    );
    const successCall = logEventMock.mock.calls.find(
      ([arg]) => arg.event === "admin.import_commit.succeeded",
    );
    expect(successCall).toBeDefined();
    expect(successCall![0].metadata).toMatchObject({
      selectedBindersCount: 2,
      insertedCards: 2,
    });
  });
});
