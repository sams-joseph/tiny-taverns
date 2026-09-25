import type { Locator, Page } from "@playwright/test";
import { HEIGHT, expect, screens, test } from "../support/app";

/**
 * A row in a top-nav popup shows where the pointer or the keyboard is: its
 * computed background, hovered or highlighted, differs from the popup's and
 * from its own at rest, and the keyboard's highlight is the pointer's.
 *
 * jsdom resolves no Tailwind and no token, so it cannot see the failure this
 * guards: a highlight class that applies and resolves to the very colour the
 * popup is filled with. That is what happened when the delivery moved
 * `--surface-raised` onto the step every row highlighted with.
 */

const background = (locator: Locator) =>
  locator.evaluate((el) => getComputedStyle(el).backgroundColor);

/** Wait out the row's colour transition, then read where it came to rest. */
async function restingBackground(page: Page, row: Locator): Promise<string> {
  await page.waitForFunction(
    (el) => el!.getAnimations().every((animation) => animation.playState !== "running"),
    await row.elementHandle(),
  );
  return background(row);
}

const shelf = screens.find((screen) => screen.name === "spells")!;
const overview = screens.find((screen) => screen.name === "overview")!;

test.describe("1440px", () => {
  test.use({ viewport: { width: 1440, height: HEIGHT } });

  for (const name of ["Campaigns", "Library"]) {
    test(`a row of the ${name} panel`, async ({ app, page }) => {
      await app.open(shelf);
      const trigger = page
        .getByRole("navigation", { name: "Sections" })
        .first()
        .getByRole("button", { name, exact: true });
      await trigger.click();
      const popup = page.locator('[data-slot="navigation-menu-popup"]');
      await expect(popup).toBeVisible();
      await app.settle();

      // The first row not lit as the page you are on: that one is filled at rest.
      const row = popup.locator("a[href]:not([aria-current])").first();
      const panel = await background(popup);
      const resting = await restingBackground(page, row);

      await row.hover();
      const hovered = await restingBackground(page, row);
      expect.soft(hovered, "hovered row against the panel").not.toBe(panel);
      expect.soft(hovered, "hovered row against itself at rest").not.toBe(resting);

      // Off the row but inside the panel, so it stays open; then the keyboard.
      await popup.locator('[data-slot="navigation-menu-hero"]').hover();
      await expect.poll(() => restingBackground(page, row)).toBe(resting);
      await page.keyboard.press("Shift");
      await row.focus();
      await expect(row).toBeFocused();
      expect
        .soft(
          await row.evaluate((el) => el.matches(":focus-visible")),
          "the keyboard's row is focus-visible",
        )
        .toBe(true);
      expect.soft(await restingBackground(page, row), "focused row as hovered").toBe(hovered);
    });
  }
});

test.describe("390px", () => {
  test.use({ viewport: { width: 390, height: HEIGHT } });

  test("a link row of the campaign row's More menu", async ({ app, page }) => {
    await app.open(overview);
    const trigger = page.getByRole("button", { name: "More of this campaign" });
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await app.settle();

    const row = menu.locator("a[href][role=menuitem]:not([aria-current])").first();
    const popup = await background(menu);
    const resting = await restingBackground(page, row);

    await row.hover();
    await expect(row).toHaveAttribute("data-highlighted");
    const hovered = await restingBackground(page, row);
    expect.soft(hovered, "hovered row against the menu").not.toBe(popup);
    expect.soft(hovered, "hovered row against itself at rest").not.toBe(resting);

    // The arrow keys move the same highlight: from the row beside it, onto it.
    const rows = menu.getByRole("menuitem");
    const index = await rows.evaluateAll(
      (all, target) => all.indexOf(target!),
      await row.elementHandle(),
    );
    await rows.nth(index === 0 ? 1 : index - 1).hover();
    await expect(row).not.toHaveAttribute("data-highlighted");
    await page.keyboard.press(index === 0 ? "ArrowUp" : "ArrowDown");
    await expect(row).toHaveAttribute("data-highlighted");
    expect.soft(await restingBackground(page, row), "arrow-key row as hovered").toBe(hovered);
  });
});
