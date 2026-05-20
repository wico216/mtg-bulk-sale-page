// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  useBinderImportStore,
  BINDER_IMPORT_STORAGE_KEY,
  BINDER_IMPORT_STORE_VERSION,
} from "@/lib/store/binder-import-store";

/**
 * Phase 19 Plan 02 Task 1 — useBinderImportStore unit coverage.
 *
 * Uses happy-dom for a real localStorage so the persist middleware doesn't
 * need to be mocked.
 */

beforeEach(() => {
  localStorage.clear();
  // Reset the store to its initial shape; the persist middleware writes
  // to localStorage on every set() so clearing localStorage isn't enough.
  useBinderImportStore.setState({ lastSelection: {}, lastUsedAt: null });
});

describe("useBinderImportStore", () => {
  it("starts with empty selection and null lastUsedAt", () => {
    const state = useBinderImportStore.getState();
    expect(state.lastSelection).toEqual({});
    expect(state.lastUsedAt).toBeNull();
  });

  it("setLastSelection replaces the map", () => {
    useBinderImportStore.getState().setLastSelection({ a02: true, a05: false });
    expect(useBinderImportStore.getState().lastSelection).toEqual({
      a02: true,
      a05: false,
    });
  });

  it("recordCommit sets lastSelection AND lastUsedAt to a fresh ISO timestamp", () => {
    const before = Date.now();
    useBinderImportStore.getState().recordCommit({ a07: true });
    const after = Date.now();
    const state = useBinderImportStore.getState();
    expect(state.lastSelection).toEqual({ a07: true });
    expect(state.lastUsedAt).not.toBeNull();
    const ts = Date.parse(state.lastUsedAt!);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("clearSelection resets both fields", () => {
    useBinderImportStore.getState().recordCommit({ a07: true });
    useBinderImportStore.getState().clearSelection();
    const state = useBinderImportStore.getState();
    expect(state.lastSelection).toEqual({});
    expect(state.lastUsedAt).toBeNull();
  });

  // Phase 23 / v1.4 D-05: the Phase 19 D-08/D-09/D-10 `defaultCheckedFor`
  // memory getter is REMOVED. The picker now opens UNCHECKED every session.
  // The three test cases that exercised the removed getter (D-08 unsorted
  // override, isNew fallback, lastSelection-over-isNew) have been deleted.
  // Reintroduction is guarded at the parent level by a `@ts-expect-error`
  // type-level assertion in import-client.test.tsx (Plan 23-02 Task 3).

  it("knownBinderNames returns sorted Object.keys", () => {
    useBinderImportStore.getState().setLastSelection({
      a05: false,
      a02: true,
      a07: true,
    });
    expect(useBinderImportStore.getState().knownBinderNames()).toEqual([
      "a02",
      "a05",
      "a07",
    ]);
  });

  it("persist key matches BINDER_IMPORT_STORAGE_KEY constant", () => {
    expect(BINDER_IMPORT_STORAGE_KEY).toBe("viki-binder-import-selection");
    expect(BINDER_IMPORT_STORE_VERSION).toBe(1);
    // After a setLastSelection, localStorage should have an entry under the key.
    useBinderImportStore.getState().setLastSelection({ a02: true });
    const stored = localStorage.getItem(BINDER_IMPORT_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(BINDER_IMPORT_STORE_VERSION);
    expect(parsed.state.lastSelection).toEqual({ a02: true });
  });
});
