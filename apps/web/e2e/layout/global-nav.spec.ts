import type { Locator } from "@playwright/test";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The global row's panels, pressed with a real pointer on a Library shelf (the
 * page with the longest panel's owner lit), measured open, then shut with
 * Escape.
 *
 * Open, a panel is on top of the chrome it opens from, inside the viewport,
 * and makes the page no wider. Its hero's picture decoded; the hero and every
 * row sit inside the panel and nothing in it is wider than it (its viewport
 * clips sideways, so an overflow there is text cut off rather than a page that
 * scrolls); every row carries its one-line description as `aria-describedby`.
 * Escape closes it and hands focus back to its trigger.
 */

const TRIGGERS = ["Campaigns", "Library"];
const shelf = screens.find((screen) => screen.name === "spells")!;

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    for (const name of TRIGGERS) {
      test(`the ${name} panel`, async ({ app, page }) => {
        await app.open(shelf);
        const trigger = page
          .getByRole("navigation", { name: "Sections" })
          .first()
          .getByRole("button", { name, exact: true });
        await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        const popup = page.locator('[data-slot="navigation-menu-popup"]');
        await expect(popup).toBeVisible();
        const hero = popup.locator('[data-slot="navigation-menu-hero"]');
        const picture = hero.locator("img");
        await expect(picture, "the hero's picture decoded").toHaveJSProperty("complete", true);
        expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(
          0,
        );
        // Panels open with a transition; measure the box it comes to rest at.
        await app.settle();

        const panel = await box(popup);
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(panel.x, "panel's left edge").toBeGreaterThanOrEqual(-0.5);
        expect
          .soft(panel.x + panel.width, "panel's right edge")
          .toBeLessThanOrEqual(clientWidth + 0.5);
        expect
          .soft(panel.y + panel.height, "panel's bottom edge")
          .toBeLessThanOrEqual(HEIGHT + 0.5);
        expect.soft(scrollWidth, "scrollWidth with the panel open").toBe(clientWidth);

        const inside = async (what: string, locator: Locator) => {
          const at = await box(locator);
          expect.soft(at.x, `${what}'s left edge`).toBeGreaterThanOrEqual(panel.x - 0.5);
          expect
            .soft(at.x + at.width, `${what}'s right edge`)
            .toBeLessThanOrEqual(panel.x + panel.width + 0.5);
        };
        await inside("the hero", hero);

        const links = await popup.locator("a[href]").all();
        expect(links.length, "rows in the panel").toBeGreaterThan(0);
        for (const link of links) {
          const title = await link.getAttribute("aria-labelledby");
          const what = title === null ? await link.textContent() : `row ${title}`;
          await expect.soft(link, `${what} has a description`).toHaveAttribute("aria-describedby");
          await inside(`${what}`, link);
        }
        const inner = popup.locator('[data-slot="navigation-menu-viewport"]');
        expect
          .soft(
            await inner.evaluate((el) => el.scrollWidth - el.clientWidth),
            "wider than the panel",
          )
          .toBeLessThanOrEqual(0);

        // On top: a pointer at the first row's centre lands in it.
        const first = await box(links[0]!);
        const onTop = await links[0]!.evaluate(
          (el, at) => el.contains(document.elementFromPoint(at.x, at.y)),
          { x: first.x + first.width / 2, y: first.y + first.height / 2 },
        );
        expect.soft(onTop, "the first row is under something").toBe(true);

        // Off the trigger first, or hover would hold it open past the Escape.
        await page.mouse.move(1, HEIGHT - 1);
        await page.keyboard.press("Escape");
        await expect(popup).toHaveCount(0);
        await expect(trigger).not.toHaveAttribute("aria-expanded", "true");
        await expect(trigger).toBeFocused();
      });
    }
  });
}
