import { describe, expect, it, vi } from "vitest";
import { generateOrderRef } from "../order";

describe("generateOrderRef", () => {
  it("generates compact unique order references within the same second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T02:03:04.000Z"));

    try {
      const refs = Array.from({ length: 100 }, () => generateOrderRef());
      expect(new Set(refs).size).toBe(100);
      for (const ref of refs) {
        expect(ref).toMatch(/^ORD-20260427-020304-[A-Z0-9]{4,}$/);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
