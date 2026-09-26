import type { Page } from "@playwright/test";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Notes tab's list and pane (`campaign/NotesScreen.tsx`), at every width:
 * where the two columns stand, that the header lines up with them and its
 * controls do not collide, that a note chosen while the columns are stacked
 * brings the pane into view, and that a long body grows the page rather than
 * scrolling inside itself. All of it is layout, which jsdom does not compute.
 *
 * Read over the creator scenario's `noteShelf`: a read-aloud, a note of two
 * paragraphs, a shared house rule and an empty note.
 */

const notes = screens.find((screen) => screen.name === "notes")!;

/** Where the pane is once the window stops moving, and where it could be. */
const restingPlace = async (page: Page) => {
  // A smooth scroll is not a Web Animation, so `settle` does not wait for it.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const from = window.scrollY;
        setTimeout(() => resolve(window.scrollY === from), 150);
      }),
  );
  return page.locator('[data-slot="note-pane"]').evaluate((el) => ({
    top: el.getBoundingClientRect().top,
    chrome: Number.parseFloat(getComputedStyle(el).getPropertyValue("--chrome-height")),
    scrollY: window.scrollY,
    end: document.documentElement.scrollHeight - window.innerHeight,
  }));
};

/** The drawing's two columns: 280px of list, the 24px gap, 420px of pane. */
const TWO_COLUMNS = 280 + 24 + 420;

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("notes list and pane", async ({ app, page }) => {
      await app.open(notes);
      const list = page.locator('[data-slot="note-list"]');
      const pane = page.locator('[data-slot="note-pane"]');
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
        stacked ? "the pane is under the list" : "list and pane side by side",
        async () => {
          // The list takes a third of what is spare beside the pane, up to the
          // drawing's 380 and no further; stacked, it has the row to itself.
          const listWidth = Math.min(380, stacked ? room : 280 + (room - TWO_COLUMNS) / 3);
          expect.soft(listBox.width, "list width").toBeCloseTo(listWidth, 0);
          if (stacked) {
            expect.soft(paneBox.y, "pane top").toBeGreaterThanOrEqual(listBox.y + listBox.height);
            expect.soft(paneBox.width, "pane width").toBeCloseTo(room, 0);
          } else {
            expect.soft(paneBox.y, "pane top").toBeCloseTo(listBox.y, 0);
            expect.soft(paneBox.x, "pane left").toBeGreaterThan(listBox.x + listBox.width);
            expect.soft(paneBox.width, "pane width").toBeGreaterThanOrEqual(419.5);
          }
        },
      );

      await test.step("the search fills the list's width", async () => {
        const search = await box(list.locator('[data-slot="combobox-chips"]').first());
        expect.soft(search.width, "search width").toBeCloseTo(listBox.width, 0);
      });

      await test.step("the header lines up with the list, and its controls do not collide", async () => {
        const h1 = await box(page.locator('main [data-slot="page-heading"] h1'));
        expect.soft(h1.x, "h1 left").toBeCloseTo(listBox.x, 0);
        const create = await box(page.getByRole("button", { name: "New note" }));
        expect.soft(overlaps(h1, create), "New note overlaps the title").toBe(false);
        const main = await box(page.locator("main"));
        expect
          .soft(create.x + create.width, "New note right")
          .toBeLessThanOrEqual(main.x + main.width + 0.5);
      });

      await test.step("the pane stays inside the page", async () => {
        const main = await box(page.locator("main"));
        expect
          .soft(paneBox.x + paneBox.width, "pane right")
          .toBeLessThanOrEqual(main.x + main.width + 0.5);
      });

      await test.step("choosing a note shows it in the pane, in view", async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole("button", { name: /^Grusk, the toll-keeper/ }).click();
        await expect(pane).toHaveAccessibleName("Grusk, the toll-keeper");
        await expect(page).toHaveURL(/[?&]note=/);
        await app.settle();
        const at = await restingPlace(page);
        if (stacked) {
          const up = Math.abs(at.top - at.chrome) <= 1 || at.scrollY >= at.end - 1;
          expect.soft(up, `pane brought up (${JSON.stringify(at)})`).toBe(true);
          expect.soft(at.top, "pane top below the chrome").toBeGreaterThanOrEqual(at.chrome - 1);
        } else {
          expect.soft(at.scrollY, "the page did not scroll").toBe(0);
        }
      });

      await test.step("a long body grows the page, never scrolls inside itself", async () => {
        const body = pane.getByRole("textbox", { name: "Body" });
        const before = await page.evaluate(() => document.documentElement.scrollHeight);
        await body.fill(
          Array.from({ length: 40 }, (_, i) => `Line ${String(i + 1)} of what Grusk owes.`).join(
            "\n",
          ),
        );
        const grown = await body.evaluate((el) => ({
          scroll: el.scrollHeight,
          client: el.clientHeight,
          page: document.documentElement.scrollHeight,
        }));
        expect.soft(grown.scroll, "body scrollHeight").toBeLessThanOrEqual(grown.client + 1);
        expect.soft(grown.page, "the page grew").toBeGreaterThan(before);
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });
    });
  });
}
