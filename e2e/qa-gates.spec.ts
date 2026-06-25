import { expect, test } from "@playwright/test";

async function openQaGate(page: import("@playwright/test").Page, runId: string) {
  await page.goto(`/qa/gates/${runId}`);
  await expect(page).toHaveURL(/\/qa\/login/);

  await page.getByLabel("Password").fill("qa-ci-password");
  await page.getByRole("button", { name: /open qa gate/i }).click();

  await expect(page).toHaveURL(new RegExp(`/qa/gates/${runId}`));
}

test("QA approval gate lets Wiko review recorded proof instead of clicking through screens", async ({ page }) => {
  await openQaGate(page, "demo-mobile-storefront-gate");
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

test("Mobile Storefront Visual QA Loop reference gate is remote-reviewable", async ({ page }) => {
  await openQaGate(page, "mobile-storefront-visual-qa-loop");

  await expect(page.getByRole("heading", { name: /mobile storefront visual qa loop/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what changed/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /agent-recorded evidence/i })).toBeVisible();
  await expect(page.getByText(/real branch artifacts should be attached before release approval/i)).toBeVisible();
  await expect(page.getByText(/no branch-specific mobile screenshot\/video is attached/i)).toBeVisible();
  await expect(page.getByText(/No video artifact is attached to this gate yet/i)).toBeVisible();

  const approve = page.getByRole("button", { name: /^approve$/i });
  await expect(approve).toBeDisabled();

  for (const label of [
    "Mobile proof is attached",
    "Phone layout is safe",
    "Storefront controls remain usable",
    "Review is remote-friendly",
    "Failure notes are actionable",
  ]) {
    await page
      .getByRole("group", { name: new RegExp(label, "i") })
      .getByText(/^Pass$/i)
      .click();
  }

  await expect(approve).toBeEnabled();
});
