import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {},
}));

import {
  hashWBinderShareToken,
  isWBinderShareLinkActive,
  normalizeAllowedWBinders,
  normalizeShareLabel,
  parseShareExpiresAt,
} from "../w-binder-share-links";
import type { WBinderShareLink } from "@/lib/w-binder-share-types";

function shareLink(overrides: Partial<WBinderShareLink> = {}): WBinderShareLink {
  return {
    id: 1,
    label: "Local pod",
    scope: "w_binders",
    allowedBinders: null,
    createdByEmail: "admin@example.com",
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    useCount: 0,
    createdAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("w-binder share link helpers", () => {
  it("hashes raw tokens with SHA-256 and never returns the raw token", () => {
    const token = "secret-token-value";
    const hash = hashWBinderShareToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashWBinderShareToken(token)).toBe(hash);
  });

  it("normalizes labels and rejects empty labels", () => {
    expect(normalizeShareLabel("  Leslie   preview  ")).toBe("Leslie preview");
    expect(() => normalizeShareLabel("   ")).toThrow(/label is required/i);
  });

  it("normalizes an allow-list to private W binders only", () => {
    expect(normalizeAllowedWBinders([" W01 ", "w02", "W01"])).toEqual([
      "w01",
      "w02",
    ]);
    expect(normalizeAllowedWBinders([])).toBeNull();
    expect(normalizeAllowedWBinders(undefined)).toBeNull();
    expect(() => normalizeAllowedWBinders(["a01"])).toThrow(/private W binders/i);
  });

  it("accepts future expirations and rejects past expirations", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");

    expect(parseShareExpiresAt("2026-06-13T12:00:00.000Z", now)?.toISOString()).toBe(
      "2026-06-13T12:00:00.000Z",
    );
    expect(parseShareExpiresAt(null, now)).toBeNull();
    expect(() => parseShareExpiresAt("2026-06-12T11:59:59.000Z", now)).toThrow(
      /future/i,
    );
  });

  it("treats revoked and expired links as inactive", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");

    expect(isWBinderShareLinkActive(shareLink(), now)).toBe(true);
    expect(
      isWBinderShareLinkActive(
        shareLink({ revokedAt: "2026-06-12T11:00:00.000Z" }),
        now,
      ),
    ).toBe(false);
    expect(
      isWBinderShareLinkActive(
        shareLink({ expiresAt: "2026-06-12T11:59:59.000Z" }),
        now,
      ),
    ).toBe(false);
  });
});
