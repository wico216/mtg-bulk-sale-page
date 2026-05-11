import { beforeEach, describe, expect, it, vi } from "vitest";

// Pin the binder filter behavior of getAdminCards (Phase 21 Plan 01 Task 1).
//
// Strategy: spy on the where() invocation by stubbing the chainable select
// builder. drizzle-orm's `eq()` and `and()` produce SQL objects whose internal
// shape is opaque, so we record the where() argument via a closure and assert
// that the conditions array passed into and() (or the standalone eq when only
// one filter exists) targets the binder column.
//
// We mock @/db/client with a select builder that returns deterministic rows
// for both the data query and the count query, and captures the where() value
// for inspection.

// Capture targets — populated by the spied where() calls inside the mock.
const { whereCalls } = vi.hoisted(() => ({
  whereCalls: [] as unknown[],
}));

vi.mock("server-only", () => ({}));

vi.mock("@/db/client", async () => {
  const drizzle = await import("drizzle-orm");
  const { eq, and } = drizzle;
  // Re-export the real eq/and; tests want the actual SQL objects so we can
  // walk their .queryChunks to find the binder column reference.
  return {
    db: {
      select: vi.fn(() => {
        // The data-query chain ends with .offset(); the count chain ends
        // with .where(). For data: select().from(table).where(?).orderBy(?)
        //   .limit(?).offset(?). For count: select(...).from(table).where(?).
        // Both flows resolve to a Promise<row[]>; we stub the terminal call
        // accordingly.
        const builder: Record<string, unknown> = {};
        const chainable = () => builder;
        builder.from = vi.fn(() => builder);
        builder.where = vi.fn((value: unknown) => {
          whereCalls.push(value);
          return builder;
        });
        builder.orderBy = vi.fn(() => builder);
        builder.limit = vi.fn(() => builder);
        builder.offset = vi.fn(() => Promise.resolve([]));
        // Make the count chain Promise-thenable too (count uses .where as
        // the terminal step, so we attach .then directly).
        (builder as { then?: unknown }).then = (
          resolve: (value: unknown) => unknown,
        ) => resolve([{ total: 0 }]);
        return chainable();
      }),
    },
    __test_helpers: { eq, and, whereCalls },
  };
});

import { getAdminCards } from "../queries";
import { cards } from "@/db/schema";

// Walk a SQL-like object and look for any reference to the binder column.
// drizzle-orm's eq() returns a SQL object whose .queryChunks contains the
// referenced column object (not just a name string) — we test by identity
// against `cards.binder`.
function whereTargetsBinder(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const seen = new Set<unknown>();
  function walk(v: unknown): boolean {
    if (!v || typeof v !== "object") return false;
    if (seen.has(v)) return false;
    seen.add(v);
    // Direct match: this IS the binder column object.
    if (v === cards.binder) return true;
    // Walk all enumerable properties.
    for (const key of Object.keys(v)) {
      const child = (v as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (walk(item)) return true;
        }
      } else if (walk(child)) {
        return true;
      }
    }
    return false;
  }
  return walk(value);
}

describe("getAdminCards binder filter (Phase 21 Plan 01 Task 1)", () => {
  beforeEach(() => {
    whereCalls.length = 0;
  });

  it("pushes eq(cards.binder, value) into the conditions array when binder is non-empty", async () => {
    await getAdminCards({ binder: "a02" });
    // Both the data query and the count query call .where() once each.
    // At least one of those where() calls must reference the binder column.
    expect(whereCalls.length).toBeGreaterThan(0);
    expect(whereCalls.some((value) => whereTargetsBinder(value))).toBe(true);
  });

  it("does NOT include a binder predicate when binder is empty string", async () => {
    await getAdminCards({ binder: "" });
    // No call to where() should reference the binder column. (where() may
    // still be called with `undefined` if no other filters apply; that's
    // fine — the assertion is specifically about absence of binder.)
    expect(whereCalls.every((value) => !whereTargetsBinder(value))).toBe(true);
  });

  it("does NOT include a binder predicate when binder is undefined", async () => {
    await getAdminCards({});
    expect(whereCalls.every((value) => !whereTargetsBinder(value))).toBe(true);
  });

  it("composes binder with set + condition + search filters (all AND-ed)", async () => {
    await getAdminCards({
      binder: "a02",
      set: "sld",
      condition: "near_mint",
      search: "lightning",
    });
    expect(whereCalls.length).toBeGreaterThan(0);
    // The composed where() value must reference the binder column.
    expect(whereCalls.some((value) => whereTargetsBinder(value))).toBe(true);
  });
});
