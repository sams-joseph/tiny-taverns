import type { Page } from "@playwright/test";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Encounters tab's list and preview (`campaign/EncountersScreen.tsx`), at
 * every width: where the two columns stand, that the header lines up with
 * them, that the creature table fits a phone, and that a row chosen while the
 * columns are stacked brings the preview into view. All of it is layout, which
 * jsdom does not compute.
 *
 * Read over the creator scenario's shelf (`encounterShelf`): an encounter of
 * every kind, two played, and the fight on the table.
 */

const encounters = screens.find((screen) => screen.name === "encounters")!;
const overview = screens.find((screen) => screen.name === "overview")!;

/** Where the preview is once the window stops moving, and where it could be. */
const restingPlace = async (page: Page) => {
  // A smooth scroll is not a Web Animation, so `settle` does not wait for it:
  // wait for the window to stop moving.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const from = window.scrollY;
        setTimeout(() => resolve(window.scrollY === from), 150);
      }),
  );
  return page.locator('[data-slot="encounter-preview"]').evaluate((el) => ({
    top: el.getBoundingClientRect().top,
    chrome: Number.parseFloat(getComputedStyle(el).getPropertyValue("--chrome-height")),
    scrollY: window.scrollY,
    end: document.documentElement.scrollHeight - window.innerHeight,
    stacked:
      el.getBoundingClientRect().top >=
      el.parentElement!.firstElementChild!.getBoundingClientRect().bottom - 1,
  }));
};

/** Stacked, the preview is pinned under the chrome, or as far up as the page can scroll it. */
const broughtUp = (at: Awaited<ReturnType<typeof restingPlace>>) =>
  Math.abs(at.top - at.chrome) <= 1 || at.scrollY >= at.end - 1;

