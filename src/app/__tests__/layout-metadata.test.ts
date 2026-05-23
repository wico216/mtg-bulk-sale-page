// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Instrument_Serif: () => ({ variable: "--font-instrument-serif" }),
  Inter: () => ({ variable: "--font-inter" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import { metadata } from "../layout";

describe("root metadata", () => {
  it("points public homepage metadata at wikospellbinder.com", () => {
    expect(metadata.metadataBase?.toString()).toBe("https://wikospellbinder.com/");
    expect(metadata.alternates).toMatchObject({ canonical: "/" });
    expect(metadata.openGraph).toMatchObject({
      url: "/",
      siteName: "Wiko's Spellbook",
      type: "website",
    });
  });
});
