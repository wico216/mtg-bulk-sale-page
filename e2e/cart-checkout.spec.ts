import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

async function addLightningBoltAndOpenCheckout(page: Page) {
  await page.goto("/");

  const boltTile = page.locator(".wiko-tile").filter({ hasText: "Lightning Bolt" });
  await expect(boltTile).toHaveCount(1);
  await boltTile.getByRole("button", { name: "Quick add to cart" }).click({ force: true });

  const cartLink = page.getByRole("link", { name: "Cart" });
  await expect(cartLink).toBeVisible();
  await cartLink.click();
  await expect(page).toHaveURL(/\/cart$/);

  await page.getByRole("link", { name: /Proceed to checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
}

test("buyer can add a card, edit the satchel, and complete checkout", async ({ page }) => {
  await page.route("**/api/checkout", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as {
      buyerName: string;
      buyerEmail: string;
      buyerPhone?: string;
      message?: string;
      items: Array<{ cardId: string; quantity: number }>;
    };

    expect(body).toMatchObject({
      buyerName: "E2E Buyer",
      buyerEmail: "buyer@example.com",
      buyerPhone: "555-1234",
      message: "Testing checkout",
      items: [{ cardId: "e2e-150-normal-near_mint", quantity: 2 }],
    });

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        orderRef: "ORD-E2E-0001",
        order: {
          orderRef: "ORD-E2E-0001",
          buyerName: "E2E Buyer",
          buyerEmail: "buyer@example.com",
          message: "Testing checkout",
          items: [
            {
              cardId: "e2e-150-normal-near_mint",
              name: "Lightning Bolt",
              setName: "E2E Masters",
              setCode: "e2e",
              collectorNumber: "150",
              condition: "near_mint",
              price: 3.5,
              quantity: 2,
              lineTotal: 7,
              imageUrl: null,
            },
          ],
          totalItems: 2,
          totalPrice: 7,
          createdAt: "2026-05-23T00:00:00.000Z",
        },
        notification: {
          sellerEmailSent: true,
          buyerEmailSent: true,
        },
      }),
    });
  });

  await page.goto("/");

  const boltTile = page.locator(".wiko-tile").filter({ hasText: "Lightning Bolt" });
  await expect(boltTile).toHaveCount(1);
  await boltTile.getByRole("button", { name: "Quick add to cart" }).click({ force: true });

  const cartLink = page.getByRole("link", { name: "Cart" });
  await expect(cartLink).toBeVisible();
  await expect(cartLink).toContainText("1");

  await cartLink.click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("heading", { name: "The Satchel" })).toBeVisible();
  await expect(page.getByText("Lightning Bolt")).toBeVisible();
  await expect(page.getByText(/1 card · Subtotal/i)).toBeVisible();
  await expect(page.getByText("$3.50").last()).toBeVisible();

  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("2");
  await expect(page.getByText(/2 cards · Subtotal/i)).toBeVisible();
  await expect(page.getByText("$7.00").last()).toBeVisible();

  await page.getByRole("link", { name: /Proceed to checkout/i }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  await page.getByLabel("Name").fill("E2E Buyer");
  await page.getByLabel("Email").fill("buyer@example.com");
  await page.getByLabel(/Phone/i).fill("555-1234");
  await page.getByLabel(/Message/i).fill("Testing checkout");

  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/confirmation\?ref=ORD-E2E-0001/);
  await expect(page.getByRole("heading", { name: "Order placed!" })).toBeVisible();
  await expect(page.getByText("Order ORD-E2E-0001")).toBeVisible();
  await expect(page.getByText(/2 cards\s*—\s*\$7\.00/i)).toBeVisible();
});

