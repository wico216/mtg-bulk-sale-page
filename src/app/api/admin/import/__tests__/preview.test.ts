import { vi, describe, it, expect, beforeEach } from "vitest";

// Prevent "server-only" from tripping the node test env.
vi.mock("server-only", () => ({}));

// `vi.hoisted` runs BEFORE vi.mock factories (which Vitest hoists to the
// top of the file). Without it the mock factories would close over
// uninitialized top-level consts -- see
// https://vitest.dev/api/vi.html#vi-hoisted.
const { requireAdminMock, parseManaboxCsvContentsMock, enrichCardsMock } =
  vi.hoisted(() => ({
    requireAdminMock: vi.fn(),
    parseManaboxCsvContentsMock: vi.fn(),
    enrichCardsMock: vi.fn(),
  }));

vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: requireAdminMock,
}));

// Mock the library primitives so this Route Handler test doesn't hit
// the real Scryfall / filesystem cache.
vi.mock("@/lib/csv-parser", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/csv-parser")>("@/lib/csv-parser");
  return { ...actual, parseManaboxCsvContents: parseManaboxCsvContentsMock };
});

vi.mock("@/lib/enrichment", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/enrichment")>("@/lib/enrichment");
  return { ...actual, enrichCards: enrichCardsMock };
});

import { POST } from "../preview/route";
import {
  IMPORT_FILE_FIELD,
  type ImportStreamMessage,
  type PreviewPayload,
} from "@/lib/import-contract";
import type { InventoryRow } from "@/lib/types";

function adminOk() {
  return { user: { email: "admin@example.com", name: "Admin" } };
}
function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function makeRequest(form: FormData): Request {
  return new Request("http://localhost/api/admin/import/preview", {
    method: "POST",
    body: form,
  });
}

async function readStream(res: Response): Promise<ImportStreamMessage[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const messages: ImportStreamMessage[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) messages.push(JSON.parse(line));
    }
  }
  if (buffer.trim()) messages.push(JSON.parse(buffer));
  return messages;
}

function sampleCard(id = "lea-232-normal-near_mint-unsorted"): InventoryRow {
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
    imageUrl: "https://example.com/i.jpg",
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    rarity: "common",
    finish: "normal",
    binder: "unsorted",
  };
}

