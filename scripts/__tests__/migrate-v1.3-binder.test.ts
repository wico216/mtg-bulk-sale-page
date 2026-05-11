/**
 * Phase 16: Unit tests for the v1.3 schema migration script.
 *
 * Mocks the DB layer at the `db.execute` boundary (no live DB writes). Tests
 * pin the contract for:
 *   - runPreflights (D-04 / Pitfall 4): three pre-flight assertions, exit
 *     conditions, error message wording.
 *   - buildBatchStatements: 11-step ordering exactly per 16-CONTEXT
 *     <specifics>.
 *   - formatSummary: D-14 template structure (line presence).
 *   - main(): --help, --dry-run, and pre-flight rejection paths.
 */

import { describe, it, expect, vi } from "vitest";
import {
  runPreflights,
  buildBatchStatements,
  formatSummary,
  measurePostState,
  main,
  type MigrationDb,
  type PreflightSnapshot,
} from "../migrate-v1.3-binder";

// --- Test doubles -----------------------------------------------------------

interface MockExecuteResponse {
  match: RegExp;
  rows: Array<Record<string, unknown>>;
}

/**
 * Walk a Drizzle `SQL` object's `queryChunks` and extract the literal text.
 * Drizzle represents `sql\`SELECT ...\`` as an array of `StringChunk` plus
 * possibly `Param` / nested `SQL` chunks. We only care about the literal text
 * for matching purposes — params are irrelevant here because the migration is
 * pure DDL+DML with no bound values.
 */
function renderSqlChunks(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  // StringChunk: { value: string | string[] }
  if (typeof input === "object") {
    const chunks = (input as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) {
      return chunks.map(renderSqlChunks).join("");
    }
    const value = (input as { value?: unknown }).value;
    if (Array.isArray(value)) return value.join("");
    if (typeof value === "string") return value;
  }
  return "";
}

/**
 * Build a mock MigrationDb whose `execute(sql)` returns the first matching
 * canned response by rendered SQL string. `batch` is a vi.fn() that resolves
 * to [].
 *
 * Each call records the rendered SQL into `calls.execute` for assertions.
 */
function makeMockDb(responses: MockExecuteResponse[]): {
  db: MigrationDb;
  calls: { execute: string[]; batch: unknown[][] };
} {
  const calls = { execute: [] as string[], batch: [] as unknown[][] };
  const execute = vi.fn(async (input: unknown) => {
    const queryString = renderSqlChunks(input);
    calls.execute.push(queryString);
    const matched = responses.find((r) => r.match.test(queryString));
    if (!matched) {
      // Default empty result so unanticipated queries don't throw at the mock
      // boundary — assertions on calls.execute will fail loudly instead.
      return { rows: [] };
    }
    return { rows: matched.rows };
  });
  const batch = vi.fn(async (statements: unknown[]) => {
    calls.batch.push(statements);
    return [];
  });
  return {
    db: {
      execute: execute as unknown as MigrationDb["execute"],
      batch: batch as unknown as MigrationDb["batch"],
    },
    calls,
  };
}

const CLEAN_RESPONSES: MockExecuteResponse[] = [
  // (a) no -unsorted suffix
  { match: /LIKE '%-unsorted'/i, rows: [] },
  // (b) cards.binder column not present
  { match: /information_schema\.columns/i, rows: [] },
  // (c) order_items distinct cardId count
  { match: /COUNT\(DISTINCT card_id\)/i, rows: [{ distinct_count: 7 }] },
  // side count: cards
  { match: /SELECT COUNT\(\*\)::int AS c FROM cards\b/i, rows: [{ c: 12_749 }] },
  // side count: order_items
  {
    match: /SELECT COUNT\(\*\)::int AS c FROM order_items\b/i,
    rows: [{ c: 47 }],
  },
];

// --- runPreflights ----------------------------------------------------------

