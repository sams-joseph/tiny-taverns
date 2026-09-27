import type { Locator, Page } from "@playwright/test";
import { chronicleNightId } from "../../src/test/ids";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Chronicle (`chronicle/ChronicleScreen.tsx`), at every width: the nights
 * beside *Jump to* or alone once the columns would stack, *Jump to* with no
 * scroller of its own, a jump and a `?session=` link landing a night under the
 * chrome, and an opened night's encounter chips wrapping on a phone without
 * clipping. All of it is layout, which jsdom does not compute.
 *
 * Read over the creator scenario's two nights (`chronicle.fixtures.tsx`):
 * session 11 holds a kept beat, a shared one, and a conversation and a fight.
 */

const chronicle = screens.find((screen) => screen.name === "chronicle")!;
const playerChronicle = screens.find((screen) => screen.name === "player-chronicle")!;

/**
 * The aside is drawn at `@4xl` of the shell's `main` (896px of content), just
 * above where the Overview's two columns — 560 + 24 + 300 — would wrap.
 */
const ASIDE_FROM = 896;

/** Where a night's card rests once the window stops moving, and where it could be. */
const restingPlace = async (page: Page, card: Locator) => {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const from = window.scrollY;
        setTimeout(() => resolve(window.scrollY === from), 150);
      }),
  );
  return card.evaluate((el) => ({
    top: el.getBoundingClientRect().top,
    chrome: Number.parseFloat(getComputedStyle(el).getPropertyValue("--chrome-height")),
    scrollY: window.scrollY,
    end: document.documentElement.scrollHeight - window.innerHeight,
  }));
};

/** Pinned under the chrome, or as far up as the page can scroll it. */
const broughtUp = (at: Awaited<ReturnType<typeof restingPlace>>) =>
  Math.abs(at.top - at.chrome) <= 1 || at.scrollY >= at.end - 1;

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("chronicle columns, jump to and chips", async ({ app, page }) => {
      await app.open(chronicle);
      const newest = page.locator("#session-12");
      const older = page.locator("#session-11");
      await expect(newest).toBeVisible();
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      const main = page.locator("main");
      const room = await main.evaluate((el) => {
        const style = getComputedStyle(el);
        return (
          el.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight)
        );
      });
      const beside = room >= ASIDE_FROM;
      const aside = page.locator("main aside");
      const index = page.getByRole("list", { name: "Jump to" });

      await test.step(
        beside ? "the nights and Jump to side by side" : "the nights alone, no Jump to",
        async () => {
          const nights = await box(newest);
          if (beside) {
            await expect(index).toBeVisible();
            const side = await box(aside);
            expect.soft(side.y, "aside top").toBeCloseTo(nights.y, 0);
            expect.soft(side.x, "aside left").toBeGreaterThan(nights.x + nights.width);
            expect.soft(side.width, "aside width").toBeLessThanOrEqual(340.5);
            expect.soft(nights.width, "nights width").toBeGreaterThanOrEqual(559.5);
          } else {
            // Stacked, it would sit after every night it indexes.
            await expect(aside).toBeHidden();
            const frame = await box(newest.locator(".."));
            expect.soft(nights.width, "nights width").toBeCloseTo(frame.width, 0);
          }
        },
      );

      await test.step("the header's left edge is the nights'", async () => {
        const h1 = await box(page.locator('main [data-slot="page-heading"] h1'));
        expect.soft(h1.x, "h1 left").toBeCloseTo((await box(newest)).x, 0);
      });

      if (beside) {
        await test.step("Jump to has no scroller of its own", async () => {
          const overflows = await aside.evaluate((el) =>
            [el, ...el.querySelectorAll("*")].map((node) => getComputedStyle(node).overflowY),
          );
          for (const overflow of overflows) {
            expect
              .soft(overflow === "auto" || overflow === "scroll", "an inner scroller")
              .toBe(false);
          }
          const position = await aside.evaluate((el) => getComputedStyle(el).position);
          expect.soft(position, "aside position").not.toBe("sticky");
        });

        await test.step("a jump opens the night and lands it under the chrome", async () => {
          await page.evaluate(() => window.scrollTo(0, 0));
          await index.getByRole("button", { name: /Session 11/ }).click();
          await expect(older.getByRole("button", { name: /Session 11/ })).toHaveAttribute(
            "aria-expanded",
            "true",
          );
          await app.settle();
          const at = await restingPlace(page, older);
          expect.soft(broughtUp(at), `night brought up (${JSON.stringify(at)})`).toBe(true);
          expect.soft(at.top, "night top below the chrome").toBeGreaterThanOrEqual(at.chrome - 1);
        });
      }

      await test.step("an opened night's chips wrap inside it without clipping", async () => {
        const header = older.getByRole("button", { name: /Session 11/ });
        if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
        const chips = older.locator('[data-slot="encounter-chip"]');
        await expect(chips).toHaveCount(2);
        const fit = await older.evaluate((card) => {
          const edge = card.getBoundingClientRect();
          return [...card.querySelectorAll('[data-slot="encounter-chip"]')].map((chip) => {
            const r = chip.getBoundingClientRect();
            return {
              right: r.right,
              edge: edge.right,
              clipped:
                chip.scrollWidth > chip.clientWidth + 0.5 ||
                chip.scrollHeight > chip.clientHeight + 0.5,
            };
          });
        });
        for (const chip of fit) {
          expect.soft(chip.clipped, "a chip clips its name").toBe(false);
          expect.soft(chip.right, "chip right").toBeLessThanOrEqual(chip.edge + 0.5);
        }
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });
    });

    test("a ?session= link opens that night under the chrome", async ({ app, page }) => {
      // From cold, as the Encounters preview's *View log* arrives.
      await app.open({ ...chronicle, path: `${chronicle.path}?session=${chronicleNightId}` });
      const older = page.locator("#session-11");
      await expect(older.getByRole("button", { name: /Session 11/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(
        page.locator("#session-12").getByRole("button", { name: /Session 12/ }),
      ).toHaveAttribute("aria-expanded", "false");
      await app.settle();
      const at = await restingPlace(page, older);
      expect.soft(broughtUp(at), `night brought up (${JSON.stringify(at)})`).toBe(true);
      expect.soft(at.top, "night top below the chrome").toBeGreaterThanOrEqual(at.chrome - 1);
    });

    test("the player's chronicle draws the same nights", async ({ app, page }) => {
      await app.open(playerChronicle);
      const older = page.locator("#session-11");
      await older.getByRole("button", { name: /Session 11/ }).click();
      const chips = older.locator('[data-slot="encounter-chip"]');
      await expect(chips).toHaveCount(2);
      await expect(older.getByText("DM only")).toHaveCount(0);
      await expect(older.locator("a")).toHaveCount(0);
      const { scrollWidth, clientWidth } = await app.widths();
      expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
    });
  });
}
