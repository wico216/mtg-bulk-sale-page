/**
 * Phase 23 Plan 23-01 Task 2 — runPriceRefresh shared service.
 *
 * Default-run: this test is NOT env-gated and NOT skipped. It runs as
 * part of the standard `npm test` invocation. Tier-1 only per D-01 / D-11
 * (the v1.3.5 retrospective lesson — env-gated tests silently skip in CI).
 * Live-DB integration is intentionally out of scope here; advisory-lock
 * contention is verified by operator UAT against the deployed cron.
 *
 * Coverage matrix (eight cases, all default-run, all assert against mocks):
 *   1. Happy-path: fetches with deduped scryfallIds
 *   2. Rows without a scryfallId increment `skipped`
 *   3. Scryfall `not_found` (id absent from response Map) preserves price
 *   4. Scryfall `prices.usd === null` writes priceCents=null (explicit overwrite)
 *   5. Two rows, same scryfallId, different finish -> different priceCents
 *   6. UPDATE statements join on cards.id, never scryfall_id
 *   7. Audit metadata is exactly { trigger, updated, unchanged, failed, skipped, durationMs }
 *   8. Advisory lock returns acquired=false -> throws PriceRefreshLockedError
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScryfallCard } from "@/lib/types";

// ----- Hoisted mock state ---------------------------------------------------
// `vi.hoisted` returns refs we can both attach to vi.mock factories AND read
// from inside individual it() blocks for per-test setup. The `state` object
// is shared by reference across all mock factories so per-test mutations
// (e.g. flipping `lockAcquired` to false) take effect immediately.
//
// Phase 23 REVIEW CR-01: the single-flight primitive was migrated from a
// session-scoped `pg_try_advisory_lock` to a row-based lease in the
// `price_refresh_lock` table. The mock recognises the new acquire/release
// SQL by string-match below; `state.lockAcquired = false` simulates the
// "another runner is in flight" branch (INSERT ... ON CONFLICT ... RETURNING
// id produced zero rows because the WHERE filter on stale-lease age
// rejected the upsert).
const {
  state,
  mockSelectRows,
  mockExecute,
  mockExecuteCalls,
  mockFetchCards,
  mockCreateAudit,
  mockLogEvent,
} = vi.hoisted(() => {
  // Phase 23 REVIEW WR-03: `updateRowCount` (when not null) is the value
  // the mock returns as `rowCount` on every UPDATE statement. The
  // production neon-http driver populates rowCount via FullQueryResults
  // (see @neondatabase/serverless index.d.ts:277); leaving it null here
  // exercises the `chunk.length` fallback path in the production code.
  const state: { lockAcquired: boolean; updateRowCount: number | null } = {
    lockAcquired: true,
    updateRowCount: null,
  };
  const executeCalls: Array<{ sqlText: string }> = [];
  return {
    state,
    mockSelectRows: vi.fn<() => unknown[]>(() => []),
    mockExecute: vi.fn(),
    mockExecuteCalls: executeCalls,
    mockFetchCards: vi.fn(),
    mockCreateAudit: vi.fn(),
    mockLogEvent: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/db/client", () => {
  // Helper to flatten a Drizzle SQL fragment to a string. Walks queryChunks
  // recursively, dereferences StringChunk (`value: string[]`) and Param
  // (`value: unknown`) so the captured text contains BOTH the static SQL
  // skeleton AND the parametrized id / cents values. Used by Cases 5/6 to
  // assert per-finish prices and the cards.id join key.
  const sqlToString = (q: unknown): string => {
    if (q === null || q === undefined) return "";
    if (typeof q === "string") return q;
    if (typeof q !== "object") return String(q);
    const obj = q as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) {
      return (obj.queryChunks as unknown[]).map(sqlToString).join("");
    }
    if ("value" in obj) {
      const v = obj.value;
      if (Array.isArray(v)) return v.join(" ");
      return sqlToString(v);
    }
    return "";
  };

  const select = vi.fn(() => ({
    from: vi.fn(async () => mockSelectRows()),
  }));

  const execute = vi.fn(async (query: unknown) => {
    const text = sqlToString(query);
    mockExecuteCalls.push({ sqlText: text });
    mockExecute(text);
    // Phase 23 REVIEW CR-01: row-based lease acquire/release.
    //   - INSERT INTO price_refresh_lock ... RETURNING id is the acquire;
    //     `state.lockAcquired` controls whether the upsert "took" (one row)
    //     or was blocked by the fresh-lease WHERE filter (zero rows).
    //   - CREATE TABLE IF NOT EXISTS / DELETE FROM are idempotent no-op
    //     paths that return zero rows.
    if (
      text.includes("INSERT INTO price_refresh_lock") &&
      text.includes("RETURNING id")
    ) {
      return state.lockAcquired ? { rows: [{ id: 1 }] } : { rows: [] };
    }
    // REVIEW WR-03: return rowCount on UPDATE statements when the test
    // sets state.updateRowCount; otherwise return undefined so the
    // production code exercises the `chunk.length` fallback.
    if (text.toUpperCase().includes("UPDATE CARDS")) {
      return state.updateRowCount === null
        ? { rows: [] }
        : { rows: [], rowCount: state.updateRowCount };
    }
    return { rows: [] };
  });

  return {
    db: { select, execute },
  };
});

vi.mock("@/lib/scryfall", () => ({
  fetchCardsByScryfallIds: (...args: unknown[]) => mockFetchCards(...args),
}));

vi.mock("@/db/queries", () => ({
  createAdminAuditEntry: (...args: unknown[]) => mockCreateAudit(...args),
}));

vi.mock("@/lib/logger", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));

// Import AFTER mocks so the module's top-level imports resolve to mocks.
const { runPriceRefresh, PriceRefreshLockedError } = await import(
  "@/lib/price-refresh"
);

// ---- Helpers ---------------------------------------------------------------
function makeRow(
  overrides: Partial<{
    id: string;
    scryfallId: string | null;
    finish: "normal" | "foil" | "etched";
    currentPriceCents: number | null;
  }>,
) {
  // NOTE: scryfallId/currentPriceCents are intentionally `in`-checked rather
  // than `??`-defaulted so the caller can pass an explicit `null` to test
  // the "no scryfallId" / "no current price" branches.
  return {
    id: overrides.id ?? "lea-232-normal-near_mint-a01",
    scryfallId: "scryfallId" in overrides ? overrides.scryfallId! : "sf-001",
    finish: overrides.finish ?? "normal",
    currentPriceCents:
      "currentPriceCents" in overrides ? overrides.currentPriceCents! : 100,
  };
}

function makeScryfallCard(
  prices: Partial<ScryfallCard["prices"]>,
): ScryfallCard {
  return {
    name: "Test Card",
    set: "lea",
    set_name: "Alpha",
    collector_number: "232",
    rarity: "rare",
    foil: false,
    prices: {
      usd: prices.usd ?? null,
      usd_foil: prices.usd_foil ?? null,
      usd_etched: prices.usd_etched ?? null,
    },
    image_uris: {
      small: "https://example.com/small.png",
      normal: "https://example.com/normal.png",
      large: "https://example.com/large.png",
      png: "https://example.com/card.png",
      art_crop: "https://example.com/art.png",
      border_crop: "https://example.com/border.png",
    },
    color_identity: [],
  } as unknown as ScryfallCard;
}

beforeEach(() => {
  mockSelectRows.mockReset();
  mockExecute.mockClear();
  mockExecuteCalls.length = 0;
  mockFetchCards.mockReset();
  mockCreateAudit.mockReset();
  mockCreateAudit.mockResolvedValue({});
  mockLogEvent.mockReset();
  state.lockAcquired = true;
  state.updateRowCount = null;
});

describe("runPriceRefresh", () => {
  it("Case 1: fetches Scryfall with deduped scryfallIds (happy path)", async () => {
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-1", scryfallId: "sf-A" }),
      makeRow({ id: "row-2", scryfallId: "sf-A" }), // duplicate scryfallId
      makeRow({ id: "row-3", scryfallId: "sf-B" }),
    ]);
    mockFetchCards.mockResolvedValue(
      new Map([
        ["sf-A", makeScryfallCard({ usd: "1.50" })],
        ["sf-B", makeScryfallCard({ usd: "2.00" })],
      ]),
    );

    await runPriceRefresh({ trigger: "cron" });

    expect(mockFetchCards).toHaveBeenCalledTimes(1);
    const callArg = mockFetchCards.mock.calls[0][0] as string[];
    expect([...callArg].sort()).toEqual(["sf-A", "sf-B"]); // deduped
  });

  it("Case 2: rows with null scryfallId increment skipped and are not requested from Scryfall", async () => {
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-no-sf", scryfallId: null }),
      makeRow({ id: "row-with-sf", scryfallId: "sf-X" }),
    ]);
    mockFetchCards.mockResolvedValue(
      new Map([["sf-X", makeScryfallCard({ usd: "1.25" })]]),
    );

    const summary = await runPriceRefresh({ trigger: "cron" });

    expect(summary.skipped).toBe(1);
    const callArg = mockFetchCards.mock.calls[0][0] as string[];
    expect(callArg).toEqual(["sf-X"]);
    expect(callArg).not.toContain(null);
  });

  it("Case 3: Scryfall not_found preserves existing price (failed++) and never issues an UPDATE for that row", async () => {
    mockSelectRows.mockReturnValue([
      makeRow({
        id: "row-not-found",
        scryfallId: "sf-MISSING",
        currentPriceCents: 999,
      }),
    ]);
    // Empty Map — Scryfall returned not_found for sf-MISSING.
    mockFetchCards.mockResolvedValue(new Map());

    const summary = await runPriceRefresh({ trigger: "cron" });

    expect(summary.failed).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.unchanged).toBe(0);
    // No UPDATE statement was issued for row-not-found. The only execute
    // calls were the advisory-lock acquire.
    const updateCalls = mockExecuteCalls.filter((c) =>
      c.sqlText.toUpperCase().includes("UPDATE CARDS"),
    );
    expect(updateCalls).toHaveLength(0);
    // Structured logger captured per-card detail (D-04: failure detail flows
    // through the logger, not audit metadata).
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "price_refresh.not_found",
        metadata: expect.objectContaining({
          cardId: "row-not-found",
          scryfallId: "sf-MISSING",
        }),
      }),
    );
  });

  it("Case 4: Scryfall prices.usd === null writes priceCents=null (legitimate explicit overwrite)", async () => {
    mockSelectRows.mockReturnValue([
      makeRow({
        id: "row-null-price",
        scryfallId: "sf-NULL",
        currentPriceCents: 500,
      }),
    ]);
    mockFetchCards.mockResolvedValue(
      new Map([["sf-NULL", makeScryfallCard({ usd: null })]]),
    );

    const summary = await runPriceRefresh({ trigger: "cron" });

    expect(summary.updated).toBe(1);
    // UPDATE statement was issued — find it.
    const updateCalls = mockExecuteCalls.filter((c) =>
      c.sqlText.toUpperCase().includes("UPDATE CARDS"),
    );
    expect(updateCalls).toHaveLength(1);
  });

  it("Case 5: two rows with same scryfallId but different finish receive DIFFERENT priceCents (per-row finish ladder)", async () => {
    mockSelectRows.mockReturnValue([
      makeRow({
        id: "row-normal",
        scryfallId: "sf-MULTI",
        finish: "normal",
        currentPriceCents: 0,
      }),
      makeRow({
        id: "row-etched",
        scryfallId: "sf-MULTI",
        finish: "etched",
        currentPriceCents: 0,
      }),
    ]);
    mockFetchCards.mockResolvedValue(
      new Map([
        [
          "sf-MULTI",
          makeScryfallCard({
            usd: "1.00", // normal -> 100
            usd_foil: "5.00",
            usd_etched: "16.05", // etched -> 1605
          }),
        ],
      ]),
    );

    const summary = await runPriceRefresh({ trigger: "cron" });

    expect(summary.updated).toBe(2);
    // The captured UPDATE SQL fragment carries both id literals AND both
    // cents values. Drizzle parametrizes them — for our string-based capture
    // they show up via the chunk fragment values. Assert both ids are
    // present in the captured SQL, and both prices.
    const updateText = mockExecuteCalls
      .filter((c) => c.sqlText.toUpperCase().includes("UPDATE CARDS"))
      .map((c) => c.sqlText)
      .join("\n");
    expect(updateText).toContain("row-normal");
    expect(updateText).toContain("row-etched");
    expect(updateText).toContain("100"); // normal cents
    expect(updateText).toContain("1605"); // etched cents
  });

  it("Case 6: UPDATE SQL joins on cards.id and never references scryfall_id", async () => {
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-1", scryfallId: "sf-A", currentPriceCents: 0 }),
    ]);
    mockFetchCards.mockResolvedValue(
      new Map([["sf-A", makeScryfallCard({ usd: "1.00" })]]),
    );

    await runPriceRefresh({ trigger: "cron" });

    const updateText = mockExecuteCalls
      .filter((c) => c.sqlText.toUpperCase().includes("UPDATE CARDS"))
      .map((c) => c.sqlText)
      .join("\n");
    expect(updateText).toMatch(/WHERE\s+cards\.id\s*=\s*changed\.id/);
    // D-09: UPDATE joins by the 5-segment card id. scryfall_id may be carried
    // into the Price Movers snapshot payload, but it must never be the UPDATE key.
    expect(updateText).not.toMatch(/WHERE\s+cards\.scryfall_id/i);
  });

  it("Case 7: audit metadata is exactly { trigger, updated, unchanged, failed, skipped, durationMs }", async () => {
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-1", scryfallId: "sf-A", currentPriceCents: 100 }),
      makeRow({ id: "row-2", scryfallId: null }),
    ]);
    mockFetchCards.mockResolvedValue(
      new Map([["sf-A", makeScryfallCard({ usd: "1.00" })]]),
    );

    await runPriceRefresh({ trigger: "manual", actorEmail: "ops@example.com" });

    expect(mockCreateAudit).toHaveBeenCalledTimes(1);
    const auditInput = mockCreateAudit.mock.calls[0][0];
    expect(auditInput).toMatchObject({
      action: "price_refresh",
      actorEmail: "ops@example.com",
      targetType: "inventory",
      targetId: null,
    });
    const metadataKeys = Object.keys(auditInput.metadata).sort();
    expect(metadataKeys).toEqual([
      "durationMs",
      "failed",
      "skipped",
      "trigger",
      "unchanged",
      "updated",
    ]);
    // No forbidden keys
    expect(auditInput.metadata).not.toHaveProperty("failedSample");
    expect(auditInput.metadata).not.toHaveProperty("errors");
    expect(auditInput.metadata).not.toHaveProperty("notFoundIds");
  });

  it("Case 8: lease acquire returns zero rows -> throws PriceRefreshLockedError; Scryfall is never called", async () => {
    // REVIEW CR-01: single-flight is now a row-based lease in
    // price_refresh_lock. When INSERT ... ON CONFLICT DO UPDATE WHERE
    // acquired_at < (NOW() - INTERVAL '10 minutes') RETURNING id produces
    // zero rows (the existing lease is still fresh), the helper throws
    // PriceRefreshLockedError BEFORE any of the refresh work (Scryfall
    // call, classification loop, UPDATEs, audit row) runs.
    state.lockAcquired = false;
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-1", scryfallId: "sf-A" }),
    ]);

    await expect(runPriceRefresh({ trigger: "cron" })).rejects.toBeInstanceOf(
      PriceRefreshLockedError,
    );
    expect(mockFetchCards).not.toHaveBeenCalled();
    expect(mockCreateAudit).not.toHaveBeenCalled();
  });

  it("Case 9 (REVIEW WR-02): Scryfall failure mid-refresh STILL writes a partial-summary audit row, then re-throws", async () => {
    // Two rows go through the not_found preserve-price branch BEFORE the
    // Scryfall call resolves. Wait — actually fetchCards is called once
    // with all unique ids; we'd need it to throw to interrupt the refresh.
    // Set up: rows with scryfallIds + Scryfall fetch rejects. The catch
    // block must still call createAdminAuditEntry with the locked-scalar
    // metadata before re-throwing the original error.
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-skip", scryfallId: null }),
      makeRow({ id: "row-1", scryfallId: "sf-A" }),
    ]);
    const scryfallErr = new Error("Scryfall 503");
    mockFetchCards.mockRejectedValue(scryfallErr);

    await expect(
      runPriceRefresh({ trigger: "cron" }),
    ).rejects.toBe(scryfallErr);

    // Audit was still written -- this is the WR-02 invariant.
    expect(mockCreateAudit).toHaveBeenCalledTimes(1);
    const auditInput = mockCreateAudit.mock.calls[0][0];
    expect(auditInput.action).toBe("price_refresh");
    // Metadata still locked to the D-04 six-key shape; counts reflect
    // whatever was accumulated before the throw (skipped was incremented
    // for the null-scryfallId row, the rest are still zero).
    const metadataKeys = Object.keys(auditInput.metadata).sort();
    expect(metadataKeys).toEqual([
      "durationMs",
      "failed",
      "skipped",
      "trigger",
      "unchanged",
      "updated",
    ]);
    // No keys were added to leak the error message into audit metadata.
    expect(auditInput.metadata).not.toHaveProperty("error");
    expect(auditInput.metadata).not.toHaveProperty("errorMessage");
  });

  it("Case 10 (REVIEW WR-02): lease release runs in finally on BOTH success and failure paths", async () => {
    // Success path first: DELETE FROM price_refresh_lock must appear in
    // the captured SQL after a successful refresh.
    mockSelectRows.mockReturnValue([]);
    mockFetchCards.mockResolvedValue(new Map());
    await runPriceRefresh({ trigger: "cron" });
    const successReleaseCalls = mockExecuteCalls.filter((c) =>
      c.sqlText.toUpperCase().includes("DELETE FROM PRICE_REFRESH_LOCK"),
    );
    expect(successReleaseCalls.length).toBeGreaterThanOrEqual(1);

    // Reset and exercise the failure path. The release MUST still run
    // even though the refresh body threw.
    mockExecuteCalls.length = 0;
    mockCreateAudit.mockReset();
    mockCreateAudit.mockResolvedValue({});
    mockFetchCards.mockReset();
    mockFetchCards.mockRejectedValue(new Error("scryfall down"));
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-1", scryfallId: "sf-A" }),
    ]);

    await expect(runPriceRefresh({ trigger: "cron" })).rejects.toThrow(
      /scryfall down/,
    );
    const failureReleaseCalls = mockExecuteCalls.filter((c) =>
      c.sqlText.toUpperCase().includes("DELETE FROM PRICE_REFRESH_LOCK"),
    );
    expect(failureReleaseCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("Case 11 (REVIEW WR-03): summary.updated reflects driver rowCount, not classification-time intent", async () => {
    // Two rows are classified as "would update" (priceCents differs from
    // currentPriceCents). The production code now reads each UPDATE's
    // rowCount instead of incrementing at classification time. We
    // simulate a scenario where the DB reports FEWER rows affected than
    // the classification expected (e.g. someone deleted a row between
    // SELECT and UPDATE, or the UPDATE chunk hit a row that had been
    // concurrently re-priced to the same value). The audit `updated`
    // must reflect what the DB actually did, not what we wanted.
    state.updateRowCount = 1; // driver says 1 row affected per UPDATE call
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-1", scryfallId: "sf-A", currentPriceCents: 0 }),
      makeRow({ id: "row-2", scryfallId: "sf-B", currentPriceCents: 0 }),
    ]);
    mockFetchCards.mockResolvedValue(
      new Map([
        ["sf-A", makeScryfallCard({ usd: "1.00" })],
        ["sf-B", makeScryfallCard({ usd: "2.00" })],
      ]),
    );

    const summary = await runPriceRefresh({ trigger: "cron" });

    // Classification intended 2 updates → one chunk → mock returns
    // rowCount=1 → summary.updated should be 1, not 2.
    expect(summary.updated).toBe(1);
    // Audit row carries the actual count too.
    const auditInput = mockCreateAudit.mock.calls[0][0];
    expect(auditInput.metadata.updated).toBe(1);
    expect(auditInput.targetCount).toBe(1);
  });

  it("Case 12: changed rows are snapshotted for the Admin Price Movers report", async () => {
    mockSelectRows.mockReturnValue([
      makeRow({ id: "row-up", scryfallId: "sf-A", currentPriceCents: 100 }),
      makeRow({ id: "row-same", scryfallId: "sf-B", currentPriceCents: 250 }),
    ]);
    mockFetchCards.mockResolvedValue(
      new Map([
        ["sf-A", makeScryfallCard({ usd: "2.50" })],
        ["sf-B", makeScryfallCard({ usd: "2.50" })],
      ]),
    );

    const summary = await runPriceRefresh({
      trigger: "manual",
      actorEmail: "admin@example.com",
    });

    expect(summary.updated).toBe(1);
    const snapshotSql = mockExecuteCalls
      .filter((c) => c.sqlText.includes("card_price_snapshots"))
      .map((c) => c.sqlText)
      .join("\n");
    expect(snapshotSql).toContain("CREATE TABLE IF NOT EXISTS card_price_snapshots");
    expect(snapshotSql).toContain("INSERT INTO card_price_snapshots");
    expect(snapshotSql).toContain("row-up");
    expect(snapshotSql).toContain("sf-A");
    expect(snapshotSql).toContain("100");
    expect(snapshotSql).toContain("250");
    expect(snapshotSql).toContain("manual");
    expect(snapshotSql).toContain("admin@example.com");
    expect(snapshotSql).not.toContain("row-same");
  });
});
