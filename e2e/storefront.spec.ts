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
  await expect(page.getByRole("link", { name: "New arrivals" })).toBeVisible();
  await expect(page.getByText(/4 cards in stock/i)).toBeVisible();

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

test("admin ManaBox report shows sold cards pending visual collection removal", async ({ page }) => {
  await page.goto("/admin/manabox");

  await expect(page.getByRole("heading", { name: "ManaBox visual removals" })).toBeVisible();
  await expect(page.getByText(/grouped by Spellbook source box/i)).toBeVisible();
  await expect(page.getByText("4", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /download csv/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Print visual report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark current report removed" })).toBeVisible();

  const report = page.getByRole("region", { name: /Visual ManaBox removal report/i });
  const boxA02 = report.getByRole("region", { name: /Box A02 ManaBox removals/i });
  const boxB01 = report.getByRole("region", { name: /Box B01 ManaBox removals/i });
  const tradeBox = report.getByRole("region", { name: /Box Trade Box ManaBox removals/i });

  await expect(boxA02.getByRole("img", { name: /Lightning Bolt card art/i })).toBeVisible();
  await expect(boxB01.getByText("Sol Ring")).toBeVisible();
  await expect(tradeBox.getByText("Counterspell")).toBeVisible();
  await expect(boxA02.getByText(/1 card row/i)).toBeVisible();
});

test("new arrivals page shows recently added inventory newest first", async ({ page }) => {
  await page.goto("/new");

  await expect(page.getByRole("heading", { name: "New arrivals" })).toBeVisible();
  await expect(page.getByText(/Cards from the latest inventory import/i)).toBeVisible();
  await expect(page.getByText(/4 cards in stock/i)).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveValue("recent-desc");

  const tiles = page.locator(".wiko-card-grid .wiko-tile");
  await expect(tiles).toHaveCount(4);
  await expect(tiles.first()).toContainText("Lightning Bolt");

  await page.getByPlaceholder(/Search cards/i).fill("Counterspell");
  await expect(page.locator(".wiko-tile").filter({ hasText: "Counterspell" })).toHaveCount(1);
  await expect(page.locator(".wiko-tile").filter({ hasText: "Sol Ring" })).toHaveCount(0);
});

test("deck check matches pasted decklists and adds selected cards to the satchel", async ({ page }) => {
  await page.goto("/deck-check");
  await page.route("**/api/deck-check", async (route) => {
    const response = await route.fetch();
    const result = (await response.json()) as {
      items?: Array<{ options?: Array<{ card?: { name?: string; imageUrl?: string | null } }> }>;
    };

    for (const item of result.items ?? []) {
      for (const option of item.options ?? []) {
        if (option.card?.name === "Lightning Bolt") option.card.imageUrl = "/file.svg";
        if (option.card?.name === "Counterspell") option.card.imageUrl = "/window.svg";
      }
    }

    await route.fulfill({ response, json: result });
  });

  await expect(page.getByRole("heading", { name: /check your deck/i })).toBeVisible();
  await page.getByLabel(/deck link or exported list/i).fill("1 Lightning Bolt\n1 Counterspell (DMR) 45\n1 Rhystic Study");
  await page.getByRole("button", { name: /check my deck/i }).click();

  await expect(page.getByRole("heading", { name: /spellbook match report/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /edit deck input/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /check your deck/i })).toHaveCount(0);
  await expect(page.getByText("Spellbook match", { exact: true })).toBeVisible();
  await expect(page.getByText("Alternate printing", { exact: true })).toBeVisible();
  await expect(page.getByText(/Different printing: E2E #045/i)).toBeVisible();

  const availableList = page.locator(".wiko-deck-check-list");
  await expect(availableList).toContainText("Lightning Bolt");
  await expect(availableList).toContainText("Counterspell");
  await expect(availableList.getByRole("img", { name: /Lightning Bolt card art/i }).first()).toBeVisible();
  await expect(availableList.getByRole("img", { name: /Counterspell card art/i }).first()).toBeVisible();
  await expect(availableList.locator(".wiko-deck-check-option-card")).toHaveCount(2);

  await availableList.getByRole("button", { name: /view lightning bolt card art larger/i }).click();
  const boltLightbox = page.getByRole("dialog", { name: /larger image for lightning bolt/i });
  await expect(boltLightbox.getByRole("img", { name: /Lightning Bolt enlarged card art/i })).toBeVisible();
  await boltLightbox.getByRole("button", { name: /close/i }).click();
  await expect(boltLightbox).toHaveCount(0);

  const selectedCounterspellOption = availableList.getByRole("button", { name: /Select Counterspell E2E #045 · Nonfoil/i });
  await selectedCounterspellOption.getByRole("img", { name: /Counterspell card art/i }).click();
  const counterspellLightbox = page.getByRole("dialog", { name: /larger image for counterspell/i });
  await expect(counterspellLightbox.getByRole("img", { name: /Counterspell enlarged card art/i })).toBeVisible();
  await expect(counterspellLightbox).toContainText("E2E #045 · Nonfoil");
  await page.keyboard.press("Escape");
  await expect(counterspellLightbox).toHaveCount(0);

  await expect(availableList).not.toContainText("Rhystic Study");

  const missingToggle = page.getByRole("button", { name: /cards not found in spellbook/i });
  await expect(missingToggle).toBeVisible();
  await expect(page.locator(".wiko-deck-check-missing-list")).toHaveCount(0);
  await missingToggle.click();
  await expect(page.locator(".wiko-deck-check-missing-list")).toContainText("Rhystic Study");
  await expect(page.getByText("Not in Spellbook", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /add all selected to satchel/i }).click();

  await expect(page.getByRole("status")).toContainText("Added 2 cards to your satchel");
  await expect(page.getByRole("link", { name: "Cart", exact: true })).toContainText("2");
});

test("storefront groups foil and nonfoil finishes while keeping extended art separate", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder(/Search cards/i).fill("Sol Ring");

  const solTiles = page.locator(".wiko-card-grid .wiko-tile").filter({ hasText: "Sol Ring" });
  await expect(solTiles).toHaveCount(2);

  const regularPrintingTile = solTiles.filter({ hasText: "2 options" });
  await expect(regularPrintingTile).toHaveCount(1);
  await expect(regularPrintingTile.getByRole("button", { name: /choose finish options/i })).toBeVisible();
  await expect(regularPrintingTile.getByRole("button", { name: "Quick add to cart" })).toHaveCount(0);

  await regularPrintingTile.click();

  const modal = page.locator(".wiko-card-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("2 options");
  await expect(modal.getByRole("button", { name: /add nonfoil to satchel/i })).toBeVisible();
  await expect(modal.getByRole("button", { name: /add foil to satchel/i })).toBeVisible();

  await modal.getByRole("button", { name: /add foil to satchel/i }).click();
  await expect(page.getByRole("link", { name: "Cart", exact: true })).toContainText("1");
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

test("mobile filter drawer keeps selected set visible and summarized", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  const controls = page.locator(".wiko-mobile-storefront-controls");
  await expect(controls).toBeVisible();

  await page.getByRole("button", { name: /filter/i }).click();
  const drawer = page.getByRole("dialog", { name: "Filters" });
  await expect(drawer).toBeVisible();

  await drawer.getByText("E2E Masters Extended Art").click();
  await expect(drawer.getByText("Selected")).toBeVisible();
  await expect(drawer.getByText("E2E Masters Extended Art")).toBeVisible();
  await drawer.getByRole("button", { name: "Close filters" }).click();

  await expect(controls.getByText("Set: E2E Masters Extended Art")).toBeVisible();
});

test("mobile search controls hide/reveal only after intentional scroll distance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  const header = page.locator(".wiko-header");
  const controls = page.locator(".wiko-mobile-storefront-controls");
  const filterButton = page.getByRole("button", { name: /filter/i });
  const searchInput = page.getByPlaceholder(/Search cards/i);
  const sortSelect = page.getByRole("combobox");

  const controlsAreVisible = async () => {
    const [headerBox, filterBox, searchBox, sortBox] = await Promise.all([
      header.boundingBox(),
      filterButton.boundingBox(),
      searchInput.boundingBox(),
      sortSelect.boundingBox(),
    ]);
    const viewportHeight = page.viewportSize()?.height;
    if (!headerBox || !filterBox || !searchBox || !sortBox || !viewportHeight) return false;
    const headerBottom = headerBox.y + headerBox.height;
    return (
      filterBox.y >= headerBottom - 1 &&
      searchBox.y >= headerBottom - 1 &&
      sortBox.y >= headerBottom - 1 &&
      filterBox.y + filterBox.height <= viewportHeight &&
      searchBox.y + searchBox.height <= viewportHeight &&
      sortBox.y + sortBox.height <= viewportHeight
    );
  };

  await expect(header).toBeVisible();
  await expect(controls).toBeVisible();
  await expect(filterButton).toBeVisible();
  await expect(searchInput).toBeVisible();
  await expect(sortSelect).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 44));
  await page.waitForTimeout(240);
  await expect.poll(controlsAreVisible).toBe(true);

  await page.evaluate(() => window.scrollTo(0, 700));

  await expect
    .poll(async () => {
      const [headerBox, controlsBox] = await Promise.all([
        header.boundingBox(),
        controls.boundingBox(),
      ]);
      if (!headerBox || !controlsBox) return false;
      const headerBottom = headerBox.y + headerBox.height;
      return controlsBox.y + controlsBox.height <= headerBottom + 2;
    })
    .toBe(true);

  await page.evaluate(() => window.scrollBy(0, -16));
  await page.waitForTimeout(240);

  await expect
    .poll(async () => {
      const [headerBox, controlsBox] = await Promise.all([
        header.boundingBox(),
        controls.boundingBox(),
      ]);
      if (!headerBox || !controlsBox) return false;
      const headerBottom = headerBox.y + headerBox.height;
      return controlsBox.y + controlsBox.height <= headerBottom + 2;
    })
    .toBe(true);

  await page.evaluate(() => window.scrollBy(0, -48));
  await expect.poll(controlsAreVisible).toBe(true);
});

test("mobile form controls use 16px text to avoid iOS focus zoom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  // Settle guard: ensure the mobile layout branch has replaced the
  // pre-hydration desktop branch before measuring/clicking (the desktop
  // branch's controls detach on the swap, which reads as NaN font sizes).
  await expect(page.locator(".wiko-mobile-storefront-controls")).toBeVisible();

  const expectFocusControlNotToZoom = async (label: string, locator: ReturnType<typeof page.locator>) => {
    await expect(locator, `${label} should be visible before checking its font size`).toBeVisible();
    const fontSize = await locator.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize),
    );
    expect(fontSize, `${label} should use at least 16px text on mobile`).toBeGreaterThanOrEqual(16);
  };

  await expectFocusControlNotToZoom(
    "storefront search",
    page.getByPlaceholder(/Search cards/i),
  );
  await expectFocusControlNotToZoom("sort select", page.getByRole("combobox"));

  await page.getByRole("button", { name: /filter/i }).click();
  await expectFocusControlNotToZoom(
    "filter drawer set search",
    page.getByPlaceholder("Search sets"),
  );
  await page.getByRole("button", { name: "Close filters" }).click();

  await page.locator(".wiko-tile").first().getByRole("button", { name: "Quick add to cart" }).click();
  await page.getByRole("link", { name: "Cart", exact: true }).click();
  await page.getByRole("link", { name: "Proceed to checkout" }).click();

  await expectFocusControlNotToZoom("checkout name", page.getByLabel("Name"));
  await expectFocusControlNotToZoom("checkout email", page.getByLabel("Email"));
  await expectFocusControlNotToZoom("checkout phone", page.getByLabel(/Phone/i));
  await expectFocusControlNotToZoom("checkout message", page.getByLabel(/Message/i));
});

test("mobile card tiles reserve consistent height for smooth slow scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  // Settle guard: measure tiles only after the mobile layout branch is in
  // (pre-hydration desktop-branch tiles are rail-squeezed and wrap titles
  // differently, so their heights are not representative).
  await expect(page.locator(".wiko-mobile-storefront-controls")).toBeVisible();

  const tiles = page.locator(".wiko-card-grid .wiko-tile");
  await expect(page.getByText(/cards in stock/i)).toBeVisible();
  await expect(tiles).toHaveCount(4);

  const tileHeights = await tiles.evaluateAll((tileElements) =>
    tileElements.map((tile) => Math.round(tile.getBoundingClientRect().height)),
  );

  expect(tileHeights.length).toBeGreaterThan(1);
  expect(Math.max(...tileHeights) - Math.min(...tileHeights)).toBeLessThanOrEqual(1);
});

