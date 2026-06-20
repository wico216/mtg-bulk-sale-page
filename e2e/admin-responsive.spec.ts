import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    return { viewport: window.innerWidth, scroll: doc.scrollWidth };
  });
  expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
}

async function expectWithinViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box).not.toBeNull();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
}

test.describe("mobile admin responsive audit surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("inventory rows collapse into readable cards with touch-visible controls", async ({ page }) => {
    await page.goto("/admin?fixtureAdmin=1");
    await expect(page.getByRole("heading", { name: "Inventory." })).toBeVisible();

    const row = page.locator(".wiko-inventory-row").filter({ hasText: "Counterspell" }).first();
    await expect(row).toBeVisible();
    await expect(row.locator(".wiko-inventory-row-title")).toContainText("Counterspell");
    await expect(row.locator(".wiko-inventory-row-delete button")).toBeVisible();

    const rowBox = await row.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.x).toBeGreaterThanOrEqual(0);
    expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(390);

    await expectWithinViewport(page, ".wiko-inventory-row-price");
    await expectWithinViewport(page, ".wiko-inventory-row-qty");
    await expectWithinViewport(page, ".wiko-inventory-row-binder");
    await expectNoHorizontalOverflow(page);
  });

  test("order detail stacks actions, buyer context, items, timeline, and note without squeezing", async ({ page }) => {
    await page.goto("/admin/orders/ORD-E2E-0001");
    await expect(page.getByRole("heading", { name: "ORD-E2E-0001" })).toBeVisible();

    const rail = page.locator(".wiko-order-detail-rail");
    const firstItem = page.locator(".wiko-order-detail-item").first();
    const note = page.locator("#admin-note");
    await expect(rail.getByText("Quick actions")).toBeVisible();
    await expect(firstItem).toBeVisible();
    await expect(note).toBeVisible();

    const railBox = await rail.boundingBox();
    const itemBox = await firstItem.boundingBox();
    const noteBox = await note.boundingBox();
    expect(railBox).not.toBeNull();
    expect(itemBox).not.toBeNull();
    expect(noteBox).not.toBeNull();
    expect(railBox!.y).toBeLessThan(itemBox!.y);
    expect(noteBox!.width).toBeGreaterThan(320);

    await expectWithinViewport(page, ".wiko-order-detail-item");
    await expectNoHorizontalOverflow(page);
  });

  test("audit and import history tables render as mobile cards", async ({ page }) => {
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Audit & Import History" })).toBeVisible();

    await expect(page.locator(".wiko-audit-table tbody tr").first()).toBeVisible();
    await expect(page.locator(".wiko-import-history-table tbody tr").first()).toBeVisible();

    const auditHeadDisplay = await page.locator(".wiko-audit-table thead").evaluate((el) => getComputedStyle(el).display);
    const importHeadDisplay = await page.locator(".wiko-import-history-table thead").evaluate((el) => getComputedStyle(el).display);
    expect(auditHeadDisplay).toBe("none");
    expect(importHeadDisplay).toBe("none");

    await expectWithinViewport(page, ".wiko-audit-table tbody tr");
    await expectWithinViewport(page, ".wiko-import-history-table tbody tr");
    await expectNoHorizontalOverflow(page);
  });

  test("health checks render as readable mobile cards", async ({ page }) => {
    await page.goto("/admin/health");
    await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible();

    const firstCheck = page.locator(".wiko-health-check-table tbody tr").first();
    await expect(firstCheck).toBeVisible();
    await expect(firstCheck).toContainText("Database");
    await expect(firstCheck).toContainText("SELECT 1 succeeded");

    const headDisplay = await page.locator(".wiko-health-check-table thead").evaluate((el) => getComputedStyle(el).display);
    expect(headDisplay).toBe("none");

    await expectWithinViewport(page, ".wiko-health-check-table tbody tr");
    await expectNoHorizontalOverflow(page);
  });

  test("commander EDHREC shortcuts render as tappable image cards", async ({ page }) => {
    await page.goto("/admin/commanders");
    await expect(page.getByRole("heading", { name: "Commanders." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Commanders" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: /add commander/i })).toBeVisible();

    const grid = page.getByRole("region", { name: /Saved Commander EDHREC links/i });
    await expect(grid).toBeVisible();
    const muldrotha = grid.getByRole("article", { name: /Muldrotha, the Gravetide commander shortcut/i });
    await expect(muldrotha).toBeVisible();
    await expect(muldrotha.getByRole("img", { name: /Muldrotha, the Gravetide commander art/i })).toBeVisible();
    await expect(muldrotha.getByRole("link", { name: /Open Muldrotha, the Gravetide on EDHREC/i })).toHaveAttribute(
      "href",
      "https://edhrec.com/commanders/muldrotha-the-gravetide",
    );

    await expectWithinViewport(page, ".wiko-commander-link-grid article");
    await expectNoHorizontalOverflow(page);
  });

  test("ManaBox removals render as a visual checklist with card art and source boxes", async ({ page }) => {
    await page.goto("/admin/manabox");
    await expect(page.getByRole("heading", { name: "ManaBox visual removals" })).toBeVisible();
    await expect(page.getByRole("button", { name: /print visual report/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /download csv/i })).toHaveCount(0);

    const report = page.getByRole("region", { name: /Visual ManaBox removal report/i });
    await expect(report).toBeVisible();
    await expect(report.getByRole("img", { name: /Lightning Bolt card art/i })).toBeVisible();
    await expect(report.getByText("Box A02")).toBeVisible();
    await expect(report.getByText("Box Trade Box")).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("Price Movers report renders rising cards with source boxes and no horizontal overflow", async ({ page }) => {
    await page.goto("/admin/prices");
    await expect(page.getByRole("heading", { name: "Price movers" })).toBeVisible();
    await expect(page.getByText(/cards that jumped in value/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Price Movers" })).toHaveAttribute("aria-current", "page");

    const report = page.getByRole("region", { name: /Admin Price Movers report/i });
    await expect(report).toBeVisible();
    await expect(report.getByRole("article", { name: /Rhystic Study price mover/i })).toBeVisible();
    await expect(report.getByText("Box A03")).toBeVisible();
    await expect(report.getByText("$38.20 → $51.75")).toBeVisible();
    await expect(report.getByText("+$13.55")).toBeVisible();
    await expect(report.getByText("+$9.00 inventory upside")).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("picker confirmation footer no longer covers row action buttons mid-list", async ({ page }) => {
    await page.goto("/admin/orders/pick?refs=ORD-E2E-0001,ORD-E2E-0002");
    await expect(page.getByRole("heading", { name: "Pull list." })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.7)));

    const secondActions = page.locator(".wiko-picker-row").nth(1).locator(".wiko-picker-row-actions");
    await expect(secondActions).toBeVisible();
    const actionsBox = await secondActions.boundingBox();
    const footerBox = await page.locator(".wiko-picker-footer").boundingBox();
    expect(actionsBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    if (footerBox!.y < 844) {
      expect(footerBox!.y).toBeGreaterThanOrEqual(actionsBox!.y + actionsBox!.height - 1);
    }

    await expectNoHorizontalOverflow(page);
  });
});
