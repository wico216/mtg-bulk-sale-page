import { expect, test } from "@playwright/test";

test("QA approval gate lets Wiko review recorded proof instead of clicking through screens", async ({ page }) => {
  await page.goto("/qa/gates/demo-mobile-storefront-gate");
  await expect(page).toHaveURL(/\/qa\/login/);

  await page.getByLabel("Password").fill("qa-ci-password");
  await page.getByRole("button", { name: /open qa gate/i }).click();

  await expect(page).toHaveURL(/\/qa\/gates\/demo-mobile-storefront-gate/);
  await expect(page.getByRole("heading", { name: /human-in-the-loop acceptance gate/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what changed/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what to look for/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /agent-recorded evidence/i })).toBeVisible();
  await expect(page.locator("video")).toBeVisible();

  const approve = page.getByRole("button", { name: /^approve$/i });
  await expect(approve).toBeDisabled();
  await expect(page.getByRole("button", { name: /fail \/ request fixes/i })).toBeEnabled();
  await expect(page.getByLabel(/notes for atlas dev/i)).toBeVisible();

  for (const label of [
    "Video proof is visible",
    "Expected behavior is readable",
    "Notes and decision are available",
    "Remote review flow works",
  ]) {
    await page
      .getByRole("group", { name: new RegExp(label, "i") })
      .getByText(/^Pass$/i)
      .click();
  }

  await expect(approve).toBeEnabled();
});
