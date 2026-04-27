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
import type { Card } from "@/lib/types";

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
    imageUrl: "https://example.com/i.jpg",
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    rarity: "common",
    foil: false,
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
        sampleCard("lea-232-normal-near_mint"),
        sampleCard("mh2-45-foil-lightly_played"),
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
});
