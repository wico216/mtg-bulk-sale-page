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

test("mobile picker renders touch-ready pull cards without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/orders/pick?refs=ORD-E2E-0001,ORD-E2E-0002");

  await expect(page.getByRole("heading", { name: "Pull list." })).toBeVisible();
  await expect(page.getByText("BINDER ↑")).toBeVisible();

  const row = page.locator(".wiko-picker-row").filter({ hasText: "Lightning Bolt" });
  await expect(row).toBeVisible();
  await expect(row.getByText("ORD-E2E-0001")).toBeVisible();
  await expect(row.getByRole("button", { name: /Got it/i })).toBeVisible();
  await expect(row.getByRole("button", { name: /Missing/i })).toBeVisible();

  const rowBox = await row.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(rowBox!.x).toBeGreaterThanOrEqual(0);
  expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(390);

  const actions = row.locator(".wiko-picker-row-actions");
  const actionsBox = await actions.boundingBox();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox!.y).toBeGreaterThan(rowBox!.y + 40);

  await row.getByRole("button", { name: /Got it/i }).click();
  await expect(page.locator(".wiko-picker-footer")).toContainText("2 picked");

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
});

test("desktop picker keeps the operator row layout and sticky footer usable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/orders/pick?refs=ORD-E2E-0001,ORD-E2E-0002");

  await expect(page.getByRole("heading", { name: "Pull list." })).toBeVisible();
  await expect(page.locator(".wiko-picker-toolbar")).toBeVisible();

  const row = page.locator(".wiko-picker-row").filter({ hasText: "Lightning Bolt" });
  await expect(row).toBeVisible();

  const nameBox = await row.locator(".wiko-picker-row-title").boundingBox();
  const actionsBox = await row.locator(".wiko-picker-row-actions").boundingBox();
  expect(nameBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox!.x).toBeGreaterThan(nameBox!.x + nameBox!.width);

  const footer = page.locator(".wiko-picker-footer");
  await expect(footer.getByRole("button", { name: /Mark batch confirmed/i })).toBeVisible();

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
});
