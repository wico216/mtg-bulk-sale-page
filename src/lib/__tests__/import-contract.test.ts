import { describe, it, expect } from "vitest";
import type {
  BinderSummary,
  ImportBindersMessage,
  ImportStreamMessage,
  ScopedImportAuditMetadata,
  CommitRequest,
} from "@/lib/import-contract";

/**
 * Phase 19 Task 1 — compile-time pin tests.
 *
 * These tests do not exercise runtime behavior; their value is that any
 * structural drift in the new wire shapes will surface as a `tsc --noEmit`
 * failure when this file is type-checked alongside the rest of the codebase.
 *
 * Two pinned literals (per Plan 19-01 Task 1):
 *   1. A `BinderSummary` literal with all four fields populated.
 *   2. A `ScopedImportAuditMetadata` literal where
 *      `scopedReplaceCounts.deletedFromUnselected` is the literal `0`.
 *
 * A third pin (per Task 7 audit-metadata size pin) asserts a worst-case
 * `ScopedImportAuditMetadata` serializes to under 4096 bytes.
 */

describe("import-contract Phase 19 type pins", () => {
  it("BinderSummary literal compiles with all four fields", () => {
    const sample: BinderSummary = {
      name: "a02",
      rowCount: 3576,
      sampleNames: ["Lightning Bolt", "Counterspell", "Brainstorm"],
      isNew: true,
    };
    expect(sample.name).toBe("a02");
    expect(sample.isNew).toBe(true);
  });

  it("ImportBindersMessage is part of ImportStreamMessage union and discriminates by type", () => {
    const msg: ImportBindersMessage = {
      type: "binders",
      binders: [
        {
          name: "a02",
          rowCount: 1,
          sampleNames: ["Lightning Bolt"],
          isNew: false,
        },
      ],
    };
    const u: ImportStreamMessage = msg;
    if (u.type === "binders") {
      expect(u.binders.length).toBe(1);
    } else {
      throw new Error("type discrimination failed");
    }
  });

  it("ScopedImportAuditMetadata literal compiles with deletedFromUnselected: 0 (literal type)", () => {
    const sample: ScopedImportAuditMetadata = {
      selectedBinders: ["a02", "a05"],
      totalBindersInExport: 3,
      scopedReplaceCounts: {
        before: { a02: 12, a05: 7 },
        after: { a02: 12, a05: 7 },
        deletedFromUnselected: 0, // Must be the literal 0 — type narrows to `0`.
      },
      totalCardsAfterImport: 100,
      newBindersInExport: ["a05"],
      missingBindersFromExport: ["a07"],
    };
    expect(sample.scopedReplaceCounts.deletedFromUnselected).toBe(0);
  });

  it("CommitRequest accepts optional selectedBinders + knownBinders", () => {
    const reqMinimal: CommitRequest = {
      cards: [],
    };
    const reqExtended: CommitRequest = {
      cards: [],
      selectedBinders: ["a02"],
      knownBinders: ["a02", "a05"],
    };
    expect(reqMinimal.selectedBinders).toBeUndefined();
    expect(reqExtended.selectedBinders).toEqual(["a02"]);
    expect(reqExtended.knownBinders).toEqual(["a02", "a05"]);
  });

  it("worst-case ScopedImportAuditMetadata serializes to < 4096 bytes (D-17 size pin)", () => {
    // Realistic worst case: 50 selected binders (the cap from
    // MAX_AUDIT_ARRAY_LENGTH), each with a typical operator-named label
    // (~12 chars; representative of `lord_of_rings`, `commander_24`, `a07`,
    // etc.). The 50-entry cap is enforced by the helper before
    // sanitizeAdminAuditMetadata runs; if serialization ever exceeded the
    // 4KB MAX_AUDIT_METADATA_BYTES cap the runtime sanitizer would fall
    // back to `{ truncated: true, summary: ... }`, losing the structured
    // fields. This pin guards that regression.
    const operatorName = (i: number) => `binder_${String(i).padStart(4, "0")}`;
    const selected = Array.from({ length: 50 }, (_, i) => operatorName(i));
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (const b of selected) {
      before[b] = 9999;
      after[b] = 9999;
    }
    const meta: ScopedImportAuditMetadata = {
      selectedBinders: selected,
      totalBindersInExport: 200,
      scopedReplaceCounts: {
        before,
        after,
        deletedFromUnselected: 0,
      },
      totalCardsAfterImport: 999_999,
      newBindersInExport: Array.from({ length: 25 }, (_, i) => operatorName(i)),
      missingBindersFromExport: Array.from({ length: 25 }, (_, i) => operatorName(i + 25)),
    };
    const serialized = JSON.stringify(meta);
    expect(serialized.length).toBeLessThan(4096);
  });
});