test("mobile storefront keeps the rendered card DOM bounded with production-sized inventory", async ({ page }) => {
  const bulkCount = Number(process.env.E2E_BULK_FIXTURE_COUNT ?? "0");
  test.skip(
    bulkCount < 500,
    "Run with E2E_BULK_FIXTURE_COUNT=1200+ to exercise the large-inventory mobile path.",
  );

  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  await expect(page.getByText(`${bulkCount.toLocaleString()} cards in stock`)).toBeVisible();
  await expect(page.locator(".wiko-mobile-storefront-controls")).toBeVisible();

  const renderedTileCount = await page.locator(".wiko-card-grid .wiko-tile").count();
  const domNodeCount = await page.evaluate(() => document.querySelectorAll("*").length);

  expect(renderedTileCount).toBeLessThanOrEqual(72);
  expect(domNodeCount).toBeLessThan(900);

  const initialScrollHeight = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);

  await page.evaluate(() => window.scrollTo(0, 120_000));
  await page.waitForTimeout(120);

  const afterScrollTileCount = await page.locator(".wiko-card-grid .wiko-tile").count();
  const afterScrollDomNodeCount = await page.evaluate(() => document.querySelectorAll("*").length);
  const afterScrollHeight = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);
  const visibleLabels = await page.locator(".wiko-card-grid .wiko-tile-title").allTextContents();

  expect(afterScrollTileCount).toBeLessThanOrEqual(72);
  expect(afterScrollDomNodeCount).toBeLessThan(900);
  expect(Math.abs(afterScrollHeight - initialScrollHeight)).toBeLessThanOrEqual(2);
  expect(visibleLabels.some((label) => /Fixture Bulk Card 0[7-9]\d{2}/.test(label))).toBe(true);
});

