import { accountName, expect, signIn, test } from "./support/fixtures";

/**
 * Signing in through Clerk reaches the app, and the API server, verifying the
 * session offline with the instance's public key, provisions an account for it
 * on that first request. Signing out returns to the signed-out homepage.
 */

test("signing in provisions an account", async ({ page }) => {
  await signIn(page, "dm");

  // The signed-out gate opened: the app, not the homepage.
  await expect(page.getByRole("heading", { name: "Campaigns", level: 1 })).toBeVisible();

  // `/characters` is the screen that names the reader (`GET /me`).
  await page.goto("/characters");
  await expect(page.getByText(`${await accountName(page)} · `)).toBeVisible();
});

test("signing out returns to the signed-out homepage", async ({ page }) => {
  await signIn(page, "dm");
  await expect(page.getByRole("heading", { name: "Campaigns", level: 1 })).toBeVisible();

  // Clerk's own account menu, as a person would use it.
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  const homepage = page.getByRole("heading", {
    name: "Run the fight, not the spreadsheet",
    level: 1,
  });
  await expect(homepage).toBeVisible();

  // The session ended at Clerk, not only in this tab's state: a fresh load of
  // the app's root is still the homepage.
  await page.goto("/");
  await expect(homepage).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaigns", level: 1 })).toHaveCount(0);
});
