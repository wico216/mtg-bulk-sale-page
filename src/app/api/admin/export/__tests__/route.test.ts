import { vi, describe, it, expect, beforeEach } from "vitest";

// Use vi.hoisted() pattern for mock variables (established in Phase 8)
const { mockRequireAdmin, mockGetAllCardsForExport } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetAllCardsForExport: vi.fn(),
}));

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock auth module
vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));

// Mock query functions
vi.mock("@/db/queries", () => ({
  getAllCardsForExport: mockGetAllCardsForExport,
}));

import { GET } from "../route";

// Admin session fixture
const adminSession = {
  user: { email: "admin@example.com", name: "Admin User" },
};

// Test card rows (raw DB rows, prices in cents). Phase 17 D-08: the export
// route renders the 3-value finish enum literal directly under a 'Finish'
// column header (the Phase 16 transitional 2-value 'Foil' header coercion
// has been removed).
const testRows = [
  {
    id: "sld-123-normal-near_mint-unsorted",
    name: "Avacyn, Angel of Hope",
    setCode: "sld",
    setName: "Secret Lair Drop",
    collectorNumber: "123",
    price: 1299,
    condition: "near_mint",
    quantity: 2,
    colorIdentity: ["W"],
    imageUrl: "https://example.com/avacyn.jpg",
    oracleText: "Flying, vigilance, indestructible",
    rarity: "mythic",
    finish: "normal" as const,
    binder: "unsorted",
    scryfallId: null,
    createdAt: new Date("2026-04-11T12:00:00Z"),
    updatedAt: new Date("2026-04-11T14:00:00Z"),
  },
  {
    id: "m21-001-foil-lightly_played-unsorted",
    name: "Simple Card",
    setCode: "m21",
    setName: "Core Set 2021",
    collectorNumber: "001",
    price: null,
    condition: "lightly_played",
    quantity: 1,
    colorIdentity: ["G"],
    imageUrl: null,
    oracleText: null,
    rarity: "common",
    finish: "foil" as const,
    binder: "unsorted",
    scryfallId: null,
    createdAt: new Date("2026-04-10T12:00:00Z"),
    updatedAt: new Date("2026-04-10T14:00:00Z"),
  },
  {
    id: "2x2-10-etched-near_mint-unsorted",
    name: "Wrath of God",
    setCode: "2x2",
    setName: "Double Masters 2022",
    collectorNumber: "10",
    price: 800,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: ["W"],
    imageUrl: null,
    oracleText: null,
    rarity: "rare",
    finish: "etched" as const,
    binder: "unsorted",
    scryfallId: null,
    createdAt: new Date("2026-04-09T12:00:00Z"),
    updatedAt: new Date("2026-04-09T14:00:00Z"),
  },
];

describe("GET /api/admin/export", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockGetAllCardsForExport.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockGetAllCardsForExport.mockResolvedValue(testRows);
  });

  it("returns Content-Type text/csv", async () => {
    const response = await GET();
    expect(response.headers.get("Content-Type")).toBe("text/csv");
  });

  it("returns Content-Disposition with filename pattern viki-inventory-{date}.csv", async () => {
    const response = await GET();
    const disposition = response.headers.get("Content-Disposition");
    expect(disposition).toMatch(
      /attachment; filename="viki-inventory-\d{4}-\d{2}-\d{2}\.csv"/,
    );
  });

  it("has correct CSV header row (Phase 17 D-08: 'Finish' replaces 'Foil')", async () => {
    const response = await GET();
    const text = await response.text();
    const headerLine = text.split("\n")[0];
    expect(headerLine).toBe(
      "Name,Set Code,Set Name,Collector Number,Price,Condition,Quantity,Rarity,Finish",
    );
  });

  it("properly quotes card name containing comma", async () => {
    const response = await GET();
    const text = await response.text();
    const lines = text.split("\n");
    // First data row should have quoted name
    expect(lines[1]).toContain('"Avacyn, Angel of Hope"');
  });

  it("converts price from cents to dollars (1299 -> 12.99)", async () => {
    const response = await GET();
    const text = await response.text();
    const lines = text.split("\n");
    // First data row: price field
    expect(lines[1]).toContain("12.99");
  });

  it("renders null price as empty string", async () => {
    const response = await GET();
    const text = await response.text();
    const lines = text.split("\n");
    // Second data row has null price -- should be empty between commas
    const fields = lines[2].split(",");
    // Price is index 4 (0-based)
    expect(fields[4]).toBe("");
  });

  it("renders condition in DB format (not abbreviation)", async () => {
    const response = await GET();
    const text = await response.text();
    expect(text).toContain("near_mint");
    expect(text).toContain("lightly_played");
  });

  it("renders the 3-value finish enum literal in the Finish column (Phase 17 D-08)", async () => {
    const response = await GET();
    const text = await response.text();
    const lines = text.split("\n");
    // First data row: finish='normal' -> ',normal' at line end.
    expect(lines[1]).toMatch(/,normal$/);
    // Second data row: finish='foil' -> ',foil' at line end.
    expect(lines[2]).toMatch(/,foil$/);
    // Third data row: finish='etched' -> ',etched' at line end.
    expect(lines[3]).toMatch(/,etched$/);
  });

  it("returns 401 when requireAdmin returns 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 403 when requireAdmin returns 403 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await GET();
    expect(response.status).toBe(403);
  });
});