describe("POST /api/admin/import/preview", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    parseManaboxCsvContentsMock.mockReset();
    enrichCardsMock.mockReset();
  });

  it("returns 401 when requireAdmin returns a 401 Response", async () => {
    requireAdminMock.mockResolvedValueOnce(unauthorized());
    const fd = new FormData();
    fd.append(
      IMPORT_FILE_FIELD,
      new File(["x"], "x.csv", { type: "text/csv" }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when no file is uploaded", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const fd = new FormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file uploaded" });
  });

  it("returns 400 when file extension is not .csv", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const fd = new FormData();
    fd.append(
      IMPORT_FILE_FIELD,
      new File(["x"], "data.xlsx", {
        type: "application/vnd.ms-excel",
      }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "All uploaded files must be .csv" });
  });

  it("streams NDJSON with progress + result when .csv valid", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce({
      cards: [
        sampleCard("lea-232-normal-near_mint-unsorted"),
        sampleCard("mh2-45-foil-lightly_played-unsorted"),
      ],
      skippedRows: [{ rowNumber: 4, reason: "missing Name", fileName: "x.csv" }],
      sourceFiles: [{ name: "x.csv", parsedCards: 2, skippedRows: 1 }],
    });
    enrichCardsMock.mockImplementationOnce(async (cards, opts) => {
      opts?.onProgress?.(1, cards.length);
      opts?.onProgress?.(2, cards.length);
      return {
        cards,
        stats: { processed: 2, skipped: 0, missingPrices: 0 },
        scryfallMisses: [],
      };
    });
    const fd = new FormData();
    fd.append(
      IMPORT_FILE_FIELD,
      new File(["name,set_code\nA,lea"], "x.csv", { type: "text/csv" }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    expect(parseManaboxCsvContentsMock).toHaveBeenCalledWith([
      { fileName: "x.csv", content: "name,set_code\nA,lea" },
    ]);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    const msgs = await readStream(res);
    const progress = msgs.filter((m) => m.type === "progress");
    const results = msgs.filter((m) => m.type === "result");
    expect(progress.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBe(1);
    const preview = (
      results[0] as { type: "result"; preview: PreviewPayload }
    ).preview;
    expect(preview.toImport).toBe(2);
    expect(preview.parseSkipped).toBe(1);
    expect(preview.scryfallSkipped).toBe(0);
    expect(preview.sample.length).toBe(2);
    expect(preview.cards.length).toBe(2);
    expect(preview.sourceFiles).toEqual([
      { name: "x.csv", parsedCards: 2, skippedRows: 1 },
    ]);
    expect(preview.skippedRows).toEqual([
      expect.objectContaining({
        kind: "parse",
        rowNumber: 4,
        reason: "missing Name",
      }),
    ]);
  });

  it("passes multiple CSV uploads to the parser in field order", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce({
      cards: [sampleCard("a"), sampleCard("b")],
      skippedRows: [],
      sourceFiles: [
        { name: "binder-a.csv", parsedCards: 1, skippedRows: 0 },
        { name: "binder-b.csv", parsedCards: 1, skippedRows: 0 },
      ],
    });
    enrichCardsMock.mockResolvedValueOnce({
      cards: [sampleCard("a"), sampleCard("b")],
      stats: { processed: 2, skipped: 0, missingPrices: 0 },
      scryfallMisses: [],
    });

    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["first"], "binder-a.csv"));
    fd.append(IMPORT_FILE_FIELD, new File(["second"], "binder-b.csv"));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    await readStream(res);
    expect(parseManaboxCsvContentsMock).toHaveBeenCalledWith([
      { fileName: "binder-a.csv", content: "first" },
      { fileName: "binder-b.csv", content: "second" },
    ]);
  });

  it("emits error message when enrichCards throws", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce({
      cards: [sampleCard()],
      skippedRows: [],
      sourceFiles: [{ name: "x.csv", parsedCards: 1, skippedRows: 0 }],
    });
    enrichCardsMock.mockRejectedValueOnce(new Error("Scryfall unreachable"));
    const fd = new FormData();
    fd.append(
      IMPORT_FILE_FIELD,
      new File(["x"], "x.csv", { type: "text/csv" }),
    );
    const res = await POST(makeRequest(fd));
    const msgs = await readStream(res);
    const errors = msgs.filter((m) => m.type === "error");
    expect(errors.length).toBe(1);
    expect(
      (errors[0] as { type: "error"; message: string }).message,
    ).toBe("Scryfall unreachable");
  });

  // ---- Phase 19: two-stage NDJSON tests --------------------------------------

  function multiBinderFixture() {
    return {
      cards: [
        sampleCard("a02-1"),
        sampleCard("a02-2"),
        sampleCard("a05-1"),
        sampleCard("a07-1"),
        sampleCard("a07-2"),
        sampleCard("a07-3"),
      ].map((c, i) => ({
        ...c,
        binder: i < 2 ? "a02" : i < 3 ? "a05" : "a07",
      })),
      skippedRows: [],
      sourceFiles: [{ name: "x.csv", parsedCards: 6, skippedRows: 0 }],
    };
  }

  it("binders message is the FIRST NDJSON line (Phase 19 D-01)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce(multiBinderFixture());
    enrichCardsMock.mockResolvedValueOnce({
      cards: multiBinderFixture().cards,
      stats: { processed: 6, skipped: 0, missingPrices: 0 },
      scryfallMisses: [],
    });
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["x"], "x.csv", { type: "text/csv" }));

    const res = await POST(makeRequest(fd));
    const msgs = await readStream(res);
    expect(msgs[0].type).toBe("binders");
    const binders = (msgs[0] as { type: "binders"; binders: Array<{ name: string; rowCount: number; sampleNames: string[]; isNew: boolean }> }).binders;
    expect(binders.map((b) => b.name).sort()).toEqual(["a02", "a05", "a07"]);
    const a07 = binders.find((b) => b.name === "a07")!;
    expect(a07.rowCount).toBe(3);
    expect(a07.sampleNames.length).toBeGreaterThan(0);
  });

  it("binders message respects knownBinders for isNew (Phase 19 D-04)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce(multiBinderFixture());
    enrichCardsMock.mockResolvedValueOnce({
      cards: multiBinderFixture().cards,
      stats: { processed: 6, skipped: 0, missingPrices: 0 },
      scryfallMisses: [],
    });
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["x"], "x.csv", { type: "text/csv" }));
    fd.append("knownBinders", JSON.stringify(["a02"]));

    const res = await POST(makeRequest(fd));
    const msgs = await readStream(res);
    const binders = (msgs[0] as { type: "binders"; binders: Array<{ name: string; isNew: boolean }> }).binders;
    expect(binders.find((b) => b.name === "a02")!.isNew).toBe(false);
    expect(binders.find((b) => b.name === "a05")!.isNew).toBe(true);
    expect(binders.find((b) => b.name === "a07")!.isNew).toBe(true);
  });

  it("knownBinders silently normalizes drift — capital A02 still matches a02", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce(multiBinderFixture());
    enrichCardsMock.mockResolvedValueOnce({
      cards: multiBinderFixture().cards,
      stats: { processed: 6, skipped: 0, missingPrices: 0 },
      scryfallMisses: [],
    });
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["x"], "x.csv", { type: "text/csv" }));
    fd.append("knownBinders", JSON.stringify(["A02"]));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const msgs = await readStream(res);
    const binders = (msgs[0] as { type: "binders"; binders: Array<{ name: string; isNew: boolean }> }).binders;
    expect(binders.find((b) => b.name === "a02")!.isNew).toBe(false);
  });

  it("selectedBinders scopes enrichment input (Phase 19 D-02)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce(multiBinderFixture());
    enrichCardsMock.mockImplementationOnce(async (cards) => ({
      cards,
      stats: { processed: cards.length, skipped: 0, missingPrices: 0 },
      scryfallMisses: [],
    }));
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["x"], "x.csv", { type: "text/csv" }));
    fd.append("selectedBinders", JSON.stringify(["a02"]));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const cardsArg = enrichCardsMock.mock.calls[0][0] as InventoryRow[];
    expect(cardsArg.length).toBe(2); // only a02 cards (2 of them)
    const msgs = await readStream(res);
    const result = msgs.find((m) => m.type === "result") as { type: "result"; preview: PreviewPayload };
    expect(result.preview.cards.length).toBe(2);
  });

  it("selectedBinders === undefined preserves legacy behavior (full enrichment)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce(multiBinderFixture());
    enrichCardsMock.mockImplementationOnce(async (cards) => ({
      cards,
      stats: { processed: cards.length, skipped: 0, missingPrices: 0 },
      scryfallMisses: [],
    }));
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["x"], "x.csv", { type: "text/csv" }));
    // NO selectedBinders field — legacy single-stage flow.

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const cardsArg = enrichCardsMock.mock.calls[0][0] as InventoryRow[];
    expect(cardsArg.length).toBe(6); // all 6 cards
  });

  it("returns 400 for selectedBinders entry that is not normalized (Phase 19 D-16)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce(multiBinderFixture());
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["x"], "x.csv", { type: "text/csv" }));
    fd.append("selectedBinders", JSON.stringify(["A02"]));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not normalized/);
    expect(enrichCardsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for selectedBinders entry not present in upload (Phase 19 D-16)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce(multiBinderFixture());
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["x"], "x.csv", { type: "text/csv" }));
    fd.append("selectedBinders", JSON.stringify(["a99"]));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not present in this upload/);
    expect(enrichCardsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for selectedBinders length > 200 (Phase 19 D-16)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvContentsMock.mockReturnValueOnce(multiBinderFixture());
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["x"], "x.csv", { type: "text/csv" }));
    const oversize = Array.from({ length: 201 }, (_, i) => `b_${i}`);
    fd.append("selectedBinders", JSON.stringify(oversize));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/exceeds 200/);
    expect(enrichCardsMock).not.toHaveBeenCalled();
  });
});
