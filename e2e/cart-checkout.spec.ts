import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

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
