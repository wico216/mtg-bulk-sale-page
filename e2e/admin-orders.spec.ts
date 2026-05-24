import { expect, test } from "@playwright/test";

test("mobile orders queue renders as action cards without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/orders");

  await expect(page.getByRole("heading", { name: "Orders." })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Queue/i })).toBeVisible();

  const row = page.locator(".wiko-order-row").filter({ hasText: "ORD-E2E-0001" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Alex Buyer")).toBeVisible();
  await expect(row.getByText(/Lightning Bolt/)).toBeVisible();

  const rowBox = await row.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(rowBox!.x).toBeGreaterThanOrEqual(0);
  expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(390);

  const total = row.locator(".wiko-order-row-total");
  const age = row.locator(".wiko-order-row-age");
  await expect(total).toBeVisible();
  await expect(age).toBeVisible();
  const totalBox = await total.boundingBox();
  const ageBox = await age.boundingBox();
  expect(totalBox).not.toBeNull();
  expect(ageBox).not.toBeNull();
  expect(totalBox!.y).toBeGreaterThan(rowBox!.y);
  expect(ageBox!.y).toBeGreaterThan(rowBox!.y);

  const actions = row.locator(".wiko-order-row-actions");
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Confirm" })).toBeVisible();

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
});
