import { vi, describe, it, expect, beforeEach } from "vitest";

// Prevent "server-only" from tripping the node test env.
vi.mock("server-only", () => ({}));

// `vi.hoisted` runs BEFORE vi.mock factories (which Vitest hoists to the
// top of the file). Without it the mock factories would close over
// uninitialized top-level consts -- see
// https://vitest.dev/api/vi.html#vi-hoisted.
const { requireAdminMock, parseManaboxCsvFilesMock, enrichCardsMock } =
  vi.hoisted(() => ({
    requireAdminMock: vi.fn(),
    parseManaboxCsvFilesMock: vi.fn(),
    enrichCardsMock: vi.fn(),
  }));

vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: requireAdminMock,
}));

// Mock the library primitives so this Route Handler test doesn't hit
// the real Scryfall / filesystem cache. parseManaboxCsvFiles is the only
// csv-parser export the route now calls (10.1-03 multi-file ingestion).
vi.mock("@/lib/csv-parser", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/csv-parser")>("@/lib/csv-parser");
  return { ...actual, parseManaboxCsvFiles: parseManaboxCsvFilesMock };
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
    parseManaboxCsvFilesMock.mockReset();
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
    expect(parseManaboxCsvFilesMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no files are uploaded (empty FormData)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const fd = new FormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file uploaded" });
  });

  it("returns 400 when a single uploaded file does not end in .csv (D-04 plural)", async () => {
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
    expect(await res.json()).toEqual({ error: "All files must be .csv" });
  });

  it("streams NDJSON with progress + result for a SINGLE .csv (1-element multi-file array)", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvFilesMock.mockReturnValueOnce({
      cards: [
        sampleCard("lea-232-normal-near_mint"),
        sampleCard("mh2-45-foil-lightly_played"),
      ],
      skippedRows: [
        { rowNumber: 4, reason: "missing Name", filename: "x.csv" },
      ],
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
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");

    // Verify the route called parseManaboxCsvFiles with a 1-element array
    // (D-01 multi-file uniformity — single-file is just N=1).
    expect(parseManaboxCsvFilesMock).toHaveBeenCalledTimes(1);
    const arg = parseManaboxCsvFilesMock.mock.calls[0][0];
    expect(arg).toHaveLength(1);
    expect(arg[0].filename).toBe("x.csv");
    expect(typeof arg[0].content).toBe("string");

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
    expect(preview.skippedRows[0]).toMatchObject({
      kind: "parse",
      rowNumber: 4,
      reason: "missing Name",
      filename: "x.csv", // D-08: filename flows from SkippedRow into the contract
    });
  });

  it("emits error message when enrichCards throws", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    parseManaboxCsvFilesMock.mockReturnValueOnce({
      cards: [sampleCard()],
      skippedRows: [],
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

  it("D-01/D-03: streams 200 NDJSON when MULTIPLE .csv files are uploaded; pooled progress + filename passthrough", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    // Mock parseManaboxCsvFiles to act as if it merged across the 2 files
    // (the merge logic itself is unit-tested in 10.1-01
    // csv-parser-multi-file.test.ts; here we only need to verify the route
    // calls it correctly and passes its output along).
    parseManaboxCsvFilesMock.mockReturnValueOnce({
      cards: [
        sampleCard("lea-232-normal-near_mint"),
        sampleCard("mh2-45-foil-near_mint"),
      ],
      skippedRows: [
        { rowNumber: 7, reason: "missing Set code", filename: "blue.csv" },
        { rowNumber: 12, reason: "missing Name", filename: "red.csv" },
      ],
    });
    enrichCardsMock.mockImplementationOnce(async (cards, opts) => {
      // Pooled progress: a single counter spanning all files (D-07).
      opts?.onProgress?.(1, cards.length);
      opts?.onProgress?.(2, cards.length);
      return {
        cards,
        stats: { processed: 2, skipped: 0, missingPrices: 0 },
        scryfallMisses: [],
      };
    });

    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["a"], "blue.csv", { type: "text/csv" }));
    fd.append(IMPORT_FILE_FIELD, new File(["b"], "red.csv", { type: "text/csv" }));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);

    // The route must have collected BOTH files via getAll and built a 2-element
    // [{filename, content}, ...] array.
    expect(parseManaboxCsvFilesMock).toHaveBeenCalledTimes(1);
    const arg = parseManaboxCsvFilesMock.mock.calls[0][0];
    expect(arg).toHaveLength(2);
    expect(arg.map((x: { filename: string }) => x.filename)).toEqual([
      "blue.csv",
      "red.csv",
    ]);

    const msgs = await readStream(res);
    const results = msgs.filter((m) => m.type === "result");
    expect(results.length).toBe(1);
    const preview = (
      results[0] as { type: "result"; preview: PreviewPayload }
    ).preview;
    expect(preview.toImport).toBe(2);
    expect(preview.parseSkipped).toBe(2);
    expect(preview.skippedRows).toHaveLength(2);
    expect(preview.skippedRows[0]).toMatchObject({
      kind: "parse",
      filename: "blue.csv",
    });
    expect(preview.skippedRows[1]).toMatchObject({
      kind: "parse",
      filename: "red.csv",
    });
  });

  it("D-04: returns 400 when ANY of multiple uploaded files is not .csv", async () => {
    requireAdminMock.mockResolvedValueOnce(adminOk());
    const fd = new FormData();
    fd.append(IMPORT_FILE_FIELD, new File(["a"], "good.csv", { type: "text/csv" }));
    fd.append(IMPORT_FILE_FIELD, new File(["b"], "evil.txt", { type: "text/plain" }));
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "All files must be .csv" });
    expect(parseManaboxCsvFilesMock).not.toHaveBeenCalled();
  });
});
