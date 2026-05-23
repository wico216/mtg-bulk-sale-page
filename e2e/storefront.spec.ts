import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("storefront supports search, card details, and unauthenticated admin redirect", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Wiko's Spellbook home" })).toBeVisible();
  await expect(page.getByText(/3 cards in stock/i)).toBeVisible();

  await page.getByPlaceholder(/Search cards/i).fill("Lightning Bolt");

  const boltTile = page.locator(".wiko-tile").filter({ hasText: "Lightning Bolt" });
  await expect(boltTile).toHaveCount(1);
  await expect(page.locator(".wiko-tile").filter({ hasText: "Counterspell" })).toHaveCount(0);

  await boltTile.click();
  const modal = page.locator(".wiko-card-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Lightning Bolt");
  await expect(modal).toContainText("Lightning Bolt deals 3 damage to any target.");
  await expect(page.getByRole("link", { name: /View on Scryfall/i })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByText(/Only authorized admins can access this area/i)).toBeVisible();
});

test("card details modal keeps readable single-column layout on phone screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  await page.locator(".wiko-tile").filter({ hasText: "Lightning Bolt" }).click();

  const modal = page.locator(".wiko-card-modal");
  await expect(modal).toBeVisible();

  const imagePane = modal.locator(":scope > div").first();
  const detailsPane = modal.locator(":scope > div").nth(1);
  const title = modal.getByRole("heading", { name: "Lightning Bolt" });

  const [imageBox, detailsBox, titleBox] = await Promise.all([
    imagePane.boundingBox(),
    detailsPane.boundingBox(),
    title.boundingBox(),
  ]);

  expect(imageBox).not.toBeNull();
  expect(detailsBox).not.toBeNull();
  expect(titleBox).not.toBeNull();

  expect(detailsBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height - 1);
  expect(titleBox!.width).toBeGreaterThanOrEqual(220);
});

test("card details modal keeps Add to satchel visible on phone screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  await page.locator(".wiko-tile").filter({ hasText: "Lightning Bolt" }).click();

  const addButton = page.getByRole("button", { name: "Add to satchel" });
  await expect(addButton).toBeVisible();

  const addButtonBox = await addButton.boundingBox();
  const viewportHeight = page.viewportSize()?.height;
  expect(addButtonBox).not.toBeNull();
  expect(viewportHeight).toBeDefined();
  expect(addButtonBox!.y + addButtonBox!.height).toBeLessThanOrEqual(viewportHeight!);
});
