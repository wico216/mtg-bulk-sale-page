import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {
    execute: mockExecute,
  },
}));

import { getAdminHealthSnapshot } from "../admin-health";

beforeEach(() => {
  mockExecute.mockReset();
});

describe("getAdminHealthSnapshot", () => {
  it("returns database ok and the most recent order/import/audit/price-refresh timestamps", async () => {
    // SELECT 1
    mockExecute.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    // last order
    mockExecute.mockResolvedValueOnce({
      rows: [{ last_at: new Date("2026-04-29T12:34:56.000Z") }],
    });
    // last import
    mockExecute.mockResolvedValueOnce({
      rows: [{ last_at: new Date("2026-04-28T11:00:00.000Z") }],
    });
    // last audit
    mockExecute.mockResolvedValueOnce({
      rows: [{ last_at: new Date("2026-04-29T13:00:00.000Z") }],
    });
    // Phase 23 D-06: last price-refresh audit row.
    mockExecute.mockResolvedValueOnce({
      rows: [{ last_at: new Date("2026-05-19T09:00:42.000Z") }],
    });

    const snapshot = await getAdminHealthSnapshot();

    expect(snapshot.database).toBe("ok");
    expect(snapshot.lastOrderAt).toBe("2026-04-29T12:34:56.000Z");
    expect(snapshot.lastImportAt).toBe("2026-04-28T11:00:00.000Z");
    expect(snapshot.lastAuditAt).toBe("2026-04-29T13:00:00.000Z");
    expect(snapshot.lastPriceRefreshAt).toBe("2026-05-19T09:00:42.000Z");
    // 1 probe + 4 parallel MAX reads.
    expect(mockExecute).toHaveBeenCalledTimes(5);
  });

  it("returns nulls for missing timestamps when tables are empty", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });

    const snapshot = await getAdminHealthSnapshot();

    expect(snapshot.database).toBe("ok");
    expect(snapshot.lastOrderAt).toBeNull();
    expect(snapshot.lastImportAt).toBeNull();
    expect(snapshot.lastAuditAt).toBeNull();
    expect(snapshot.lastPriceRefreshAt).toBeNull();
  });

  it("returns database=error and null timestamps when SELECT 1 throws", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection refused"));

    const snapshot = await getAdminHealthSnapshot();

    expect(snapshot.database).toBe("error");
    expect(snapshot.lastOrderAt).toBeNull();
    expect(snapshot.lastImportAt).toBeNull();
    expect(snapshot.lastAuditAt).toBeNull();
    expect(snapshot.lastPriceRefreshAt).toBeNull();
    // Only the SELECT 1 probe should have been attempted -- helper short-circuits
    // when the connectivity probe fails so we don't pile per-table errors on top.
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("does not include any secret-shaped fields in the returned object", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });

    const snapshot = await getAdminHealthSnapshot();
    const serialized = JSON.stringify(snapshot).toLowerCase();

    expect(serialized).not.toMatch(/password|secret|token|api_key|database_url|client_secret/);
  });

  // Phase 23 D-06 / D-09: the price-refresh probe MUST filter by
  // `action = 'price_refresh'` so cron runs are isolated from the unfiltered
  // lastAuditAt read. Asserted by inspecting the SQL passed to db.execute.
  // The drizzle sql tag exposes its raw text via queryChunks[i].value[].
  it("issues the lastPriceRefreshAt query with a WHERE action='price_refresh' filter", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ last_at: null }] });

    await getAdminHealthSnapshot();

    const sqlTexts = mockExecute.mock.calls.map((call) => {
      const arg = call[0] as { queryChunks?: Array<{ value?: unknown[] }> };
      const chunks = arg?.queryChunks ?? [];
      return chunks
        .map((chunk) =>
          Array.isArray(chunk?.value)
            ? chunk.value.filter((v): v is string => typeof v === "string").join("")
            : "",
        )
        .join("");
    });

    const combined = sqlTexts.join(" | ");
    expect(combined).toMatch(/action\s*=\s*'price_refresh'/);
    // And the unfiltered lastAuditAt query is still present (separately).
    expect(sqlTexts).toEqual(
      expect.arrayContaining([expect.stringMatching(/FROM admin_audit_log\s*$/)]),
    );
  });
});