/** The drawing's two columns: 260px of list, the 24px gap, 420px of preview. */
const TWO_COLUMNS = 260 + 24 + 420;

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("encounters list and preview", async ({ app, page }) => {
      await app.open(encounters);
      const list = page.locator('[data-slot="encounter-list"]');
      const pane = page.locator('[data-slot="encounter-preview"]');
      await expect(pane).toBeVisible();
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      const room = await list.evaluate((el) => el.parentElement!.clientWidth);
      const stacked = room < TWO_COLUMNS;
      const listBox = await box(list);
      const paneBox = await box(pane);

      await test.step(
        stacked ? "the preview is under the list" : "list and preview side by side",
        async () => {
          // The list takes a third of what is spare beside the preview, up to
          // the drawing's 360 and no further; stacked, it has the row to itself.
          const listWidth = Math.min(360, stacked ? room : 260 + (room - TWO_COLUMNS) / 3);
          expect.soft(listBox.width, "list width").toBeCloseTo(listWidth, 0);
          if (stacked) {
            expect
              .soft(paneBox.y, "preview top")
              .toBeGreaterThanOrEqual(listBox.y + listBox.height);
            expect.soft(paneBox.width, "preview width").toBeCloseTo(room, 0);
          } else {
            expect.soft(paneBox.y, "preview top").toBeCloseTo(listBox.y, 0);
            expect.soft(paneBox.x, "preview left").toBeGreaterThan(listBox.x + listBox.width);
            expect.soft(listBox.width, "list width").toBeLessThanOrEqual(360.5);
            expect.soft(listBox.width, "list width").toBeGreaterThanOrEqual(259.5);
            expect.soft(paneBox.width, "preview width").toBeGreaterThanOrEqual(419.5);
          }
        },
      );

      await test.step("the header's left edge is the list's", async () => {
        const h1 = await box(page.locator('main [data-slot="page-heading"] h1'));
        expect.soft(h1.x, "h1 left").toBeCloseTo(listBox.x, 0);
        const main = await box(page.locator("main"));
        // Centred: whatever is left over either side of the frame is equal.
        const frame = await box(page.locator('main [data-slot="page-heading"]').locator(".."));
        expect
          .soft(frame.x - main.x, "frame's left margin")
          .toBeCloseTo(main.x + main.width - (frame.x + frame.width), 0);
      });

      await test.step("the preview stays inside the page", async () => {
        const main = await box(page.locator("main"));
        expect
          .soft(paneBox.x + paneBox.width, "preview right")
          .toBeLessThanOrEqual(main.x + main.width + 0.5);
      });

      await test.step("choosing a row shows its preview, in view", async () => {
        // A row near the top, from the top: stacked, the preview is then a
        // screen below the row, and only the page scrolling brings it up.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole("button", { name: /^Whatever is in the crate/ }).click();
        await expect(pane).toHaveAccessibleName("Whatever is in the crate");
        await expect(page).toHaveURL(/[?&]encounter=/);
        await app.settle();
        const at = await restingPlace(page);
        if (stacked) {
          expect.soft(broughtUp(at), `preview brought up (${JSON.stringify(at)})`).toBe(true);
          expect.soft(at.top, "preview top below the chrome").toBeGreaterThanOrEqual(at.chrome - 1);
        } else {
          // Beside the list it was already in view: the page does not move.
          expect.soft(at.scrollY, "the page did not scroll").toBe(0);
        }
      });

      await test.step("the creature table fits, names readable", async () => {
        // The hag's roster has the longest names on the shelf.
        await page.getByRole("button", { name: /^The hag's bargain/ }).click();
        await expect(pane).toHaveAccessibleName("The hag's bargain");
        const table = pane.locator('[data-slot="encounter-creatures"]');
        await expect(table).toBeVisible();
        const fit = await table.evaluate((el) => ({
          table: el.getBoundingClientRect().width,
          box: el.parentElement!.clientWidth,
          names: [...el.querySelectorAll("tbody th")].map((th) => ({
            width: th.getBoundingClientRect().width,
            clipped: th.scrollWidth > th.clientWidth + 0.5,
          })),
        }));
        expect.soft(fit.table, "table width").toBeLessThanOrEqual(fit.box + 0.5);
        for (const name of fit.names) {
          expect.soft(name.clipped, "a creature's name is clipped").toBe(false);
          expect.soft(name.width, "a creature's name column").toBeGreaterThanOrEqual(96);
        }
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("the battle map is a 24:9 band the pane's width, under its header", async () => {
        // The ambush is the shelf's one encounter with a picture.
        await page.getByRole("button", { name: /^Ambush in the reeds/ }).click();
        await expect(pane).toHaveAccessibleName("Ambush in the reeds");
        const band = pane.locator('[data-slot="hob-cover"]');
        await expect(band.locator("img[data-loaded]")).toHaveCount(1);
        // Clear of the sticky chrome, and still: a press is measured where it lands.
        await band.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        const fit = await band.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const img = el.querySelector("img")!.getBoundingClientRect();
          const header = el.parentElement!.querySelector("header")!.getBoundingClientRect();
          const link = el.querySelector("a")!;
          const middle = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            width: r.width,
            height: r.height,
            room: el.parentElement!.clientWidth,
            top: r.top,
            headerBottom: header.bottom,
            img: { width: img.width, height: img.height },
            // A press anywhere on the picture lands on its link.
            linked: middle === link,
          };
        });
        expect.soft(fit.width, "band width").toBeCloseTo(fit.room, 0);
        expect.soft(fit.width / fit.height, "band aspect").toBeCloseTo(24 / 9, 1);
        expect.soft(fit.top, "band top").toBeCloseTo(fit.headerBottom, 0);
        expect.soft(fit.img.width, "picture width").toBeCloseTo(fit.width, 0);
        expect.soft(fit.img.height, "picture height").toBeCloseTo(fit.height - 1, 0);
        expect.soft(fit.linked, "the band's middle is its link").toBe(true);
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });
    });

    test("an Overview encounter row opens it on the Encounters tab", async ({ app, page }) => {
      await app.open(overview);
      const row = page.getByRole("listitem").filter({ hasText: "Whatever is in the crate" });
      // Its own Edit sits above the overlay: what a press on it lands on is the
      // Edit, which opens the encounter builder rather than the Encounters tab.
      const editButton = row.getByRole("button", { name: "Edit Whatever is in the crate" });
      await expect(editButton).toHaveAttribute("href", /\/encounters\/[^/]+\/edit$/);
      // In view and clear of the sticky chrome: on a phone the read-aloud
      // inset above the rows puts them below the first screen.
      await editButton.evaluate((el) =>
        el.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      const editBox = await box(editButton);
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("aria-label"),
        { x: editBox.x + editBox.width / 2, y: editBox.y + editBox.height / 2 },
      );
      expect.soft(hit, "what a press on Edit lands on").toBe("Edit Whatever is in the crate");

      // Anywhere on the row's face, not only its name: the detail line under
      // it, where what the pointer hits is the name's overlay.
      const rowBox = await box(row);
      const detail = await box(row.getByText(/Unrated/));
      await row.click({
        position: { x: detail.x - rowBox.x + 4, y: detail.y - rowBox.y + detail.height / 2 },
      });

      await expect(page).toHaveURL(/\/encounters\?encounter=/);
      const pane = page.locator('[data-slot="encounter-preview"]');
      await expect(pane).toHaveAccessibleName("Whatever is in the crate");
      await app.settle();
      const at = await restingPlace(page);
      if (at.stacked)
        expect.soft(broughtUp(at), `preview brought up (${JSON.stringify(at)})`).toBe(true);
    });
  });
}
