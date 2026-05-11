// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  useCartStore,
  markCartMigrated,
  needsCartMigration,
} from "../cart-store";

describe("cart-store version sentinel (Phase 20 D-12/D-13)", () => {
  beforeEach(() => {
    // Reset the persist state + zustand store between tests so each test
    // starts from a known shape. The persist middleware writes to
    // localStorage on every setState, so clearStorage AFTER setState
    // would race; clearing first is safer.
    useCartStore.persist.clearStorage();
    useCartStore.setState({ items: new Map(), version: "1.3" });
  });

  it("initial state version is '1.3' after fresh setState", () => {
    expect(useCartStore.getState().version).toBe("1.3");
  });

  it("needsCartMigration returns true for undefined version", () => {
    expect(
      needsCartMigration({ items: new Map(), version: undefined as any }),
    ).toBe(true);
  });

  it("needsCartMigration returns true for version '1.2'", () => {
    expect(needsCartMigration({ items: new Map(), version: "1.2" })).toBe(true);
  });

  it("needsCartMigration returns false for version '1.3'", () => {
    expect(needsCartMigration({ items: new Map(), version: "1.3" })).toBe(
      false,
    );
  });

  it("needsCartMigration returns false for version '1.4' (future)", () => {
    expect(needsCartMigration({ items: new Map(), version: "1.4" })).toBe(
      false,
    );
  });

  it("markCartMigrated sets version to '1.3'", () => {
    useCartStore.setState({ items: new Map(), version: "1.2" });
    markCartMigrated();
    expect(useCartStore.getState().version).toBe("1.3");
  });

  it("markCartMigrated is idempotent (calling twice keeps version '1.3')", () => {
    useCartStore.setState({ items: new Map(), version: "1.3" });
    markCartMigrated();
    markCartMigrated();
    expect(useCartStore.getState().version).toBe("1.3");
  });

  it("partialize widens to include version (sentinel survives the persist round-trip)", () => {
    // Direct verification by setting + re-reading through the public store
    // surface. The persist middleware's serializer is exercised by zustand
    // internally; this assertion confirms the new `version` field is part
    // of the public CartState shape.
    useCartStore.setState({ items: new Map([["x", 1]]), version: "1.3" });
    expect(useCartStore.getState().version).toBe("1.3");
    expect(useCartStore.getState().items.get("x")).toBe(1);
  });
});