test("checkout keeps one submit button and uses a sticky desktop summary rail", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await addLightningBoltAndOpenCheckout(page);
  await page.waitForFunction(() => {
    const rail = document.querySelector(".wiko-checkout-rail");
    return rail && getComputedStyle(rail).position === "sticky";
  });
  await page.evaluate(() => {
    const rail = document.querySelector(".wiko-checkout-rail");
    if (!rail) throw new Error("Checkout rail not found");
    const railTop = rail.getBoundingClientRect().top;
    window.scrollTo(0, window.scrollY + railTop - 84 + 2);
  });

  await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(1);

  const desktopLayout = await page.evaluate(() => {
    const rail = document.querySelector(".wiko-checkout-rail") as HTMLElement | null;
    const form = document.querySelector("#checkout-form") as HTMLElement | null;
    if (!rail || !form) throw new Error("Checkout layout not found");

    const railBox = rail.getBoundingClientRect();
    const formBox = form.getBoundingClientRect();
    const railStyle = getComputedStyle(rail);

    return {
      railBorderTopWidth: railStyle.borderTopWidth,
      railLeft: railBox.left,
      railPaddingTop: railStyle.paddingTop,
      railPosition: railStyle.position,
      railTop: railBox.top,
      railTopOffset: railStyle.top,
      formRight: formBox.right,
    };
  });

  expect(desktopLayout.railPosition).toBe("sticky");
  expect(desktopLayout.railTopOffset).toBe("84px");
  expect(desktopLayout.railTop).toBeGreaterThanOrEqual(83);
  expect(desktopLayout.railTop).toBeLessThanOrEqual(85);
  expect(desktopLayout.railBorderTopWidth).toBe("1px");
  expect(desktopLayout.railPaddingTop).toBe("20px");
  expect(desktopLayout.railLeft).toBeGreaterThan(desktopLayout.formRight);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toHaveCount(1);

  const mobileLayout = await page.evaluate(() => {
    const rail = document.querySelector(".wiko-checkout-rail") as HTMLElement | null;
    const form = document.querySelector("#checkout-form") as HTMLElement | null;
    const button = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[form="checkout-form"]'),
    ).find((candidate) => getComputedStyle(candidate).display !== "none");
    if (!rail || !form || !button) throw new Error("Mobile checkout layout not found");

    const railBox = rail.getBoundingClientRect();
    const formBox = form.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const railStyle = getComputedStyle(rail);

    return {
      buttonBottom: buttonBox.bottom,
      buttonTop: buttonBox.top,
      formTop: formBox.top,
      railBorderTopWidth: railStyle.borderTopWidth,
      railPaddingTop: railStyle.paddingTop,
      railPosition: railStyle.position,
      railTop: railBox.top,
      viewportHeight: window.innerHeight,
    };
  });

  expect(mobileLayout.railPosition).toBe("static");
  expect(mobileLayout.railBorderTopWidth).toBe("0px");
  expect(mobileLayout.railPaddingTop).toBe("0px");
  expect(mobileLayout.railTop).toBeLessThan(mobileLayout.formTop);
  expect(mobileLayout.buttonTop).toBeGreaterThan(700);
  expect(mobileLayout.buttonBottom).toBeLessThanOrEqual(mobileLayout.viewportHeight);
});

test("mobile satchel uses touch-friendly cart cards and keeps checkout visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // Wait for the mobile layout branch before interacting — same settle
  // guard the other mobile specs use. Clicking earlier can resolve element
  // coordinates against the pre-hydration desktop-branch layout.
  await expect(page.locator(".wiko-mobile-storefront-controls")).toBeVisible();

  const boltTile = page.locator(".wiko-tile").filter({ hasText: "Lightning Bolt" });
  await expect(boltTile).toHaveCount(1);
  await boltTile.getByRole("button", { name: "Quick add to cart" }).click({ force: true });

  await page.getByRole("link", { name: "Cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);

  const cartItem = page.locator(".wiko-cart-item").filter({ hasText: "Lightning Bolt" });
  await expect(cartItem).toBeVisible();

  const titleBox = await cartItem.getByText("Lightning Bolt").boundingBox();
  const controls = cartItem.locator(".wiko-cart-item-controls");
  await expect(controls).toBeVisible();
  const controlsBox = await controls.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(controlsBox!.y).toBeGreaterThan(titleBox!.y);

  for (const control of [
    page.getByRole("button", { name: "Decrease quantity" }),
    page.getByRole("spinbutton", { name: "Quantity" }),
    page.getByRole("button", { name: "Increase quantity" }),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  }

  const checkout = page.getByRole("link", { name: /Proceed to checkout/i });
  await expect(checkout).toBeVisible();
  const checkoutBox = await checkout.boundingBox();
  expect(checkoutBox).not.toBeNull();
  expect(checkoutBox!.x).toBeGreaterThanOrEqual(16);
  expect(checkoutBox!.x + checkoutBox!.width).toBeLessThanOrEqual(390 - 16);
  expect(checkoutBox!.y + checkoutBox!.height).toBeLessThanOrEqual(844);

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
});