describe("runPreflights", () => {
  it("(a) throws non-zero with offending ids when cards.id rows already end in -unsorted (D-04)", async () => {
    const { db } = makeMockDb([
      {
        match: /LIKE '%-unsorted'/i,
        rows: [{ id: "tdc-369-normal-near_mint-unsorted" }],
      },
    ]);
    await expect(runPreflights({ db })).rejects.toThrow(
      /Pre-flight \(a\) FAILED/i,
    );
    await expect(runPreflights({ db })).rejects.toThrow(
      /tdc-369-normal-near_mint-unsorted/,
    );
  });

  it("(b) throws non-zero when cards.binder column already exists in information_schema (D-04)", async () => {
    const { db } = makeMockDb([
      { match: /LIKE '%-unsorted'/i, rows: [] },
      {
        match: /information_schema\.columns/i,
        rows: [{ column_name: "binder" }],
      },
    ]);
    await expect(runPreflights({ db })).rejects.toThrow(
      /Pre-flight \(b\) FAILED/i,
    );
    await expect(runPreflights({ db })).rejects.toThrow(/binder column already exists/i);
  });

  it("(c) returns a snapshot containing orderItemsCardIdDistinctCount used by the post-DML diff", async () => {
    const { db } = makeMockDb(CLEAN_RESPONSES);
    const snapshot = await runPreflights({ db });
    expect(snapshot.orderItemsCardIdDistinctCount).toBe(7);
    expect(snapshot.cardsRowCountBefore).toBe(12_749);
    expect(snapshot.orderItemsRowCountBefore).toBe(47);
    expect(typeof snapshot.capturedAt).toBe("string");
    expect(snapshot.capturedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("(d) returns the same snapshot shape on a clean DB (all preflights green)", async () => {
    const { db } = makeMockDb(CLEAN_RESPONSES);
    const snapshot = await runPreflights({ db });
    const keys = Object.keys(snapshot).sort();
    expect(keys).toEqual(
      [
        "capturedAt",
        "cardsRowCountBefore",
        "orderItemsCardIdDistinctCount",
        "orderItemsRowCountBefore",
      ].sort(),
    );
  });
});

// --- buildBatchStatements ----------------------------------------------------

describe("buildBatchStatements", () => {
  it("returns 11 statements in the exact order documented in 16-CONTEXT <specifics>", () => {
    const { db, calls } = makeMockDb([]);
    const statements = buildBatchStatements({ db });
    expect(statements).toHaveLength(11);

    const expectedOrder: RegExp[] = [
      // 1
      /ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'/i,
      // 2
      /CREATE TYPE finish AS ENUM \('normal','foil','etched'\)/i,
      // 3
      /ALTER TABLE cards ADD COLUMN finish finish/i,
      // 4
      /UPDATE cards SET finish = CASE WHEN foil THEN 'foil'::finish ELSE 'normal'::finish END/i,
      // 5
      /ALTER TABLE cards ALTER COLUMN finish SET NOT NULL/i,
      // 6
      /ALTER TABLE cards DROP COLUMN foil/i,
      // 7
      /ALTER TABLE cards DROP CONSTRAINT cards_pkey/i,
      // 8
      /UPDATE cards SET id =[\s\S]*set_code[\s\S]*collector_number[\s\S]*finish::text[\s\S]*condition[\s\S]*binder/i,
      // 9
      /ALTER TABLE cards ADD CONSTRAINT cards_pkey PRIMARY KEY \(id\)/i,
      // 10
      /ALTER TABLE cards ADD CONSTRAINT cards_quantity_check CHECK \(quantity >= 0\)/i,
      // 11
      /ALTER TABLE order_items ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'/i,
    ];

    expect(calls.execute).toHaveLength(11);
    for (let i = 0; i < expectedOrder.length; i++) {
      expect(
        calls.execute[i],
        `statement ${i + 1} should match ${expectedOrder[i]}`,
      ).toMatch(expectedOrder[i]);
    }
  });

  it("the id-rewrite UPDATE produces exactly 5 segments (D-05)", () => {
    const { db, calls } = makeMockDb([]);
    buildBatchStatements({ db });
    const idRewrite = calls.execute[7];
    // The composite is set_code || '-' || collector_number || '-' || finish::text || '-' || condition || '-' || binder
    // Count the literal '-' join segments — there should be exactly 4 of them
    // (5 fields joined by 4 dashes).
    const dashJoins = (idRewrite.match(/'-'/g) ?? []).length;
    expect(dashJoins).toBe(4);
  });
});

// --- formatSummary ----------------------------------------------------------

describe("formatSummary (D-14 template)", () => {
  function makePostSnapshot(overrides = {}): Parameters<typeof formatSummary>[0] {
    return {
      orderItemsCardIdDistinctCount: 7,
      cardsRowCountBefore: 12_749,
      orderItemsRowCountBefore: 47,
      capturedAt: "2026-05-11T00:00:00.000Z",
      cardsRowCountAfter: 12_749,
      orderItemsRowCountAfter: 47,
      idsWithUnsortedSuffix: 12_749,
      finishCounts: { normal: 11_000, foil: 1_749, etched: 0 },
      quantityCheckPresent: true,
      sampleIds: [
        "tdc-369-normal-near_mint-unsorted",
        "ltr-229-normal-near_mint-unsorted",
        "fin-48-normal-near_mint-unsorted",
        "ltr-432-normal-near_mint-unsorted",
        "mh3-101-foil-lightly_played-unsorted",
      ],
      orderItemsCardIdMismatchBefore: 0,
      orderItemsCardIdMismatchAfter: 0,
      dryRun: false,
      ...overrides,
    };
  }

  it("includes the live-run header line", () => {
    const out = formatSummary(makePostSnapshot());
    expect(out).toMatch(/Migration v1\.3 complete/);
  });

  it("includes the schema-changes block with all 6 documented changes", () => {
    const out = formatSummary(makePostSnapshot());
    expect(out).toMatch(/Schema changes applied:/);
    expect(out).toMatch(/cards: \+binder/);
    expect(out).toMatch(/cards: \+finish/);
    expect(out).toMatch(/cards: -foil/);
    expect(out).toMatch(/cards: \+CHECK/);
    expect(out).toMatch(/cards: id format: 4-segment -> 5-segment/);
    expect(out).toMatch(/order_items: \+binder/);
  });

  it("includes the data-migration block with rowcount + finish counts + id format check", () => {
    const out = formatSummary(makePostSnapshot());
    expect(out).toMatch(/Data migration:/);
    expect(out).toMatch(/cards rows migrated: 12749 -> 12749 \(zero loss\)/);
    expect(out).toMatch(/id format check: 12749\/12749 have 5 segments/);
    expect(out).toMatch(/finish backfill: 11000 normal, 1749 foil, 0 etched/);
    expect(out).toMatch(/order_items: 47 historical rows backfilled/);
    expect(out).toMatch(/order_items\.cardId mismatch: 0 before -> 0 after/);
  });

  it("includes the constraints block with cards_quantity_check status", () => {
    const out = formatSummary(makePostSnapshot());
    expect(out).toMatch(/Constraints:/);
    expect(out).toMatch(/cards_pkey: PRESENT/);
    expect(out).toMatch(/cards_quantity_check: PRESENT/);
  });

  it("flags missing CHECK constraint loudly when not present", () => {
    const out = formatSummary(makePostSnapshot({ quantityCheckPresent: false }));
    expect(out).toMatch(/cards_quantity_check: MISSING/);
  });

  it("includes the sample-ids block (5 ids)", () => {
    const out = formatSummary(makePostSnapshot());
    expect(out).toMatch(/Sample 5 ids:/);
    expect(out).toMatch(/tdc-369-normal-near_mint-unsorted/);
    expect(out).toMatch(/mh3-101-foil-lightly_played-unsorted/);
  });

  it("includes the pre-flights line and the next-step line", () => {
    const out = formatSummary(makePostSnapshot());
    expect(out).toMatch(/Pre-flights honored: ✓/);
    expect(out).toMatch(/Next: deploy v1\.3 application code to Vercel\./);
  });

  it("uses the dry-run banner instead of the success banner when dryRun=true", () => {
    const out = formatSummary(
      makePostSnapshot({
        dryRun: true,
        cardsRowCountAfter: 12_749,
        idsWithUnsortedSuffix: 0,
        finishCounts: { normal: 0, foil: 0, etched: 0 },
        quantityCheckPresent: false,
        sampleIds: [],
      }),
    );
    expect(out).toMatch(/DRY RUN — no DML executed/);
    expect(out).not.toMatch(/✓ Migration v1\.3 complete/);
    expect(out).toMatch(/dry-run: no sample ids/);
  });

  it("flags row-count loss explicitly when cards before != after", () => {
    const out = formatSummary(
      makePostSnapshot({ cardsRowCountAfter: 12_700 }),
    );
    expect(out).toMatch(/12749 -> 12700 \(LOSS DETECTED\)/);
  });
});

// --- measurePostState (dry-run shortcut) ------------------------------------

describe("measurePostState dry-run shortcut", () => {
  it("returns before == after with empty sample list and no DB queries beyond the snapshot", async () => {
    const { db, calls } = makeMockDb([]);
    const pre: PreflightSnapshot = {
      orderItemsCardIdDistinctCount: 7,
      cardsRowCountBefore: 100,
      orderItemsRowCountBefore: 5,
      capturedAt: "2026-05-11T00:00:00.000Z",
    };
    const post = await measurePostState({ db, preSnapshot: pre, dryRun: true });
    expect(post.cardsRowCountAfter).toBe(100);
    expect(post.orderItemsRowCountAfter).toBe(5);
    expect(post.sampleIds).toEqual([]);
    expect(post.dryRun).toBe(true);
    expect(calls.execute).toHaveLength(0);
  });
});

// --- main() integration ------------------------------------------------------

describe("main()", () => {
  it("--help prints usage and returns 0 without touching DB", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await main({ argv: ["--help"], db: makeMockDb([]).db });
    expect(code).toBe(0);
    expect(log).toHaveBeenCalled();
    const printed = log.mock.calls.flat().join("\n");
    expect(printed).toMatch(/Usage: npm run migrate:v1\.3/);
    expect(printed).toMatch(/MANUAL ONLY/);
    log.mockRestore();
  });

  it("rejects unknown flags with a non-zero exit", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await main({
      argv: ["--bogus"],
      db: makeMockDb([]).db,
    });
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join("\n")).toMatch(/Unknown flag: --bogus/);
    err.mockRestore();
  });

  it("--dry-run runs pre-flights, prints the would-be statements, and never calls db.batch", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, calls } = makeMockDb(CLEAN_RESPONSES);
    const code = await main({ argv: ["--dry-run"], db });
    expect(code).toBe(0);
    expect(calls.batch).toHaveLength(0);
    const printed = log.mock.calls.flat().join("\n");
    expect(printed).toMatch(/DRY RUN — no DML executed/);
    expect(printed).toMatch(
      /ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'/,
    );
    expect(printed).toMatch(/CREATE TYPE finish AS ENUM/);
    expect(printed).toMatch(
      /ALTER TABLE order_items ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'/,
    );
    log.mockRestore();
  });

  it("exits non-zero with 'FAIL — zero changes applied' when pre-flight (a) trips", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, calls } = makeMockDb([
      {
        match: /LIKE '%-unsorted'/i,
        rows: [{ id: "lea-1-foil-near_mint-unsorted" }],
      },
    ]);
    const code = await main({ argv: [], db });
    expect(code).toBe(1);
    expect(calls.batch).toHaveLength(0);
    const printed = err.mock.calls.flat().join("\n");
    expect(printed).toMatch(/FAIL — zero changes applied/);
    expect(printed).toMatch(/lea-1-foil-near_mint-unsorted/);
    log.mockRestore();
    err.mockRestore();
  });

  it("live run calls db.batch exactly once with 11 statements then prints the summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const POST_RESPONSES: MockExecuteResponse[] = [
      ...CLEAN_RESPONSES,
      // post-state: cards count after
      {
        match: /SELECT COUNT\(\*\)::int AS c FROM cards\b(?![^]*card_id)/i,
        rows: [{ c: 12_749 }],
      },
      // post-state: order_items count after
      {
        match: /SELECT COUNT\(\*\)::int AS c FROM order_items\b/i,
        rows: [{ c: 47 }],
      },
      // post-state: -unsorted suffix count
      { match: /WHERE id LIKE '%-unsorted'/i, rows: [{ c: 12_749 }] },
      // post-state: finish group-by
      {
        match: /GROUP BY finish/i,
        rows: [
          { f: "normal", c: 11_000 },
          { f: "foil", c: 1_749 },
        ],
      },
      // post-state: pg_constraint
      {
        match: /pg_constraint WHERE conname = 'cards_quantity_check'/i,
        rows: [{ conname: "cards_quantity_check" }],
      },
      // post-state: sample ids
      {
        match: /ORDER BY random\(\) LIMIT 5/i,
        rows: [
          { id: "tdc-369-normal-near_mint-unsorted" },
          { id: "ltr-229-normal-near_mint-unsorted" },
          { id: "fin-48-normal-near_mint-unsorted" },
          { id: "ltr-432-normal-near_mint-unsorted" },
          { id: "mh3-101-foil-lightly_played-unsorted" },
        ],
      },
      // post-state: mismatch count
      {
        match: /LEFT JOIN cards c ON oi\.card_id = c\.id WHERE c\.id IS NULL/i,
        rows: [{ c: 0 }],
      },
    ];
    const { db, calls } = makeMockDb(POST_RESPONSES);
    const code = await main({ argv: [], db });
    expect(code).toBe(0);
    expect(calls.batch).toHaveLength(1);
    expect(calls.batch[0]).toHaveLength(11);
    const printed = log.mock.calls.flat().join("\n");
    expect(printed).toMatch(/Migration v1\.3 complete/);
    expect(printed).toMatch(/finish backfill: 11000 normal, 1749 foil, 0 etched/);
    expect(printed).toMatch(/cards_quantity_check: PRESENT/);
    log.mockRestore();
  });
});