test("mobile storefront uses compact two-column cards while desktop keeps the wide grid", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  const mobileGrid = page.locator(".wiko-card-grid");
  const mobileTiles = mobileGrid.locator(".wiko-tile");
  await expect(mobileTiles).toHaveCount(4);
  await expect(page.locator(".wiko-mobile-storefront-controls")).toBeVisible();

  const [firstMobileBox, secondMobileBox] = await Promise.all([
    mobileTiles.nth(0).boundingBox(),
    mobileTiles.nth(1).boundingBox(),
  ]);
  expect(firstMobileBox).not.toBeNull();
  expect(secondMobileBox).not.toBeNull();
  expect(Math.abs(firstMobileBox!.y - secondMobileBox!.y)).toBeLessThanOrEqual(2);
  expect(firstMobileBox!.width).toBeLessThan(200);
  const mobileQuickAdd = mobileTiles.nth(0).getByRole("button", { name: "Quick add to cart" });
  await expect(mobileQuickAdd).toBeVisible();
  await expect(mobileQuickAdd).toHaveCSS("opacity", "1");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();

  await expect(page.locator(".wiko-mobile-storefront-controls")).toHaveCount(0);
  const desktopFirstTile = page.locator(".wiko-card-grid .wiko-tile").first();
  const desktopBox = await desktopFirstTile.boundingBox();
  const desktopQuickAdd = desktopFirstTile.getByRole("button", { name: "Quick add to cart" });
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.width).toBeGreaterThanOrEqual(250);
  await expect(desktopQuickAdd).toHaveCSS("opacity", "0");
});

test("mobile Safari chrome has a solid theme color and header background", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  const themeColors = page.locator('meta[name="theme-color"]');
  expect(await themeColors.count()).toBeGreaterThan(0);

  const headerBackground = await page
    .locator(".wiko-header")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const rootBackground = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  expect(headerBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(rootBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(bodyBackground).not.toBe("rgba(0, 0, 0, 0)");
});
